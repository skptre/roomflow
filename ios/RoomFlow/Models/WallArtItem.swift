import Foundation

/// A confirmed piece of wall art, attached to a final wall and expressed in that wall's local frame
/// (meters from the wall's center, +x along the wall, +y up). Produced only by `WallArtTracker.finalize`;
/// a measured estimate (camera + LiDAR), never claimed exact.
nonisolated struct WallArtItem: Codable, Equatable, Identifiable, Sendable {
    var id: UUID
    /// `LiveSurface.sourceId` of the final wall this item is attached to.
    var wallSourceId: UUID
    var centerX: Double
    var centerY: Double
    var width: Double
    var height: Double
    /// Distance (m) the panel sits in front of the wall plane; 0 when flush.
    var standoff: Double
    /// Number of sightings that contributed (summed across merged groups).
    var sightingCount: Int
    /// Cropped reference photo file name, if one was captured; nil until a photo is attached.
    var photoFileName: String?
    var method: String = "rectangle-lidar-v1"
    /// RoomPlan native world-space center (meters, same frame as `capture.roomplan.json`), on the
    /// measured plane; nil for items saved before this existed or when `WallArtTracker.finalize`
    /// couldn't resolve it. Filled by `finalize`, exported as `wallArt.json`'s `center`.
    var worldCenter: [Double]? = nil
    /// Unit vector, RoomPlan native world space, pointing from the wall into the room (the art's
    /// front). Nil alongside `worldCenter`.
    var worldNormal: [Double]? = nil
}
