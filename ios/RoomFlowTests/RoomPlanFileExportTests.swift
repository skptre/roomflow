import Foundation
import Testing
@testable import RoomFlow

struct RoomPlanFileExportTests {
    private let roomID = UUID(uuidString: "4FF6A897-2207-4F88-BC65-3DC481BFCF23")!

    private func makeTemporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("RoomPlanFileExportTests-\(UUID())")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func fileNameUsesRoomPlanExtension() {
        let name = RoomPlanFileExport.fileName(roomID: roomID)
        #expect(name.hasSuffix(".roomplan.json"))
        #expect(name.contains(roomID.uuidString))
    }

    @Test func writeStoresExactBytesInGivenDirectory() throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        // Unformatted JSON as JSONEncoder emits it; must come back byte-for-byte.
        let bytes = Data(#"{"walls":[],"identifier":"4FF6A897-2207-4F88-BC65-3DC481BFCF23"}"#.utf8)

        let url = try RoomPlanFileExport.write(data: bytes, roomID: roomID, directory: directory)

        #expect(url.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL)
        #expect(url.lastPathComponent == RoomPlanFileExport.fileName(roomID: roomID))
        #expect(try Data(contentsOf: url) == bytes)
    }

    @Test func rewritingReplacesOnlyTheExportFile() throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let neighbor = directory.appendingPathComponent("other.json")
        try Data("keep".utf8).write(to: neighbor)

        _ = try RoomPlanFileExport.write(data: Data("first".utf8), roomID: roomID, directory: directory)
        let url = try RoomPlanFileExport.write(data: Data("second".utf8), roomID: roomID, directory: directory)

        #expect(try Data(contentsOf: url) == Data("second".utf8))
        #expect(try Data(contentsOf: neighbor) == Data("keep".utf8))
    }

    @Test func unavailableDirectoryThrows() {
        // A regular file where a directory is expected: the write must fail, not silently succeed.
        let blocker = FileManager.default.temporaryDirectory.appendingPathComponent("not-a-directory-\(UUID())")
        FileManager.default.createFile(atPath: blocker.path, contents: Data("x".utf8))
        defer { try? FileManager.default.removeItem(at: blocker) }

        #expect(throws: (any Error).self) {
            try RoomPlanFileExport.write(data: Data("{}".utf8), roomID: roomID, directory: blocker)
        }
        #expect((try? Data(contentsOf: blocker)) == Data("x".utf8))
    }
}
