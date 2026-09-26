import Foundation
import Testing
@testable import RoomFlow

struct RoomEvidenceSelectionTests {
    private func photo() -> RoomPhotoEvidence {
        RoomPhotoEvidence(id: UUID(), sessionID: UUID(), timestamp: 0, pixelWidth: 1280, pixelHeight: 960,
                          cameraToWorld: Array(repeating: 0, count: 16), intrinsics: Array(repeating: 0, count: 9),
                          trackingContinuous: true, byteCount: 1)
    }

    @Test func excludedPhotoIsAbsentFromSelection() {
        let photos = [photo(), photo(), photo()]
        var selection = RoomEvidenceSelection.initial(for: photos)
        #expect(selection.sharedPhotos(from: photos).count == 3)

        selection.setPhoto(photos[1].id, included: false)

        #expect(selection.sharedPhotos(from: photos).map(\.id) == [photos[0].id, photos[2].id])
        #expect(selection.revision == 1)
    }

    @Test func geometryOnlySelectionHasNoPhotos() {
        let photos = [photo(), photo()]
        var selection = RoomEvidenceSelection.initial(for: photos)

        selection.setIncludePhotos(false)

        #expect(selection.sharedPhotos(from: photos).isEmpty)
        // Individual choices are remembered if photos are switched back on.
        selection.setIncludePhotos(true)
        #expect(selection.sharedPhotos(from: photos).count == 2)
        // A room scanned without photos starts geometry-only.
        #expect(RoomEvidenceSelection.initial(for: []).includePhotos == false)
    }

    @Test func labelCorrectionPreservesSourceGeometry() throws {
        let room = SampleRoom.make()
        let storage = try #require(room.objects.first { $0.category == "storage" })
        let sourceId = try #require(storage.sourceId)
        var selection = RoomEvidenceSelection.initial(for: [])

        selection.setLabel("trash can", for: sourceId)

        #expect(selection.label(for: sourceId) == "trash can")
        #expect(selection.annotations.first?.provenance == "user-supplied")
        // The room itself is untouched: same category and dimensions.
        #expect(room.objects.first { $0.sourceId == sourceId } == storage)
        // The selection carries no geometry or category of its own.
        let json = String(decoding: try JSONEncoder().encode(selection), as: UTF8.self)
        for field in ["dimensions", "position", "category", "transform"] {
            #expect(!json.contains(field))
        }
        // Clearing the label removes the correction.
        selection.setLabel("  ", for: sourceId)
        #expect(selection.label(for: sourceId) == nil)
    }

    @Test func selectionSurvivesReload() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("RoomEvidenceSelectionTests-\(UUID())")
        defer { try? FileManager.default.removeItem(at: root) }
        let roomID = UUID()
        let store = RoomArchiveStore(root: root)
        try await store.saveCapture(id: roomID, rawData: Data("{}".utf8), editableData: Data(#"{"revision":0}"#.utf8))

        let photos = [photo(), photo()]
        var selection = RoomEvidenceSelection.initial(for: photos)
        selection.setPhoto(photos[0].id, included: false)
        selection.setLabel("trash can", for: UUID())
        try await store.saveSelection(id: roomID, selection: selection)

        let reloaded = try await RoomArchiveStore(root: root).load(id: roomID)
        #expect(reloaded.selection == selection)
    }
}
