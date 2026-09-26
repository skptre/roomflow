import Foundation

/// RoomFlow's editable, backend-friendly room. Built from a RoomPlan scan by `RoomPlanConverter`.
///
/// Room frame (all values in meters):
/// - Right-handed, Y-up. Floor is y = 0.
/// - Rotated so the longest wall runs along X, then shifted so the walls'
///   bounding box starts at (x: 0, z: 0). The room spans 0...width on X and 0...length on Z.
/// - Top-down drawing: +X is screen right, +Z is screen down.
/// - `capture` records how to map back to RoomPlan's original world frame.
nonisolated struct RoomModel: Codable, Identifiable, Equatable {
    var schemaVersion = 1
    var id: UUID
    /// Incremented on every committed edit, so async results can be matched to the room they were based on.
    var revision = 0
    var units = "meters"
    var dimensions: RoomDimensions
    var walls: [Wall]
    var doors: [WallOpening]
    var windows: [WallOpening]
    var openings: [WallOpening]
    var objects: [RoomObject]
    var capture: CaptureAlignment

    static let jsonEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    static let jsonDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    func jsonData() throws -> Data {
        try Self.jsonEncoder.encode(self)
    }
}

nonisolated struct RoomDimensions: Codable, Equatable {
    /// Extent along X.
    var width: Double
    /// Extent along Z.
    var length: Double
    /// Tallest wall.
    var height: Double
}

nonisolated struct Vector3: Codable, Equatable {
    var x: Double
    var y: Double
    var z: Double
}

/// A point on the floor plan (y omitted).
nonisolated struct FloorPoint: Codable, Equatable {
    var x: Double
    var z: Double
}

/// A wall as a line segment on the floor plan. RoomPlan walls have no thickness.
nonisolated struct Wall: Codable, Identifiable, Equatable {
    var id: String
    var start: FloorPoint
    var end: FloorPoint
    var height: Double
    var sourceId: UUID?
}

/// A door, window, or open doorway, drawn as a segment along its wall.
nonisolated struct WallOpening: Codable, Identifiable, Equatable {
    var id: String
    /// The wall this sits in, when RoomPlan reports it.
    var wallId: String?
    var start: FloorPoint
    var end: FloorPoint
    /// Height of the opening's bottom edge above the floor (0 for doors, sill height for windows).
    var bottomY: Double
    var height: Double
    /// Doors only.
    var isOpen: Bool?
    var sourceId: UUID?
}

/// How the room frame relates to RoomPlan's world frame:
/// roomPoint = rotateY(-alignmentYawDegrees) * capturePoint - alignmentOffset
nonisolated struct CaptureAlignment: Codable, Equatable {
    var capturedAt: Date
    var alignmentYawDegrees: Double
    var alignmentOffset: Vector3
}
