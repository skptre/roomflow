import ARKit
import AVFoundation
import Foundation
import Observation
import RoomPlan

/// Owns the RoomPlan capture view and exposes scan progress to SwiftUI.
///
/// Flow: `start()` → user walks the room → `finish()` → RoomPlan processes
/// the raw capture → `captureView(didPresent:)` delivers the final `CapturedRoom`.
@Observable
final class RoomScanService: NSObject, RoomCaptureViewDelegate {
    enum Failure: Equatable {
        case unsupportedDevice
        case cameraAccessDenied
        case scanFailed(String)

        var message: String {
            switch self {
            case .unsupportedDevice:
                "Room scanning needs an iPhone or iPad with a LiDAR Scanner (iPhone 12 Pro or newer Pro model)."
            case .cameraAccessDenied:
                "RoomFlow needs camera access to scan. Turn it on in Settings › RoomFlow › Camera."
            case .scanFailed(let reason):
                "The scan couldn't be completed. \(reason)"
            }
        }
    }

    enum State: Equatable {
        case idle
        case scanning
        case processing
        case finished
        case failed(Failure)
    }

    /// False on the Simulator and on devices without LiDAR.
    static var isSupported: Bool { RoomCaptureSession.isSupported }

    private(set) var state: State = .idle
    private(set) var capturedRoom: CapturedRoom?
    /// Camera-sampled colors for `capturedRoom`; empty if sampling found nothing reliable.
    private(set) var colorEstimates = RoomColorEstimates.none

    /// Reference photos chosen for `capturedRoom`; empty unless photo capture was on.
    private(set) var photos: [RoomPhotoEvidence] = []
    /// Whether to keep calibrated reference photos during the scan (opt-in).
    @ObservationIgnored var capturePhotos = false

    @ObservationIgnored private let colorSampler = RoomColorSampler()
    @ObservationIgnored private var colorSampling: Task<Void, Never>?
    @ObservationIgnored private let evidenceRecorder = RoomEvidenceRecorder()
    /// Identifies this scan's photos so late work from an older session is never attached.
    @ObservationIgnored private var sessionID = UUID()
    /// Live detected objects during a scan; see LiveRoomObserver.
    @ObservationIgnored private let liveObserver = LiveRoomObserver()

    /// The furniture currently framed and its photo progress; nil unless photo capture is on and something is framed.
    private(set) var focusHint: FocusHint?
    @ObservationIgnored private var focusTracker = ObjectFocusTracker()
    @ObservationIgnored private var sampleTick = 0

    // Built lazily so unsupported devices never create an AR view.
    // RoomCaptureView bundles the camera feed, coaching UI, and its own RoomCaptureSession.
    @ObservationIgnored
    private(set) lazy var captureView: RoomCaptureView = {
        let view = RoomCaptureView(frame: .zero)
        view.delegate = self
        return view
    }()

    override init() {
        super.init()
    }

    // RoomCaptureViewDelegate inherits NSCoding; RoomFlow never archives this object.
    required init?(coder: NSCoder) {
        super.init()
    }

    func encode(with coder: NSCoder) {}

    // MARK: - Controls

    func start() async {
        guard state == .idle else { return }
        guard Self.isSupported else {
            state = .failed(.unsupportedDevice)
            return
        }
        guard await Self.requestCameraAccess() else {
            state = .failed(.cameraAccessDenied)
            return
        }
        capturedRoom = nil
        colorEstimates = .none
        photos = []
        colorSampler.reset()
        focusTracker.reset()
        focusHint = nil
        sampleTick = 0
        sessionID = UUID()
        if capturePhotos { evidenceRecorder.start(sessionID: sessionID) }
        state = .scanning
        liveObserver.install(on: captureView.captureSession)
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
        startColorSampling()
    }

    /// Stops capturing. RoomPlan then runs its final processing pass and calls `didPresent`.
    func finish() {
        guard state == .scanning else { return }
        stopColorSampling()
        state = .processing
        focusHint = nil
        captureView.captureSession.stop()
    }

    /// Abandons the scan. Safe to call in any state.
    func cancel() {
        stopColorSampling()
        colorSampler.reset()
        evidenceRecorder.cancel(sessionID: sessionID)
        focusHint = nil
        if state == .scanning {
            captureView.captureSession.stop()
        }
        if state == .scanning || state == .processing {
            state = .idle
        }
    }

    // MARK: - RoomCaptureViewDelegate

    // Called after `stop()` (or when the session ends on its own) with the raw capture data.
    // Returning true tells RoomCaptureView to process it and show its built-in result preview.
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: (any Error)?) -> Bool {
        if let error {
            stopEvidence()
            state = .failed(.scanFailed(error.localizedDescription))
            return false
        }
        return true
    }

    // The processed, final room. Only this result is treated as a complete scan.
    func captureView(didPresent processedResult: CapturedRoom, error: (any Error)?) {
        guard state == .processing || state == .scanning else { return }
        if let error {
            stopEvidence()
            state = .failed(.scanFailed(error.localizedDescription))
            return
        }
        stopColorSampling()
        colorEstimates = colorSampler.estimate(for: processedResult)
        colorSampler.reset()
        capturedRoom = processedResult
        liveObserver.logFinalOverlap(with: processedResult)
        // Photos are optional: any problem finishing them leaves an empty list, never a failed scan.
        let session = sessionID
        Task {
            let chosen = capturePhotos ? ((try? await evidenceRecorder.finish(sessionID: session)) ?? []) : []
            guard session == sessionID, state == .processing || state == .scanning else { return }
            photos = chosen
            state = .finished
        }
        print("[RoomFlow] Scan finished: \(processedResult.walls.count) walls, \(processedResult.doors.count) doors, \(processedResult.windows.count) windows, \(processedResult.objects.count) objects")
    }

    // MARK: - Color sampling

    // Every 250 ms: focus hints (pose only). Every third tick (~750 ms, as before): colors and ambient photos.
    private func startColorSampling() {
        colorSampling?.cancel()
        colorSampling = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if let frame = self.captureView.captureSession.arSession.currentFrame {
                    if self.sampleTick.isMultiple(of: 3) {
                        self.colorSampler.capture(frame)
                        if self.capturePhotos {
                            self.evidenceRecorder.consider(frame: frame, sessionID: self.sessionID)
                        }
                    }
                    if self.capturePhotos { self.updateFocus(with: frame) }
                    self.sampleTick += 1
                }
                try? await Task.sleep(for: .milliseconds(250))
            }
        }
    }

    /// Runs the focus tracker on `frame`, takes a focused photo when one is due, and publishes the hint.
    private func updateFocus(with frame: ARFrame) {
        let snapshot = RoomEvidenceRecorder.snapshot(of: frame)
        let depthMap = (frame.sceneDepth ?? frame.smoothedSceneDepth)?.depthMap
        let objects = liveObserver.latestObjects()
        var hint: FocusHint?
        switch focusTracker.update(objects: objects, camera: snapshot,
                                   depthAt: { u, v in Self.depth(in: depthMap, u: u, v: v) }) {
        case .none:
            hint = nil
        case .hint(let current):
            hint = current
        case .shoot(let current):
            hint = current
            if let object = objects.first(where: { $0.sourceId == current.objectId }),
               evidenceRecorder.captureFocused(frame: frame, objectId: current.objectId, sessionID: sessionID) {
                focusTracker.recordShot(objectId: current.objectId, cameraToWorld: snapshot.cameraToWorld,
                                        objectCenter: object.center)
                hint?.shotsTaken += 1
                hint?.dwellProgress = 0
            }
        }
        // Publish only real changes so SwiftUI isn't redrawn every tick for nothing.
        if hint != focusHint { focusHint = hint }
    }

    /// LiDAR depth in meters at a normalized, top-left-origin image point; nil without depth or for invalid values.
    private static func depth(in map: CVPixelBuffer?, u: Double, v: Double) -> Float? {
        guard let map else { return nil }
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return nil }
        let width = CVPixelBufferGetWidth(map), height = CVPixelBufferGetHeight(map)
        let x = min(width - 1, max(0, Int(u * Double(width))))
        let y = min(height - 1, max(0, Int(v * Double(height))))
        let row = base.advanced(by: y * CVPixelBufferGetBytesPerRow(map)).assumingMemoryBound(to: Float32.self)
        let value = row[x]
        return value.isFinite && value > 0 ? value : nil
    }

    private func stopColorSampling() {
        colorSampling?.cancel()
        colorSampling = nil
    }

    /// Failure path: stop sampling and drop this session's unfinished photos.
    private func stopEvidence() {
        stopColorSampling()
        colorSampler.reset()
        evidenceRecorder.cancel(sessionID: sessionID)
        focusHint = nil
    }

    // MARK: - Permissions

    private static func requestCameraAccess() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            true
        case .notDetermined:
            await AVCaptureDevice.requestAccess(for: .video)
        default:
            false
        }
    }
}
