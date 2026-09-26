import Foundation

/// What the user chose to share for a room, and their corrections.
///
/// Holds choices only: no geometry and no category. A label correction sits beside RoomPlan's
/// original category (keyed by source UUID, never by list position) and never replaces it.
nonisolated struct RoomEvidenceSelection: Codable, Equatable, Sendable {
    var schemaVersion = 1
    /// Incremented on every change, so an export made from an older selection can be recognized.
    private(set) var revision = 0
    /// Master switch: off means geometry-only sharing, whatever individual photos are ticked.
    private(set) var includePhotos: Bool
    private(set) var selectedPhotoIDs: Set<UUID>
    private(set) var annotations: [ObjectAnnotation] = []

    /// Everything shared by default when photos exist; geometry-only when there are none.
    static func initial(for photos: [RoomPhotoEvidence]) -> RoomEvidenceSelection {
        RoomEvidenceSelection(includePhotos: !photos.isEmpty, selectedPhotoIDs: Set(photos.map(\.id)))
    }

    /// The photos that would be shared, in their original order.
    func sharedPhotos(from photos: [RoomPhotoEvidence]) -> [RoomPhotoEvidence] {
        includePhotos ? photos.filter { selectedPhotoIDs.contains($0.id) } : []
    }

    func isSelected(_ photoID: UUID) -> Bool { selectedPhotoIDs.contains(photoID) }

    func label(for sourceId: UUID) -> String? {
        annotations.first { $0.sourceId == sourceId }?.label
    }

    mutating func setIncludePhotos(_ include: Bool) {
        guard include != includePhotos else { return }
        includePhotos = include
        revision += 1
    }

    mutating func setPhoto(_ photoID: UUID, included: Bool) {
        guard included != selectedPhotoIDs.contains(photoID) else { return }
        if included { selectedPhotoIDs.insert(photoID) } else { selectedPhotoIDs.remove(photoID) }
        revision += 1
    }

    /// Sets the user's name for a captured object; blank text removes the correction.
    mutating func setLabel(_ label: String, for sourceId: UUID) {
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        let existing = annotations.firstIndex { $0.sourceId == sourceId }
        switch (existing, trimmed.isEmpty) {
        case (nil, true):
            return
        case (let index?, true):
            annotations.remove(at: index)
        case (let index?, false):
            guard annotations[index].label != trimmed else { return }
            annotations[index].label = trimmed
        case (nil, false):
            annotations.append(ObjectAnnotation(sourceId: sourceId, label: trimmed))
        }
        revision += 1
    }
}

/// A user-supplied name for a captured object, e.g. "trash can" for RoomPlan's "storage".
nonisolated struct ObjectAnnotation: Codable, Equatable, Sendable {
    var sourceId: UUID
    var label: String
    var provenance = "user-supplied"
}
