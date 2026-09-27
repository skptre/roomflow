import AVFoundation
import SwiftUI
import VisionKit

/// Scan the code shown in the browser, then connect or send the saved raw RoomPlan scan.
struct BrowserPairingView: View {
    var rawCapture: RawCapture? = nil
    @EnvironmentObject private var pairing: BrowserPairingManager
    @Environment(\.dismiss) private var dismiss
    @State private var candidate: BrowserPairing?
    @State private var pastedCode = ""
    @State private var error: String?
    @State private var sending = false
    @State private var cameraReady = false
    @State private var cameraChecked = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if candidate == nil {
                    if cameraReady {
                        PairCodeCamera { text in
                            if let code = BrowserPairing.parse(text) { candidate = code; error = nil }
                            else { error = "This is not a Roomflow pairing code." }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                        .frame(maxHeight: 340)
                    } else if !cameraChecked {
                        ProgressView("Opening camera…")
                            .frame(maxWidth: .infinity, minHeight: 220)
                    } else {
                        ContentUnavailableView("Camera scanning unavailable", systemImage: "qrcode.viewfinder",
                                               description: Text("Allow camera access or paste a pairing link below."))
                    }
                    TextField("Paste pairing link", text: $pastedCode)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { candidate = BrowserPairing.parse(pastedCode) }
                    if !pastedCode.isEmpty {
                        Button("Use pairing link") {
                            candidate = BrowserPairing.parse(pastedCode)
                            if candidate == nil { error = "This is not a Roomflow pairing code." }
                        }
                    }
                } else if let candidate {
                    Image(systemName: "desktopcomputer")
                        .font(.system(size: 58, weight: .light))
                        .foregroundStyle(Color.rfAccent)
                    Text("Connect to \(candidate.displayHost)")
                        .font(.system(size: 27, weight: .medium))
                        .foregroundStyle(Color.rfInk)
                    Text(rawCapture == nil
                         ? "After your scan, Roomflow will send its original room data to this browser."
                         : "Send this saved scan to the waiting browser now.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Color.rfSecondaryText)
                    Button(rawCapture == nil ? "Connect to browser" : "Send scan to browser") {
                        pairing.connect(candidate)
                        if let rawCapture {
                            sending = true
                            Task {
                                await pairing.send(rawCapture.data)
                                sending = false
                                if case .sent = pairing.transfer { dismiss() }
                                else if case .failed(let message) = pairing.transfer { error = message }
                            }
                        } else { dismiss() }
                    }
                    .buttonStyle(RFButtonStyle())
                    .disabled(sending)
                    Button("Scan a different code") { self.candidate = nil }
                        .foregroundStyle(Color.rfAccent)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
                }
                Spacer(minLength: 0)
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(Color.rfBackground)
            .navigationTitle("Connect to browser")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
        }
        .preferredColorScheme(.light)
        .task {
            guard DataScannerViewController.isSupported else { cameraChecked = true; return }
            let access = AVCaptureDevice.authorizationStatus(for: .video)
            let granted: Bool
            if access == .authorized { granted = true }
            else if access == .notDetermined { granted = await AVCaptureDevice.requestAccess(for: .video) }
            else { granted = false }
            cameraReady = granted && DataScannerViewController.isAvailable
            cameraChecked = true
        }
    }
}

private struct PairCodeCamera: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])],
                                                qualityLevel: .balanced, recognizesMultipleItems: false,
                                                isHighFrameRateTrackingEnabled: false,
                                                isPinchToZoomEnabled: false, isGuidanceEnabled: true,
                                                isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        DispatchQueue.main.async { try? scanner.startScanning() }
        return scanner
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}
    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) {
        controller.stopScanning()
    }

    @MainActor final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var captured = false
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }
        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            guard !captured else { return }
            for item in addedItems {
                if case .barcode(let barcode) = item, let value = barcode.payloadStringValue {
                    captured = true
                    dataScanner.stopScanning()
                    onCode(value)
                    break
                }
            }
        }
    }
}
