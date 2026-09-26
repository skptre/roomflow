import Foundation
import RoomPlan

/// Writes the untouched RoomPlan capture to a `.roomplan.json` file for the web importer
/// (see docs/contracts/room-import.md on Yash's branch).
///
/// The file is exactly `JSONEncoder().encode(capture)`: default encoder, no pretty printing,
/// no wrapper, no conversion, no colors. RoomFlow's own normalized model is a different file.
nonisolated enum RoomPlanFileExport {
    static func fileName(roomID: UUID) -> String {
        "\(roomID.uuidString).roomplan.json"
    }

    /// Writes `data` as `<roomID>.roomplan.json` in `directory`, creating the directory if needed.
    /// Replaces a previous export of the same room; never touches other files.
    @discardableResult
    static func write(data: Data, roomID: UUID, directory: URL) throws -> URL {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent(fileName(roomID: roomID))
        try data.write(to: url, options: .atomic)
        return url
    }

    /// The one place the raw format is defined: the default encoder, nothing added.
    static func encode(_ capture: CapturedRoom) throws -> RawCapture {
        RawCapture(id: capture.identifier, data: try JSONEncoder().encode(capture))
    }

    /// Writes already-frozen capture bytes to a scoped temporary folder for sharing.
    static func export(_ raw: RawCapture, directory: URL = defaultDirectory) throws -> URL {
        try write(data: raw.data, roomID: raw.id, directory: directory)
    }

    static var defaultDirectory: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("RoomFlowExports", isDirectory: true)
    }
}
