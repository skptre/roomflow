import RoomPlan
import SwiftUI

struct HomeView: View {
    @State private var isScanning = false
    @State private var isScanningPiece = false
    @State private var showUnsupported = false
    @State private var pendingScan: ScanCaptureResult?
    /// Opt-in: keep calibrated reference photos during the scan.
    @AppStorage("includeReferencePhotos") private var includeReferencePhotos = false
    @State private var latestPhotos: [RoomPhotoEvidence] = []
    @State private var latestAppearance: RoomAppearanceEvidence?
    @State private var latestWallArt: [WallArtItem] = []
    /// Temp folder for `latestWallArt`'s crops, source-side only; cleared with the scan session's
    /// other temporary files once the save copies them into the saved room.
    @State private var latestWallArtDirectory: URL?
    /// The untouched RoomPlan result as frozen JSON bytes: what gets saved and shared.
    @State private var latestRawCapture: RawCapture?
    /// Camera colors for `latestRawCapture`; exported separately, never inside the raw file.
    @State private var latestColorEstimates: RoomColorEstimates?
    /// Our editable model built from `latestCapture` (or a debug room).
    @State private var latestRoom: RoomModel?
    @State private var latestRoomIsSample = false
    @State private var showEditor = false
    @State private var saveError: String?
    @State private var showSaveError = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.rfBackground.ignoresSafeArea()

                GeometryReader { geometry in
                ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Roomflow")
                        .font(.system(size: 27, weight: .semibold))
                        .tracking(-1.2)
                        .foregroundStyle(Color.rfInk)
                        .padding(.top, 22)

                    Spacer(minLength: 42)

                    Text("YOUR SPACE, READY TO EXPLORE")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(1.5)
                        .foregroundStyle(Color.rfAccent)
                    Text("Your room,\nwith anything\nyou find.")
                        .font(.system(size: 49, weight: .regular))
                        .tracking(-2.8)
                        .lineSpacing(-3)
                        .lineLimit(3)
                        .minimumScaleFactor(0.75)
                        .foregroundStyle(Color.rfInk)
                        .padding(.top, 15)
                    Text("Scan here, then share your room file to open it in the browser.")
                        .font(.body)
                        .foregroundStyle(Color.rfSecondaryText)
                        .padding(.top, 16)

                    Spacer(minLength: 38)

                    Button("Scan my room", systemImage: "viewfinder") {
                        if RoomScanService.isSupported {
                            isScanning = true
                        } else {
                            showUnsupported = true
                        }
                    }
                    .buttonStyle(RFButtonStyle())
                    .padding(.bottom, 10)

                    Button("Scan a Piece", systemImage: "scope") {
                        if RoomScanService.isSupported { isScanningPiece = true }
                        else { showUnsupported = true }
                    }
                    .buttonStyle(RFButtonStyle(prominent: false))

                    NavigationLink("Saved Pieces") { SavedPiecesView() }
                        .font(.subheadline)

                    Toggle(isOn: $includeReferencePhotos) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Include reference photos")
                                .font(.subheadline)
                            Text("A few photos help recreate how your furniture looks. They stay on this phone unless you share them.")
                                .font(.caption)
                                .foregroundStyle(Color.rfSecondaryText)
                        }
                    }
                    .tint(Color.rfAccent)
                    .padding(.vertical, 4)

                    NavigationLink {
                        SavedRoomsView()
                    } label: {
                        Label("Saved Rooms", systemImage: "square.stack.3d.up")
                    }
                    .foregroundStyle(Color.rfAccent)
                    .padding(.vertical, 16)

                    #if DEBUG
                    debugMenu
                    #endif
                }
                .padding(.horizontal, 26)
                .padding(.bottom, 28)
                .frame(minHeight: geometry.size.height, alignment: .top)
                }
                .scrollIndicators(.hidden)
                }
            }
            .navigationDestination(isPresented: $showEditor) {
                if let latestRoom {
                    RoomEditorView(room: latestRoom, isSample: latestRoomIsSample,
                                   rawCapture: latestRawCapture, colors: latestColorEstimates,
                                   photos: latestPhotos, appearance: latestAppearance,
                                   wallArt: latestWallArt, wallArtDirectory: latestWallArtDirectory)
                        .id(latestRoom.id)
                }
            }
        }
        .fullScreenCover(isPresented: $isScanning, onDismiss: openPendingScan) {
            RoomScanView(capturePhotos: includeReferencePhotos) { result in
                pendingScan = result
                isScanning = false
            }
        }
        .preferredColorScheme(.light)
        .tint(Color.rfAccent)
        .fullScreenCover(isPresented: $isScanningPiece) {
            PieceScanView(capturePhotos: includeReferencePhotos)
        }
        .alert("Couldn't save this room", isPresented: $showSaveError) {
            Button("Retry") { Task { await saveAndOpenLatest() } }
            Button("Continue Without Saving", role: .cancel) {
                showEditor = true
            }
        } message: {
            Text("\(saveError ?? "") The scan is still open and can be shared, but it won't appear in Saved Rooms.")
        }
        .alert("Scanning isn't available", isPresented: $showUnsupported) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(RoomScanService.Failure.unsupportedDevice.message)
        }
    }

    // Runs after the scanner cover has fully dismissed, so transitions don't fight each other.
    // Freezes the scan bytes once, saves the room, then opens the editor.
    private func openPendingScan() {
        guard let pendingScan else { return }
        self.pendingScan = nil
        latestRawCapture = try? RoomPlanFileExport.encode(pendingScan.room)
        latestColorEstimates = pendingScan.colors
        latestPhotos = pendingScan.photos
        // Match photos against the final processed room only.
        latestAppearance = RoomEvidenceProjector.appearance(room: pendingScan.room, colors: pendingScan.colors,
                                                            photos: pendingScan.photos)
        latestWallArt = pendingScan.wallArt
        latestWallArtDirectory = pendingScan.wallArtDirectory
        latestRoom = RoomPlanConverter.convert(pendingScan.room, colors: pendingScan.colors)
        latestRoomIsSample = false
        Task { await saveAndOpenLatest() }
    }

    /// Saves the latest scan before opening it. On failure the editor can still open from memory.
    private func saveAndOpenLatest() async {
        do {
            guard let raw = latestRawCapture, let room = latestRoom else {
                throw CocoaError(.fileWriteUnknown, userInfo: [NSLocalizedDescriptionKey: "The scan couldn't be encoded."])
            }
            try await RoomArchiveStore.shared.saveCapture(id: raw.id, rawData: raw.data,
                                                          editableData: room.jsonData(), photos: latestPhotos,
                                                          appearance: latestAppearance, wallArt: latestWallArt,
                                                          wallArtDirectory: latestWallArtDirectory)
            // Point at the saved room's copies, then drop the scan's temporary photos and art crops.
            // The art folder lives under the same per-session temp directory as the photos, one level up.
            var temporarySessions = Set(latestPhotos.map(\.sessionID))
            if let artSessionID = latestWallArtDirectory?.deletingLastPathComponent().lastPathComponent,
               let uuid = UUID(uuidString: artSessionID) {
                temporarySessions.insert(uuid)
            }
            if !latestPhotos.isEmpty || !latestWallArt.isEmpty, let saved = try? await RoomArchiveStore.shared.load(id: raw.id) {
                latestPhotos = saved.photos
                latestWallArt = saved.wallArt
                latestWallArtDirectory = saved.wallArtDirectory
                temporarySessions.forEach { RoomEvidenceRecorder.removeTemporaryFiles(sessionID: $0) }
            }
            showEditor = true
        } catch {
            saveError = error.localizedDescription
            showSaveError = true
        }
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
        latestRawCapture = nil
        latestColorEstimates = nil
        latestPhotos = []
        latestAppearance = nil
        latestWallArt = []
        latestWallArtDirectory = nil
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
