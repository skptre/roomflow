import RoomPlan
import SwiftUI

struct HomeView: View {
    @State private var isScanning = false
    @State private var showUnsupported = false
    @State private var pendingScan: CapturedRoom?
    /// The untouched RoomPlan result, kept for saving/export later.
    @State private var latestCapture: CapturedRoom?
    /// Our editable model built from `latestCapture` (or the debug sample room).
    @State private var latestRoom: RoomModel?
    @State private var latestRoomIsSample = false
    @State private var showSummary = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.rfBackground.ignoresSafeArea()

                VStack(spacing: 12) {
                    Spacer()

                    Text("ROOMFLOW")
                        .font(.system(size: 40, weight: .semibold))
                        .tracking(8)
                        .foregroundStyle(.white)
                    Text("Your room, with anything you find.")
                        .font(.subheadline)
                        .foregroundStyle(Color.rfSecondaryText)

                    Spacer()

                    Button("Scan a Room", systemImage: "viewfinder") {
                        if RoomScanService.isSupported {
                            isScanning = true
                        } else {
                            showUnsupported = true
                        }
                    }
                    .buttonStyle(RFButtonStyle())

                    Button("Saved Room", systemImage: "square.stack.3d.up") {}
                        .buttonStyle(RFButtonStyle(prominent: false))
                        .disabled(true)
                    Text("Saved rooms are coming soon.")
                        .font(.footnote)
                        .foregroundStyle(Color.rfSecondaryText)

                    #if DEBUG
                    Button("Load sample room (debug)") {
                        latestRoom = SampleRoom.make()
                        latestRoomIsSample = true
                        showSummary = true
                    }
                    .font(.footnote)
                    .padding(.top, 8)
                    #endif
                }
                .padding(24)
            }
            .navigationDestination(isPresented: $showSummary) {
                if let latestRoom {
                    ScanSummaryView(room: latestRoom, isSample: latestRoomIsSample)
                }
            }
        }
        .fullScreenCover(isPresented: $isScanning, onDismiss: openPendingScan) {
            RoomScanView { room in
                pendingScan = room
                isScanning = false
            }
        }
        .alert("Scanning isn't available", isPresented: $showUnsupported) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(RoomScanService.Failure.unsupportedDevice.message)
        }
    }

    // Push the results only after the scanner cover has fully dismissed,
    // so the two transitions don't fight each other.
    private func openPendingScan() {
        guard let pendingScan else { return }
        latestCapture = pendingScan
        latestRoom = RoomPlanConverter.convert(pendingScan)
        latestRoomIsSample = false
        self.pendingScan = nil
        showSummary = true
    }
}

#Preview {
    HomeView()
}
