import Compression
import CryptoKit
import Foundation
import Testing
import simd
@testable import RoomFlow

/// Fails every archive attempt, to prove a packaging failure leaves the saved room alone.
nonisolated private struct FailingArchiver: RoomPackageArchiver {
    func archive(directory: URL, to destination: URL) throws { throw CocoaError(.fileWriteOutOfSpace) }
}

struct RoomPackageExportTests {
    private let captureID = UUID(uuidString: "AE251557-DC8F-48F1-9352-60220A5490A4")!
    private let rawBytes = Data(#"{"walls":[],"doors":[],"objects":[]}"#.utf8)

    private func makeRoot() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("RoomPackageExportTests-\(UUID())")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func makePhoto(in folder: URL, bytes: String) throws -> RoomPhotoEvidence {
        var photo = RoomPhotoEvidence(
            id: UUID(), sessionID: UUID(), timestamp: 3.5, pixelWidth: 1280, pixelHeight: 960,
            cameraToWorld: RoomPhotoEvidence.columnMajor(matrix_identity_float4x4),
            intrinsics: [1000, 0, 0, 0, 1000, 0, 640, 480, 1],
            trackingContinuous: true, byteCount: bytes.utf8.count)
        let url = folder.appendingPathComponent(photo.fileName)
        try Data(bytes.utf8).write(to: url)
        photo.fileURL = url
        return photo
    }

    private func makeArchive(root: URL, photoCount: Int) throws -> RoomArchive {
        let photos = try (0..<photoCount).map { try makePhoto(in: root, bytes: "jpeg-\($0)") }
        let sourceId = UUID()
        return RoomArchive(
            record: SavedRoomRecord(id: captureID, name: "Test", capturedAt: Date(timeIntervalSince1970: 1_790_000_000),
                                    editedRevision: 0, evidenceStatus: photos.isEmpty ? .geometryOnly : .photos),
            rawData: rawBytes,
            editableData: Data(#"{"revision":0}"#.utf8),
            photos: photos,
            appearance: RoomAppearanceEvidence(
                captureId: captureID, colors: [SourceColor(sourceId: sourceId, hex: "#E4DED3", sampleCount: 30)], floorColor: nil,
                associations: photos.map { RoomPhotoAssociation(sourceId: sourceId, photoId: $0.id, rect: [0.1, 0.1, 0.2, 0.2]) }),
            selection: RoomEvidenceSelection.initial(for: photos)
        )
    }

    private func export(_ archive: RoomArchive, _ selection: RoomEvidenceSelection, to destination: URL) async throws -> RoomPackageExport.Result {
        try await RoomPackageExport.export(archive: archive, selection: selection, destination: destination)
    }

    @Test func rawPayloadIsByteIdentical() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let archive = try makeArchive(root: root, photoCount: 1)

        let result = try await export(archive, archive.selection, to: root)
        let files = try ZipReader.files(in: result.url)

        #expect(result.url.lastPathComponent == "\(captureID.uuidString).roomflow.zip")
        #expect(files["capture.roomplan.json"] == rawBytes)
    }

    @Test func photoSelectionControlsArchiveEntries() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let archive = try makeArchive(root: root, photoCount: 3)
        var selection = archive.selection
        selection.setPhoto(archive.photos[1].id, included: false)

        let result = try await export(archive, selection, to: root)
        let files = try ZipReader.files(in: result.url)
        let manifest = try RoomPackageManifest.decoder.decode(RoomPackageManifest.self, from: try #require(files["manifest.json"]))

        let photoPaths = Set(files.keys.filter { $0.hasPrefix("photos/") })
        #expect(photoPaths == ["photos/\(archive.photos[0].fileName)", "photos/\(archive.photos[2].fileName)"])
        #expect(Set(manifest.photos.map(\.photoId)) == [archive.photos[0].id, archive.photos[2].id])
        // Associations only for photos actually in the package.
        #expect(Set(manifest.associations.map(\.photoId)) == [archive.photos[0].id, archive.photos[2].id])
        #expect(result.sharedPhotoCount == 2)
    }

    @Test func geometryOnlyPackageIsValid() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let archive = try makeArchive(root: root, photoCount: 2)
        var selection = archive.selection
        selection.setIncludePhotos(false)

        let result = try await export(archive, selection, to: root)
        let files = try ZipReader.files(in: result.url)
        let manifest = try RoomPackageManifest.decoder.decode(RoomPackageManifest.self, from: try #require(files["manifest.json"]))

        #expect(!files.keys.contains { $0.hasPrefix("photos/") })
        #expect(manifest.photos.isEmpty && manifest.associations.isEmpty)
        #expect(manifest.coordinateSpace == "roomplan-native-v1" && manifest.units == "meters")
        #expect(manifest.captureId == captureID)
    }

    @Test func manifestHashesMatchFiles() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let archive = try makeArchive(root: root, photoCount: 2)

        let result = try await export(archive, archive.selection, to: root)
        let files = try ZipReader.files(in: result.url)
        let manifest = try RoomPackageManifest.decoder.decode(RoomPackageManifest.self, from: try #require(files["manifest.json"]))

        // Every listed file exists with the stated size and SHA-256, and nothing unlisted is present.
        #expect(Set(manifest.files.map(\.path)) == Set(files.keys).subtracting(["manifest.json"]))
        for entry in manifest.files {
            let data = try #require(files[entry.path])
            #expect(data.count == entry.byteCount)
            #expect(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() == entry.sha256)
        }
    }

    @Test func invalidPathsAreRejected() throws {
        let ok = RoomPackageManifest.FileEntry(path: "capture.roomplan.json", mediaType: "application/json", byteCount: 1, sha256: "x")
        func manifest(_ paths: [String]) -> RoomPackageManifest {
            RoomPackageManifest(packageId: UUID(), captureId: captureID, capturedAt: Date(), selectionRevision: 0,
                                files: paths.map { RoomPackageManifest.FileEntry(path: $0, mediaType: "application/json", byteCount: 1, sha256: "x") },
                                photos: [], associations: [])
        }
        #expect(throws: Never.self) { try manifest([ok.path, "photos/\(UUID().uuidString).jpg"]).validate() }
        for bad in ["../capture.roomplan.json", "/etc/passwd", "photos/../x.jpg", "notes.txt", "photos/cat.jpg", "photos/a/b.jpg"] {
            #expect(throws: RoomPackageManifest.ValidationError.self, "\(bad)") { try manifest([ok.path, bad]).validate() }
        }
        #expect(throws: RoomPackageManifest.ValidationError.self) { try manifest([ok.path, ok.path]).validate() }
        #expect(throws: RoomPackageManifest.ValidationError.self) { try manifest(["editable.roomflow.json"]).validate() } // raw scan required
    }

    @Test func archiveFailureKeepsSavedRoom() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = RoomArchiveStore(root: root.appendingPathComponent("store"))
        try await store.saveCapture(id: captureID, rawData: rawBytes, editableData: Data(#"{"revision":0}"#.utf8))
        let archive = try await store.load(id: captureID)

        await #expect(throws: (any Error).self) {
            try await RoomPackageExport.export(archive: archive, selection: archive.selection,
                                               destination: root.appendingPathComponent("out"), archiver: FailingArchiver())
        }
        #expect(try await store.load(id: captureID).rawData == rawBytes)
        #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent("out/\(captureID.uuidString).roomflow.zip").path))
    }

    @Test func changedSelectionCreatesFreshPackage() async throws {
        let root = try makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let archive = try makeArchive(root: root, photoCount: 2)

        let first = try await export(archive, archive.selection, to: root)
        let firstManifest = try RoomPackageManifest.decoder.decode(RoomPackageManifest.self, from: try #require(try ZipReader.files(in: first.url)["manifest.json"]))

        var selection = archive.selection
        selection.setPhoto(archive.photos[0].id, included: false)
        let second = try await export(archive, selection, to: root)
        let files = try ZipReader.files(in: second.url)
        let secondManifest = try RoomPackageManifest.decoder.decode(RoomPackageManifest.self, from: try #require(files["manifest.json"]))

        #expect(secondManifest.packageId != firstManifest.packageId)
        #expect(secondManifest.selectionRevision == selection.revision)
        #expect(files["photos/\(archive.photos[0].fileName)"] == nil) // the removed photo can't linger
    }
}

/// Minimal independent ZIP reader for tests: central directory + stored/deflate entries.
/// Returns files keyed by path inside the package folder (the single top-level folder is stripped).
nonisolated enum ZipReader {
    static func files(in url: URL) throws -> [String: Data] {
        let bytes = [UInt8](try Data(contentsOf: url))
        func u16(_ i: Int) -> Int { Int(bytes[i]) | Int(bytes[i + 1]) << 8 }
        func u32(_ i: Int) -> Int { u16(i) | u16(i + 2) << 16 }

        guard let eocd = stride(from: bytes.count - 22, through: 0, by: -1).first(where: { u32($0) == 0x0605_4B50 }) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        var entries: [String: Data] = [:]
        var offset = u32(eocd + 16)
        for _ in 0..<u16(eocd + 10) {
            guard u32(offset) == 0x0201_4B50 else { throw CocoaError(.fileReadCorruptFile) }
            let method = u16(offset + 10), compressed = u32(offset + 20), size = u32(offset + 24)
            let nameLength = u16(offset + 28), extraLength = u16(offset + 30), commentLength = u16(offset + 32)
            let local = u32(offset + 42)
            let name = String(decoding: bytes[(offset + 46)..<(offset + 46 + nameLength)], as: UTF8.self)
            offset += 46 + nameLength + extraLength + commentLength

            guard !name.hasSuffix("/") else { continue } // directory entry
            let start = local + 30 + u16(local + 26) + u16(local + 28)
            let payload = Array(bytes[start..<(start + compressed)])
            let data: Data
            switch method {
            case 0: data = Data(payload)
            case 8:
                var output = [UInt8](repeating: 0, count: max(size, 1))
                let written = compression_decode_buffer(&output, size, payload, compressed, nil, COMPRESSION_ZLIB)
                guard written == size else { throw CocoaError(.fileReadCorruptFile) }
                data = Data(output.prefix(size))
            default: throw CocoaError(.fileReadUnsupportedScheme)
            }
            entries[name] = data
        }
        // Strip the single top-level "<capture-id>.roomflow/" folder.
        let roots = Set(entries.keys.compactMap { $0.split(separator: "/").first.map(String.init) })
        guard roots.count == 1, let root = roots.first, root.hasSuffix(".roomflow") else { return entries }
        return Dictionary(uniqueKeysWithValues: entries.map { (String($0.key.dropFirst(root.count + 1)), $0.value) })
    }
}
