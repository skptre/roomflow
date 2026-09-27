import Foundation

/// Which scanned objects appear in at least one of the given photos. Presentation only: it never
/// changes measurements or which photos are shared.
nonisolated struct PhotoCoverage: Equatable {
    var covered: Int
    var total: Int
    /// Names of objects without a photo, in room order, repeats collapsed ("Chair ×2").
    var missing: [String]

    var summary: String? {
        guard total > 0 else { return nil }
        if covered == total { return total == 1 ? "Photos cover the only item" : "Photos cover all \(total) items" }
        return "Photos cover \(covered) of \(total) items — missing: \(missing.joined(separator: ", "))"
    }

    /// `photoIds`: the photos that count (e.g. only those being shared). `label`: the person's own name for an object.
    static func make(objects: [RoomObject], associations: [RoomPhotoAssociation], photoIds: Set<UUID>,
                     label: (UUID) -> String?) -> PhotoCoverage {
        let scanned = objects.compactMap { object in object.sourceId.map { (object, $0) } }
        let pictured = Set(associations.filter { photoIds.contains($0.photoId) }.map(\.sourceId))
        var order: [String] = []
        var counts: [String: Int] = [:]
        for (object, id) in scanned where !pictured.contains(id) {
            let name = label(id) ?? ObjectNames.display(category: object.category)
            if counts[name] == nil { order.append(name) }
            counts[name, default: 0] += 1
        }
        let missingCount = counts.values.reduce(0, +)
        return PhotoCoverage(covered: scanned.count - missingCount, total: scanned.count,
                             missing: order.map { name in counts[name, default: 1] > 1 ? "\(name) ×\(counts[name]!)" : name })
    }
}
