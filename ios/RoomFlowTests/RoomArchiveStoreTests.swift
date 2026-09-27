import Foundation
import Testing
@testable import RoomFlow

struct RoomArchiveStoreTests {
    private let roomID = UUID(uuidString: "0B69646F-FDE0-4148-833C-98B6A892FB63")!
    private let rawBytes = Data(#"{"identifier":"0B69646F-FDE0-4148-833C-98B6A892FB63","walls":[]}"#.utf8)

    private func makeRoot() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("RoomArchiveStoreTests-\(UUID())")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func editable(revision: Int) -> Data {
        Data(#"{"revision":\#(revision),"objects":[]}"#.utf8)
    }

    @Test func originalBytesSurviveEditsAndReload() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }

        let store = RoomArchiveStore(root: root)
        try await store.saveCapture(id: roomID, rawData: rawBytes, editableData: editable(revision: 0))
        try await store.saveEdits(id: roomID, editableData: editable(revision: 2))

        // A fresh store on the same folder stands in for an app relaunch.
        let reopened = RoomArchiveStore(root: root)
        let archive = try await reopened.load(id: roomID)
        #expect(archive.rawData == rawBytes)
        #expect(archive.editableData == editable(revision: 2))
        #expect(archive.record.editedRevision == 2)
        #expect(try await reopened.list().map(\.id) == [roomID])
    }

    @Test func savingADifferentScanUnderTheSameIDNeverReplacesTheOriginal() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }

        let store = RoomArchiveStore(root: root)
        try await store.saveCapture(id: roomID, rawData: rawBytes, editableData: editable(revision: 0))
        // Retrying with identical bytes is fine…
        try await store.saveCapture(id: roomID, rawData: rawBytes, editableData: editable(revision: 0))
        // …but different bytes must be refused.
        await #expect(throws: RoomArchiveStore.ArchiveError.self) {
            try await store.saveCapture(id: roomID, rawData: Data("{}".utf8), editableData: editable(revision: 0))
        }
        #expect(try await store.load(id: roomID).rawData == rawBytes)
    }

    @Test func failedWritePreservesPreviousRevision() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }

        let normal = RoomArchiveStore(root: root)
        try await normal.saveCapture(id: roomID, rawData: rawBytes, editableData: editable(revision: 1))

        let failing = RoomArchiveStore(root: root) { _, _ in throw CocoaError(.fileWriteOutOfSpace) }
        await #expect(throws: (any Error).self) {
            try await failing.saveEdits(id: roomID, editableData: editable(revision: 2))
        }

        let archive = try await normal.load(id: roomID)
        #expect(archive.editableData == editable(revision: 1))
        #expect(archive.record.editedRevision == 1)
        #expect(archive.rawData == rawBytes)
    }

    @Test func photosAreSavedWithTheCaptureAndReloaded() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let tempPhoto = root.appendingPathComponent("temp.jpg")
        try Data("jpeg-bytes".utf8).write(to: tempPhoto)
        let photo = RoomPhotoEvidence(
            id: UUID(), sessionID: UUID(), timestamp: 12.5, pixelWidth: 1280, pixelHeight: 960,
            cameraToWorld: Array(repeating: 0, count: 16), intrinsics: Array(repeating: 0, count: 9),
            trackingContinuous: true, byteCount: 10, fileURL: tempPhoto)

        let appearance = RoomAppearanceEvidence(
            captureId: roomID, colors: [SourceColor(sourceId: UUID(), hex: "#E4DED3", sampleCount: 40)], floorColor: nil,
            associations: [RoomPhotoAssociation(sourceId: UUID(), photoId: photo.id, rect: [0.1, 0.2, 0.3, 0.4])])

        let store = RoomArchiveStore(root: root)
        try await store.saveCapture(id: roomID, rawData: rawBytes, editableData: editable(revision: 0),
                                    photos: [photo], appearance: appearance)

        let archive = try await RoomArchiveStore(root: root).load(id: roomID)
        #expect(archive.record.evidenceStatus == .photos)
        #expect(archive.photos.map(\.id) == [photo.id])
        #expect(archive.photos[0].fileURL?.path.contains("/rooms/") == true)
        #expect(try Data(contentsOf: archive.photos[0].fileURL!) == Data("jpeg-bytes".utf8))
        #expect(archive.rawData == rawBytes)
        #expect(archive.appearance == appearance)
        #expect(archive.appearance?.colors.first?.provenance == "camera-estimate")
    }

    private func wallArtItem(wallSourceId: UUID = UUID(), photoFileName: String? = nil) -> WallArtItem {
        WallArtItem(id: UUID(), wallSourceId: wallSourceId, centerX: 0.2, centerY: 1.1, width: 0.6, height: 0.4,
                   standoff: 0, sightingCount: 4, photoFileName: photoFileName)
    }

    @Test func wallArtIsSavedWithItsPhotoAndReloaded() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let artSource = root.appendingPathComponent("pending-art")
        try FileManager.default.createDirectory(at: artSource, withIntermediateDirectories: true)
        var item = wallArtItem(photoFileName: nil)
        item.photoFileName = "\(item.id.uuidString).jpg"
        try Data("crop-bytes".utf8).write(to: artSource.appendingPathComponent(item.photoFileName!))

        let store = RoomArchiveStore(root: root)
        try await store.saveCapture(id: roomID, rawData: rawBytes, editableData: editable(revision: 0),
                                    wallArt: [item], wallArtDirectory: artSource)

        let archive = try await RoomArchiveStore(root: root).load(id: roomID)
        #expect(archive.wallArt.map(\.id) == [item.id])
        #expect(archive.wallArt[0].photoFileName == item.photoFileName)
        let copied = archive.wallArtDirectory.appendingPathComponent(item.photoFileName!)
        #expect(try Data(contentsOf: copied) == Data("crop-bytes".utf8))
    }

    @Test func roomWithoutWallArtFileLoadsAnEmptyList() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }

        let store = RoomArchiveStore(root: root)
        try await store.saveCapture(id: roomID, rawData: rawBytes, editableData: editable(revision: 0))

        let archive = try await store.load(id: roomID)
        #expect(archive.wallArt.isEmpty)
    }

    @Test func missingPhotoFileClearsPhotoFileNameInsteadOfFailing() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let artSource = root.appendingPathComponent("pending-art")
        try FileManager.default.createDirectory(at: artSource, withIntermediateDirectories: true)
        // No file written for this item's photoFileName — the save must not throw.
        var item = wallArtItem()
        item.photoFileName = "missing.jpg"

        let store = RoomArchiveStore(root: root)
        try await store.saveCapture(id: roomID, rawData: rawBytes, editableData: editable(revision: 0),
                                    wallArt: [item], wallArtDirectory: artSource)

        let archive = try await store.load(id: roomID)
        #expect(archive.wallArt.map(\.id) == [item.id])
        #expect(archive.wallArt[0].photoFileName == nil)
    }

    @Test func saveWallArtReplacesTheStoredList() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = RoomArchiveStore(root: root)
        let first = wallArtItem()
        try await store.saveCapture(id: roomID, rawData: rawBytes, editableData: editable(revision: 0), wallArt: [first])

        let second = wallArtItem()
        try await store.saveWallArt(id: roomID, items: [second])

        let archive = try await RoomArchiveStore(root: root).load(id: roomID)
        #expect(archive.wallArt.map(\.id) == [second.id])
    }

    @Test func saveWallArtOnAnUnknownRoomThrows() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = RoomArchiveStore(root: root)
        await #expect(throws: RoomArchiveStore.ArchiveError.self) {
            try await store.saveWallArt(id: roomID, items: [self.wallArtItem()])
        }
    }

    @Test func incompleteStagingDirectoryIsNotListed() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }

        // A capture save that dies partway (here: on the third file) must leave nothing listed.
        let writes = WriteCounter()
        let failingThird = RoomArchiveStore(root: root) { data, url in
            if writes.next() == 3 { throw CocoaError(.fileWriteOutOfSpace) }
            try data.write(to: url)
        }
        await #expect(throws: (any Error).self) {
            try await failingThird.saveCapture(id: roomID, rawData: rawBytes, editableData: editable(revision: 0))
        }

        // Leftovers from a crash: a staging folder and a room folder without a record.
        let fm = FileManager.default
        try fm.createDirectory(at: root.appendingPathComponent("staging/crashed"), withIntermediateDirectories: true)
        try rawBytes.write(to: root.appendingPathComponent("staging/crashed/capture.roomplan.json"))
        try fm.createDirectory(at: root.appendingPathComponent("rooms/\(UUID())"), withIntermediateDirectories: true)

        #expect(try await RoomArchiveStore(root: root).list().isEmpty)
    }
}

/// Counts writes across the store's calls (the store is an actor, so calls arrive one at a time).
nonisolated private final class WriteCounter: @unchecked Sendable {
    private var count = 0
    func next() -> Int { count += 1; return count }
}
