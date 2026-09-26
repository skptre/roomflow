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
        state = .scanning
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }

    /// Stops capturing. RoomPlan then runs its final processing pass and calls `didPresent`.
    func finish() {
        guard state == .scanning else { return }
        state = .processing
        captureView.captureSession.stop()
    }

    /// Abandons the scan. Safe to call in any state.
    func cancel() {
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
            state = .failed(.scanFailed(error.localizedDescription))
            return false
        }
        return true
    }

    // The processed, final room. Only this result is treated as a complete scan.
    func captureView(didPresent processedResult: CapturedRoom, error: (any Error)?) {
        guard state == .processing || state == .scanning else { return }
        if let error {
            state = .failed(.scanFailed(error.localizedDescription))
            return
        }
        capturedRoom = processedResult
        state = .finished
        print("[RoomFlow] Scan finished: \(processedResult.walls.count) walls, \(processedResult.doors.count) doors, \(processedResult.windows.count) windows, \(processedResult.objects.count) objects")
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
