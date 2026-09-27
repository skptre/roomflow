import RoomPlan
import SwiftUI
import UIKit

/// Full-screen RoomPlan scanning experience with RoomFlow's controls layered on top.
struct RoomScanView: View {
    /// Keep calibrated reference photos during the scan (opt-in).
    var capturePhotos = false
    let onComplete: (ScanCaptureResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var scanner = RoomScanService()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if RoomScanService.isSupported {
                RoomCaptureViewContainer(captureView: scanner.captureView)
                    .ignoresSafeArea()
            }

            VStack {
                HStack {
                    Button("Cancel") {
                        scanner.cancel()
                        dismiss()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                    Spacer()
                }
                if scanner.state == .scanning, let hint = scanner.focusHint {
                    ScanFocusHintView(hint: hint)
                        .padding(.top, 8)
                        .transition(.opacity)
                }
                Spacer()
                bottomPanel
            }
            .padding(20)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: scanner.focusHint?.objectId)
        }
        .task {
            scanner.capturePhotos = capturePhotos
            await scanner.start()
        }
        .onDisappear { scanner.cancel() }
    }

    @ViewBuilder
    private var bottomPanel: some View {
        switch scanner.state {
        case .idle:
            ProgressView()
        case .scanning:
            VStack(spacing: 12) {
                statusText(capturePhotos
                    ? "Walk slowly around the room. When furniture is found, hold the phone steady on it for a moment."
                    : "Walk slowly around the room. Point at every wall, door, window, and piece of furniture.")
                Button("Done Scanning") { scanner.finish() }
                    .buttonStyle(RFButtonStyle())
            }
        case .processing:
            HStack(spacing: 10) {
                ProgressView()
                Text("Building your room…")
            }
            .padding()
            .background(.ultraThinMaterial, in: Capsule())
        case .finished:
            Button("View Room") {
                if let room = scanner.capturedRoom {
                    onComplete(ScanCaptureResult(room: room, colors: scanner.colorEstimates, photos: scanner.photos,
                                                 wallArt: scanner.wallArt, wallArtDirectory: scanner.wallArtDirectory))
                }
            }
            .buttonStyle(RFButtonStyle())
        case .failed(let failure):
            VStack(spacing: 12) {
                statusText(failure.message)
                if failure == .cameraAccessDenied, let settings = URL(string: UIApplication.openSettingsURLString) {
                    Button("Open Settings") { openURL(settings) }
                        .buttonStyle(RFButtonStyle())
                }
                Button("Close") { dismiss() }
                    .buttonStyle(RFButtonStyle(prominent: false))
            }
        }
    }

    private func statusText(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .multilineTextAlignment(.center)
            .padding()
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
    }
}

/// Hosts the service-owned RoomCaptureView so SwiftUI re-renders never recreate the AR view.
private struct RoomCaptureViewContainer: UIViewRepresentable {
    let captureView: RoomCaptureView

    func makeUIView(context: Context) -> RoomCaptureView { captureView }
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}
