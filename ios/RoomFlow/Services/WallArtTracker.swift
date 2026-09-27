import Foundation
import simd

/// Groups `WallArtSighting`s seen across a scan by position/orientation, decides which groups are
/// confirmed (seen enough, from different-enough spots to triangulate), and attaches confirmed groups to
/// the final room's walls to produce `WallArtItem`s. Pure/deterministic; no I/O, no model inference.
/// See `docs/superpowers/plans/2026-09-26-wall-art-detection.md` for the rule derivation.
nonisolated struct WallArtTracker {
    /// One candidate piece of art: sightings judged to be the same physical rectangle.
    private struct Group {
        var sightings: [WallArtSighting] = []
        var meanCenter: SIMD3<Float> = .zero
        var meanNormal: SIMD3<Float> = .zero
        /// Best `frontality × width × height` seen so far in this group.
        var bestScore: Float = 0
    }

    /// A confirmed group placed on a final wall, in that wall's local frame (meters), before merging.
    private struct Placed {
        var wall: LiveSurface
        var centerX: Double
        var centerY: Double
        var width: Double
        var height: Double
        var standoff: Double
        var sightingCount: Int
        var groupIndices: [Int]
    }

    private var groups: [Group] = []

    init() {}

    /// Joins `sighting` to the first group whose running-mean center is within 0.15 m and whose normal
    /// agrees (dot > 0.9), or starts a new group. Keeps at most 30 sightings per group (oldest dropped).
    /// `isNewBest` is true for a new group, or when this sighting's `frontality × width × height` beats
    /// the group's previous best by more than 10%.
    mutating func add(_ sighting: WallArtSighting) -> (group: Int, isNewBest: Bool) {
        let normal = simd_normalize(sighting.normal)
        for index in groups.indices {
            let group = groups[index]
            guard simd_distance(group.meanCenter, sighting.center) <= 0.15,
                  simd_dot(simd_normalize(group.meanNormal), normal) > 0.9 else { continue }

            let score = sighting.frontality * sighting.width * sighting.height
            let isNewBest = score > group.bestScore * 1.1
            var updated = group
            updated.sightings.append(sighting)
            if updated.sightings.count > 30 { updated.sightings.removeFirst(updated.sightings.count - 30) }
            recomputeMeans(&updated)
            if isNewBest { updated.bestScore = score }
            groups[index] = updated
            return (index, isNewBest)
        }

        var newGroup = Group()
        newGroup.sightings = [sighting]
        recomputeMeans(&newGroup)
        newGroup.bestScore = sighting.frontality * sighting.width * sighting.height
        groups.append(newGroup)
        return (groups.count - 1, true)
    }

    /// Sightings currently held by `group` (a tracker group index from `add`); 0 for an unknown index.
    func sightingCount(group: Int) -> Int {
        groups.indices.contains(group) ? groups[group].sightings.count : 0
    }

    /// Number of groups with ≥3 sightings whose camera positions span ≥0.2 m (enough to triangulate,
    /// not just repeated frames from one spot).
    var confirmedCount: Int {
        groups.filter(isConfirmed).count
    }

    /// For each confirmed group: median width/height/standoff and median center (per axis), attached to
    /// the final wall with the nearest plane within 0.4 m (`|local z|`) whose extents (+0.1 m slack)
    /// contain the center. Unattached groups are dropped. Items on the same wall whose wall-local boxes
    /// overlap or sit within 0.10 m are then merged (union box; standoff = max; sightingCount = sum;
    /// `groups` = the union of contributing group indices, sorted). Fresh `UUID()`s; `photoFileName` nil.
    func finalize(walls: [LiveSurface]) -> [(item: WallArtItem, groups: [Int])] {
        var placed: [Placed] = []
        for (index, group) in groups.enumerated() where isConfirmed(group) {
            let centers = group.sightings.map(\.center)
            let medianCenter = SIMD3<Float>(median(centers.map(\.x)), median(centers.map(\.y)), median(centers.map(\.z)))
            let medianWidth = median(group.sightings.map(\.width))
            let medianHeight = median(group.sightings.map(\.height))
            let medianStandoff = median(group.sightings.map(\.standoff))

            guard let wall = attach(medianCenter, to: walls) else { continue }
            let local = wall.transform.inverse * SIMD4(medianCenter, 1)
            placed.append(Placed(wall: wall, centerX: Double(local.x), centerY: Double(local.y),
                                  width: Double(medianWidth), height: Double(medianHeight),
                                  standoff: Double(medianStandoff), sightingCount: group.sightings.count,
                                  groupIndices: [index]))
        }

        // Merge items on the same wall whose wall-local boxes overlap or are within 0.10 m.
        var merged: [Placed] = []
        for wallId in Set(placed.map(\.wall.sourceId)) {
            var bucket = placed.filter { $0.wall.sourceId == wallId }
            var changed = true
            while changed {
                changed = false
                outer: for i in bucket.indices {
                    for j in bucket.indices where j > i {
                        if boxesOverlapOrClose(bucket[i], bucket[j], margin: 0.10) {
                            bucket[i] = union(bucket[i], bucket[j])
                            bucket.remove(at: j)
                            changed = true
                            break outer
                        }
                    }
                }
            }
            merged.append(contentsOf: bucket)
        }

        return merged.map { p in
            let sortedGroups = p.groupIndices.sorted()
            let contributing = sortedGroups.flatMap { groups[$0].sightings }
            let (worldCenter, worldNormal) = worldPose(of: contributing)
            let item = WallArtItem(id: UUID(), wallSourceId: p.wall.sourceId, centerX: p.centerX, centerY: p.centerY,
                                    width: p.width, height: p.height, standoff: p.standoff,
                                    sightingCount: p.sightingCount, photoFileName: nil,
                                    worldCenter: worldCenter, worldNormal: worldNormal)
            return (item, sortedGroups)
        }
    }

    // MARK: - Helpers

    private func isConfirmed(_ group: Group) -> Bool {
        guard group.sightings.count >= 3 else { return false }
        let cameras = group.sightings.map(\.cameraPosition)
        var maxDistance: Float = 0
        for i in cameras.indices {
            for j in cameras.indices where j > i {
                maxDistance = max(maxDistance, simd_distance(cameras[i], cameras[j]))
            }
        }
        return maxDistance >= 0.2
    }

    private func recomputeMeans(_ group: inout Group) {
        let count = Float(group.sightings.count)
        group.meanCenter = group.sightings.reduce(SIMD3<Float>.zero) { $0 + $1.center } / count
        let normalSum = group.sightings.reduce(SIMD3<Float>.zero) { $0 + simd_normalize($1.normal) }
        group.meanNormal = simd_length(normalSum) > 1e-6 ? simd_normalize(normalSum) : normalSum
    }

    /// Nearest wall whose plane is within 0.4 m of `center` (`|local z|`) and whose extents (+0.1 m
    /// slack) contain it.
    private func attach(_ center: SIMD3<Float>, to walls: [LiveSurface]) -> LiveSurface? {
        var best: (wall: LiveSurface, distance: Float)?
        for wall in walls where wall.kind == .wall {
            let local = wall.transform.inverse * SIMD4(center, 1)
            guard abs(local.z) <= 0.4,
                  abs(local.x) <= wall.dimensions.x / 2 + 0.1,
                  abs(local.y) <= wall.dimensions.y / 2 + 0.1 else { continue }
            if best.map({ abs(local.z) < $0.distance }) ?? true { best = (wall, abs(local.z)) }
        }
        return best?.wall
    }

    /// RoomPlan-native world center (median per axis, on the measured plane) and unit normal (sightings'
    /// normals summed then normalized, matching `recomputeMeans`) across every sighting that contributed
    /// to a final item, for `wallArt.json`. `sightings` is never empty for a confirmed group.
    private func worldPose(of sightings: [WallArtSighting]) -> (center: [Double], normal: [Double]) {
        let center = SIMD3<Float>(median(sightings.map(\.center.x)), median(sightings.map(\.center.y)),
                                   median(sightings.map(\.center.z)))
        let normalSum = sightings.reduce(SIMD3<Float>.zero) { $0 + simd_normalize($1.normal) }
        let normal = simd_length(normalSum) > 1e-6 ? simd_normalize(normalSum) : simd_normalize(sightings[0].normal)
        return ([Double(center.x), Double(center.y), Double(center.z)], [Double(normal.x), Double(normal.y), Double(normal.z)])
    }

    private func median(_ values: [Float]) -> Float {
        let sorted = values.sorted()
        guard !sorted.isEmpty else { return 0 }
        let mid = sorted.count / 2
        return sorted.count.isMultiple(of: 2) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }

    private func boxesOverlapOrClose(_ a: Placed, _ b: Placed, margin: Double) -> Bool {
        let (ax0, ax1) = (a.centerX - a.width / 2, a.centerX + a.width / 2)
        let (ay0, ay1) = (a.centerY - a.height / 2, a.centerY + a.height / 2)
        let (bx0, bx1) = (b.centerX - b.width / 2, b.centerX + b.width / 2)
        let (by0, by1) = (b.centerY - b.height / 2, b.centerY + b.height / 2)
        return ax0 <= bx1 + margin && bx0 <= ax1 + margin && ay0 <= by1 + margin && by0 <= ay1 + margin
    }

    private func union(_ a: Placed, _ b: Placed) -> Placed {
        let x0 = min(a.centerX - a.width / 2, b.centerX - b.width / 2)
        let x1 = max(a.centerX + a.width / 2, b.centerX + b.width / 2)
        let y0 = min(a.centerY - a.height / 2, b.centerY - b.height / 2)
        let y1 = max(a.centerY + a.height / 2, b.centerY + b.height / 2)
        var result = a
        result.centerX = (x0 + x1) / 2
        result.centerY = (y0 + y1) / 2
        result.width = x1 - x0
        result.height = y1 - y0
        result.standoff = max(a.standoff, b.standoff)
        result.sightingCount = a.sightingCount + b.sightingCount
        result.groupIndices = a.groupIndices + b.groupIndices
        return result
    }
}
