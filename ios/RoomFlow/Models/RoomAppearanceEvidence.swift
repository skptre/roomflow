import Foundation

/// Approximate appearance evidence for a capture, kept apart from measured geometry.
/// Nothing here changes a RoomPlan category, dimension, or transform.
nonisolated struct RoomAppearanceEvidence: Codable, Equatable, Sendable {
    var schemaVersion = 1
    var captureId: UUID
    /// Camera-sampled colors keyed by RoomPlan source UUID.
    var colors: [SourceColor]
    var floorColor: EstimatedColor?
    /// Candidate photo regions for captured objects.
    var associations: [RoomPhotoAssociation]
}

nonisolated struct SourceColor: Codable, Equatable, Sendable {
    var sourceId: UUID
    var hex: String
    var sampleCount: Int
    /// Always "camera-estimate": lighting-dependent, not a material or product color.
    var provenance = "camera-estimate"
}

/// Where a captured object should appear in a reference photo, projected from its measured box.
/// A candidate region only: it doesn't prove the object is visible (something may be in front of it),
/// and it identifies no product.
nonisolated struct RoomPhotoAssociation: Codable, Equatable, Sendable {
    /// Final RoomPlan object identifier.
    var sourceId: UUID
    var photoId: UUID
    /// Normalized [x, y, width, height], top-left origin, in the photo's sensor-orientation pixels.
    var rect: [Double]
    var method = "projected-bounds"
}
