import SwiftUI
import UIKit

/// Review what a room will share: correct object names, choose reference photos, and check
/// detected wall art. Choices are saved with the room; measurements and RoomPlan's own labels
/// never change.
struct RoomEvidenceReviewView: View {
    let captureID: UUID
    let room: RoomModel
    let photos: [RoomPhotoEvidence]
    let associations: [RoomPhotoAssociation]
    /// Where wall art's reference photos live; nil only when there is no wall art to show one for.
    let wallArtDirectory: URL?
    var store: RoomArchiveStore = .shared

    @State private var selection: RoomEvidenceSelection
    @State private var labelDrafts: [UUID: String] = [:]
    @State private var saveError: String?
    @State private var wallArtItems: [WallArtItem]
    @State private var wallArtSaveError: String?

    init(captureID: UUID, room: RoomModel, photos: [RoomPhotoEvidence], associations: [RoomPhotoAssociation],
         wallArt: [WallArtItem] = [], wallArtDirectory: URL? = nil, store: RoomArchiveStore = .shared) {
        self.captureID = captureID
        self.room = room
        self.photos = photos
        self.associations = associations
        self.wallArtDirectory = wallArtDirectory
        self.store = store
        _selection = State(initialValue: .initial(for: photos))
        _wallArtItems = State(initialValue: wallArt)
    }

    /// Objects that came from the scan (only those have a RoomPlan identity to annotate).
    private var capturedObjects: [(object: RoomObject, sourceId: UUID)] {
        room.objects.compactMap { object in object.sourceId.map { (object, $0) } }
    }

    var body: some View {
        List {
            Section {
                Text("The scan finds furniture and fixtures in about 16 types. Small or unusual items, like bins, lamps or plants, may be missing or get a general name such as “storage”. Your names are shared next to the scan's own labels and never change measurements.")
                    .font(.footnote)
                    .foregroundStyle(Color.rfSecondaryText)
            }

            Section("Detected objects (\(capturedObjects.count))") {
                if capturedObjects.isEmpty {
                    Text("No furniture was detected in this scan.")
                        .foregroundStyle(Color.rfSecondaryText)
                }
                ForEach(capturedObjects, id: \.sourceId) { object, sourceId in
                    objectRow(object, sourceId: sourceId)
                }
            }

            if photos.isEmpty {
                Section("Reference photos") {
                    Text("No reference photos were taken for this room. Sharing includes the scan only.")
                        .foregroundStyle(Color.rfSecondaryText)
                }
            } else {
                photoSection
            }

            // Only shown when this scan could have found wall art at all (reference photos were on);
            // an old scan or one with photos off never shows an empty "none found" message.
            if !wallArtItems.isEmpty || !photos.isEmpty {
                wallArtSection
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.rfBackground)
        .navigationTitle("Review Room")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if let saveError {
                HStack {
                    Label(saveError, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                    Spacer()
                    Button("Retry", action: persist)
                        .frame(minHeight: 44)
                }
                .padding(.horizontal, 16)
                .background(Color.rfSurface)
            }
        }
        .safeAreaInset(edge: .bottom) {
            if let wallArtSaveError {
                HStack {
                    Label(wallArtSaveError, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                    Spacer()
                    Button("Retry", action: persistWallArt)
                        .frame(minHeight: 44)
                }
                .padding(.horizontal, 16)
                .background(Color.rfSurface)
            }
        }
        .task { await loadSavedChoices() }
        .onDisappear(perform: commitDrafts)
    }

    // MARK: - Objects

    private func objectRow(_ object: RoomObject, sourceId: UUID) -> some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 5)
                .fill(PlanPalette.object(object))
                .frame(width: 28, height: 28)
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(.white.opacity(0.2)))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(object.id).font(.subheadline.monospaced())
                Text(originalDescription(object))
                    .font(.caption)
                    .foregroundStyle(Color.rfSecondaryText)
                TextField("Your name for it (optional)", text: labelBinding(sourceId))
                    .textInputAutocapitalization(.never)
                    .submitLabel(.done)
                    .onSubmit { commitLabel(sourceId) }
                    .frame(minHeight: 44)
                    .accessibilityLabel("Your name for \(object.id)")
            }
        }
    }

    private func originalDescription(_ object: RoomObject) -> String {
        var parts = ["Scan label: \(object.category)"]
        if let color = object.estimatedColor, color.sampleCount > 0 { parts.append("approx. color") }
        if object.confidence == "low" { parts.append("low confidence") }
        return parts.joined(separator: " · ")
    }

    private func labelBinding(_ sourceId: UUID) -> Binding<String> {
        Binding(
            get: { labelDrafts[sourceId] ?? selection.label(for: sourceId) ?? "" },
            set: { labelDrafts[sourceId] = $0 }
        )
    }

    private func commitLabel(_ sourceId: UUID) {
        guard let draft = labelDrafts.removeValue(forKey: sourceId) else { return }
        let before = selection.revision
        selection.setLabel(draft, for: sourceId)
        if selection.revision != before { persist() }
    }

    private func commitDrafts() {
        labelDrafts.keys.forEach(commitLabel)
    }

    // MARK: - Photos

    private var photoSection: some View {
        let shared = selection.sharedPhotos(from: photos).count
        return Section {
            Toggle("Include reference photos", isOn: Binding(
                get: { selection.includePhotos },
                set: { selection.setIncludePhotos($0); persist() }
            ))
            .frame(minHeight: 44)
            Text(selection.includePhotos
                 ? "Sharing \(shared) of \(photos.count) photos. Tap a photo to leave it out."
                 : "Photos are off: sharing includes the scan only.")
                .font(.footnote)
                .foregroundStyle(Color.rfSecondaryText)
            if selection.includePhotos,
               let summary = PhotoCoverage.make(objects: room.objects, associations: associations,
                                                photoIds: Set(selection.sharedPhotos(from: photos).map(\.id)),
                                                label: { selection.label(for: $0) }).summary {
                Text(summary)
                    .font(.footnote)
                    .foregroundStyle(Color.rfSecondaryText)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 8)], spacing: 8) {
                ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                    let isIncluded = selection.includePhotos && selection.isSelected(photo.id)
                    Button {
                        selection.setPhoto(photo.id, included: !selection.isSelected(photo.id))
                        persist()
                    } label: {
                        SensorPhoto(url: photo.fileURL)
                            .frame(height: 120)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .opacity(isIncluded ? 1 : 0.35)
                            .overlay(alignment: .topTrailing) {
                                Image(systemName: isIncluded ? "checkmark.circle.fill" : "circle")
                                    .font(.title3)
                                    .foregroundStyle(isIncluded ? Color.accentColor : .white)
                                    .padding(6)
                            }
                    }
                    .buttonStyle(.plain)
                    .disabled(!selection.includePhotos)
                    .accessibilityLabel("Photo \(index + 1)")
                    .accessibilityValue(isIncluded ? "Included" : "Left out")
                }
            }
            .padding(.vertical, 4)
        } header: {
            Text("Reference photos")
        }
    }

    // MARK: - Wall art

    private var wallArtSection: some View {
        Section("Wall art (\(wallArtItems.count))") {
            if wallArtItems.isEmpty {
                Text("No wall art was found. Framed pictures and posters work best.")
                    .foregroundStyle(Color.rfSecondaryText)
            } else {
                ForEach(wallArtItems) { item in
                    wallArtRow(item)
                }
            }
        }
    }

    private func wallArtRow(_ item: WallArtItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            wallArtThumbnail(item)
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(wallArtSizeText(item)).font(.subheadline)
                Text(wallArtLocationText(item))
                    .font(.caption)
                    .foregroundStyle(Color.rfSecondaryText)
            }
            .accessibilityElement(children: .combine)
            Spacer()
            Button("Not wall art") { removeWallArt(item) }
                .font(.caption)
                .frame(minHeight: 44)
                .accessibilityHint("Removes this item from your saved room")
        }
    }

    @ViewBuilder
    private func wallArtThumbnail(_ item: WallArtItem) -> some View {
        // The crop is already a straight-on photo (unlike sensor-native reference photos), so it's
        // drawn as-is with no rotation.
        if let fileName = item.photoFileName, let directory = wallArtDirectory,
           let uiImage = UIImage(contentsOfFile: directory.appendingPathComponent(fileName).path) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
        } else {
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.rfSurface)
                .overlay(Image(systemName: "photo.artframe").foregroundStyle(Color.rfSecondaryText))
        }
    }

    /// "About W × H cm", rounded to the nearest whole centimeter; sizes are measured estimates.
    private func wallArtSizeText(_ item: WallArtItem) -> String {
        "About \(Int((item.width * 100).rounded())) × \(Int((item.height * 100).rounded())) cm"
    }

    /// "On wall K" (1-based index among the room's walls), or "On a wall" when the source wall
    /// isn't among the room's current walls (e.g. an edited-out wall).
    private func wallArtLocationText(_ item: WallArtItem) -> String {
        guard let index = room.walls.firstIndex(where: { $0.sourceId == item.wallSourceId }) else {
            return "On a wall"
        }
        return "On wall \(index + 1)"
    }

    private func removeWallArt(_ item: WallArtItem) {
        wallArtItems.removeAll { $0.id == item.id }
        persistWallArt()
    }

    private func persistWallArt() {
        let snapshot = wallArtItems
        Task {
            do {
                try await store.saveWallArt(id: captureID, items: snapshot)
                wallArtSaveError = nil
            } catch {
                wallArtSaveError = "Couldn't save your choices. \(error.localizedDescription)"
            }
        }
    }

    // MARK: - Persistence

    private func loadSavedChoices() async {
        if let archive = try? await store.load(id: captureID) {
            selection = archive.selection
            wallArtItems = archive.wallArt
        }
    }

    private func persist() {
        let snapshot = selection
        Task {
            do {
                try await store.saveSelection(id: captureID, selection: snapshot)
                saveError = nil
            } catch {
                saveError = "Couldn't save your choices. \(error.localizedDescription)"
            }
        }
    }
}
