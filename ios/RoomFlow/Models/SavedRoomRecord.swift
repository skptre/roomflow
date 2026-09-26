import Foundation

/// What the Saved Rooms list shows about a stored scan.
nonisolated struct SavedRoomRecord: Codable, Identifiable, Equatable, Sendable {
    enum EvidenceStatus: String, Codable, Sendable {
        /// Only the RoomPlan scan (and the editable room derived from it).
        case geometryOnly
        /// Reference photos were saved alongside the scan.
        case photos
    }

    /// The RoomPlan capture identifier; stable for the room's lifetime.
    var id: UUID
    var name: String
    var capturedAt: Date
    /// `revision` of the current editable room; read from the editable file when listing.
    var editedRevision: Int
    var evidenceStatus: EvidenceStatus
}

/// The original RoomPlan scan, frozen as JSON bytes the moment processing finished.
/// These exact bytes are saved and shared; the capture is never re-encoded.
nonisolated struct RawCapture: Sendable, Equatable {
    var id: UUID
    var data: Data
}

/// A saved room loaded from disk. The original scan bytes are never modified after saving.
nonisolated struct RoomArchive: Sendable {
    var record: SavedRoomRecord
    /// Exactly the bytes of `JSONEncoder().encode(capturedRoom)` taken when the scan finished.
    var rawData: Data
    /// The current RoomModel JSON (RoomFlow's own frame and schema).
    var editableData: Data
}
