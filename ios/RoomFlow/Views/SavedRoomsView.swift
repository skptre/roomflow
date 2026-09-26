import SwiftUI

/// Rooms saved on this phone. Opening one restores the original scan (for sharing)
/// and the current editable room, without rescanning.
struct SavedRoomsView: View {
    var store: RoomArchiveStore = .shared

    @State private var records: [SavedRoomRecord] = []
    @State private var hasLoaded = false
    @State private var openedRoom: RoomModel?
    @State private var openedRaw: RawCapture?
    @State private var openedPhotos: [RoomPhotoEvidence] = []
    @State private var showEditor = false
    @State private var errorMessage: String?
    @State private var showError = false

    var body: some View {
        List {
            ForEach(records) { record in
                Button {
                    Task { await open(record) }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(record.name)
                            .font(.headline)
                            .foregroundStyle(.white)
                        Label(evidenceText(record), systemImage: record.evidenceStatus == .photos ? "photo" : "cube")
                            .font(.caption)
                            .foregroundStyle(Color.rfSecondaryText)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
            }
        }
        .overlay {
            if hasLoaded && records.isEmpty {
                ContentUnavailableView("No saved rooms",
                                       systemImage: "square.stack.3d.up",
                                       description: Text("Rooms you scan are saved here automatically."))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.rfBackground)
        .navigationTitle("Saved Rooms")
        .task { await reload() }
        .refreshable { await reload() }
        .navigationDestination(isPresented: $showEditor) {
            if let openedRoom {
                RoomEditorView(room: openedRoom, rawCapture: openedRaw, photos: openedPhotos)
                    .id(openedRoom.id)
            }
        }
        .alert("Couldn't open saved rooms", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func evidenceText(_ record: SavedRoomRecord) -> String {
        let evidence = record.evidenceStatus == .photos ? "Scan and photos" : "Scan only"
        return record.editedRevision > 0 ? "\(evidence) · edited" : evidence
    }

    private func reload() async {
        do {
            records = try await store.list()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
        hasLoaded = true
    }

    private func open(_ record: SavedRoomRecord) async {
        do {
            let archive = try await store.load(id: record.id)
            openedRoom = try RoomModel.jsonDecoder.decode(RoomModel.self, from: archive.editableData)
            openedRaw = RawCapture(id: archive.record.id, data: archive.rawData)
            openedPhotos = archive.photos
            showEditor = true
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}
