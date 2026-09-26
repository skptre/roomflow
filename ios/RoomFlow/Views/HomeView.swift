import RoomPlan
import SwiftUI

struct HomeView: View {
    @State private var isScanning = false
    @State private var showUnsupported = false
    @State private var pendingScan: (room: CapturedRoom, colors: RoomColorEstimates)?
    /// The untouched RoomPlan result, kept for saving/export later.
    @State private var latestCapture: CapturedRoom?
    /// Camera colors for `latestCapture`; exported separately, never inside the raw file.
    @State private var latestColorEstimates: RoomColorEstimates?
    /// Our editable model built from `latestCapture` (or a debug room).
    @State private var latestRoom: RoomModel?
    @State private var latestRoomIsSample = false
    @State private var showEditor = false

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
                    debugMenu
                    #endif
                }
                .padding(24)
            }
            .navigationDestination(isPresented: $showEditor) {
                if let latestRoom {
                    RoomEditorView(room: latestRoom, isSample: latestRoomIsSample,
                                   capture: latestCapture, colors: latestColorEstimates)
                        .id(latestRoom.id)
                }
            }
        }
        .fullScreenCover(isPresented: $isScanning, onDismiss: openPendingScan) {
            RoomScanView { room, colors in
                pendingScan = (room, colors)
                isScanning = false
            }
        }
        .alert("Scanning isn't available", isPresented: $showUnsupported) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(RoomScanService.Failure.unsupportedDevice.message)
        }
    }

    // Open the editor only after the scanner cover has fully dismissed,
    // so the two transitions don't fight each other.
    private func openPendingScan() {
        guard let pendingScan else { return }
        latestCapture = pendingScan.room
        latestColorEstimates = pendingScan.colors
        latestRoom = RoomPlanConverter.convert(pendingScan.room, colors: pendingScan.colors)
        latestRoomIsSample = false
        self.pendingScan = nil
        showEditor = true
    }

    #if DEBUG
    /// Loads the synthetic sample, or any room JSON copied into the app's Documents folder
    /// (e.g. a real scan shared from the phone), so the editor can be tested in the Simulator.
    private var debugMenu: some View {
        Menu("Debug rooms") {
            Button("Sample room") { open(SampleRoom.make(), isSample: true) }
            ForEach(documentRoomFiles(), id: \.self) { url in
                Button(url.lastPathComponent) {
                    if let data = try? Data(contentsOf: url),
                       let room = try? RoomModel.jsonDecoder.decode(RoomModel.self, from: data) {
                        open(room, isSample: false)
                    }
                }
            }
        }
        .font(.footnote)
        .padding(.top, 8)
    }

    private func open(_ room: RoomModel, isSample: Bool) {
        // Debug rooms have no RoomPlan capture; clear it so an older scan is never exported with them.
        latestCapture = nil
        latestColorEstimates = nil
        latestRoom = room
        latestRoomIsSample = isSample
        showEditor = true
    }

    private func documentRoomFiles() -> [URL] {
        guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
              let files = try? FileManager.default.contentsOfDirectory(at: documents, includingPropertiesForKeys: nil)
        else { return [] }
        return files.filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
    #endif
}

#Preview {
    HomeView()
}
