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
    #if DEBUG
    /// SPIKE: logs live detected objects; see `LiveRoomObserver`.
    @ObservationIgnored private let liveObserver = LiveRoomObserver()
    #endif

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
        sessionID = UUID()
        if capturePhotos { evidenceRecorder.start(sessionID: sessionID) }
        state = .scanning
        #if DEBUG
        liveObserver.install(on: captureView.captureSession)
        #endif
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
        startColorSampling()
    }

    /// Stops capturing. RoomPlan then runs its final processing pass and calls `didPresent`.
    func finish() {
        guard state == .scanning else { return }
        stopColorSampling()
        state = .processing
        captureView.captureSession.stop()
    }

    /// Abandons the scan. Safe to call in any state.
    func cancel() {
        stopColorSampling()
        colorSampler.reset()
        evidenceRecorder.cancel(sessionID: sessionID)
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
        #if DEBUG
        liveObserver.logFinalOverlap(with: processedResult)
        #endif
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

    // Grabs a downscaled camera frame a little faster than once a second while scanning.
    private func startColorSampling() {
        colorSampling?.cancel()
        colorSampling = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if let frame = self.captureView.captureSession.arSession.currentFrame {
                    self.colorSampler.capture(frame)
                    if self.capturePhotos {
                        self.evidenceRecorder.consider(frame: frame, sessionID: self.sessionID)
                    }
                }
                try? await Task.sleep(for: .milliseconds(750))
            }
        }
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
