import RoomPlan
import SwiftUI
import UIKit

/// Full-screen RoomPlan scanning experience with RoomFlow's controls layered on top.
struct RoomScanView: View {
    let onComplete: (CapturedRoom, RoomColorEstimates) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
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
                Spacer()
                bottomPanel
            }
            .padding(20)
        }
        .task { await scanner.start() }
        .onDisappear { scanner.cancel() }
    }

    @ViewBuilder
    private var bottomPanel: some View {
        switch scanner.state {
        case .idle:
            ProgressView()
        case .scanning:
            VStack(spacing: 12) {
                statusText("Walk slowly around the room. Point at every wall, door, window, and piece of furniture.")
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
                    onComplete(room, scanner.colorEstimates)
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
