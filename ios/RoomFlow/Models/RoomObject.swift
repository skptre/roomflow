import Foundation

/// A piece of furniture or a fixed fixture inside the room.
///
/// Coordinates are meters in the room frame (see `RoomModel`).
/// `position` is the center of the object's footprint at its base,
/// so an object standing on the floor has `position.y == 0`.
nonisolated struct RoomObject: Codable, Identifiable, Equatable {
    /// Stable for the editing session, e.g. "bed-1".
    var id: String
    /// RoomPlan category name, e.g. "bed", "sofa", "table".
    var category: String
    var position: Vector3
    var dimensions: ObjectDimensions
    /// Rotation about the vertical axis, 0..<360, counterclockwise when viewed from above.
    /// At 0 the object's width runs along +X and its depth along +Z.
    var yawDegrees: Double
    /// False for fixtures the backend should never move (toilet, stove, stairs, …).
    var movable: Bool
    /// Where the measurements came from: "roomplan" for scanned objects.
    var source: String
    /// RoomPlan's detection confidence: "high", "medium", or "low".
    var confidence: String
    /// RoomPlan's identifier, kept so edits can be traced back to the original scan.
    var sourceId: UUID?

    /// RoomPlan categories treated as fixed fixtures. Everything else is movable furniture.
    static let fixtureCategories: Set<String> = [
        "bathtub", "dishwasher", "fireplace", "oven", "refrigerator",
        "sink", "stairs", "stove", "toilet", "washerDryer",
    ]

    static func isMovable(category: String) -> Bool {
        !fixtureCategories.contains(category)
    }
}

nonisolated struct ObjectDimensions: Codable, Equatable {
    /// Along the object's local X axis.
    var width: Double
    var height: Double
    /// Along the object's local Z axis.
    var depth: Double
}
