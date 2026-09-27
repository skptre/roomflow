import Foundation
import simd

/// A rectangle judged to be art (or similar) hanging on a scanned wall: measured on the plane where LiDAR
/// actually sees it, which may stand off the wall (e.g. a layered canvas). All geometry is world space,
/// RoomPlan native (meters, +Y up). Corners are in ROOM orientation (top-left, top-right, bottom-right,
/// bottom-left as seen facing the wall, world +Y up), whatever way the phone was held; `width` runs along
/// the wall, `height` vertically. `quad` holds the matching normalized, top-left-origin image points —
/// kept for cropping an upright reference photo.
nonisolated struct WallArtSighting: Equatable, Sendable {
    /// World-space corners on the measured plane in room order (top-left first), same order as `quad`.
    var corners: [SIMD3<Float>]
    /// Wall normal, flipped to face the camera.
    var normal: SIMD3<Float>
    /// Distance (m) the measured plane sits in front of the wall plane; 0 when flush or unmeasured.
    var standoff: Float
    var width: Float
    var height: Float
    var center: SIMD3<Float>
    var cameraPosition: SIMD3<Float>
    var timestamp: TimeInterval
    /// Normalized, top-left-origin image points of `corners`, in the same (room) order — so not necessarily
    /// the image's own top-left first when the phone was held in portrait.
    var quad: [SIMD2<Float>]
    /// dot(normalize(camera → center), −normal), clamped to 0…1: 1 = viewed head-on.
    var frontality: Float
}

/// Why a candidate rectangle was not judged to be wall art.
nonisolated enum WallArtRejection: String, Sendable {
    /// No wall's plane is hit by all four corner rays.
    case notOnWall
    /// Some corners hit a wall, but no single wall holds all four.
    case spansWalls
    /// LiDAR samples across the rectangle disagree by more than the uneven-depth threshold.
    case uneven
    /// The measured surface sits behind the wall plane (seen through a gap).
    case behindWall
    /// The measured surface sits implausibly far in front of the wall.
    case tooFarInFront
    /// Measured width/height fall outside the plausible art size range or aspect ratio.
    case sizeOutOfRange
    /// The rectangle's lowest edge is too close to the floor to be wall-hung art.
    case nearFloor
    /// The rectangle overlaps a door/window/opening on its wall.
    case overlapsOpening
    /// The rectangle overlaps a detected television object.
    case overlapsTV
    /// The rectangle's aspect ratio and width match a television RoomPlan failed to detect.
    case likelyTV
}

/// The result of judging one candidate rectangle.
nonisolated enum WallArtVerdict: Equatable, Sendable {
    case sighting(WallArtSighting)
    case rejected(WallArtRejection)
}

/// Pure judge: decides whether one image rectangle is plausibly art hanging on a scanned wall. Deterministic
/// geometry and depth checks only; no model inference, no state, no I/O. Applies the rules in order and
/// returns the first rejection reached.
nonisolated enum WallArtDetector {
    /// Judges `quad` (normalized, top-left-origin image corners: top-left, top-right, bottom-right,
    /// bottom-left) seen from `camera` against the live `surfaces` and `objects`. `depthAt(u, v)` returns
    /// LiDAR depth (meters) at a normalized, top-left-origin image point, or nil if unavailable.
    static func judge(quad: [SIMD2<Float>], camera: PhotoFrameSnapshot, surfaces: [LiveSurface],
                      objects: [LiveObject], depthAt: (Float, Float) -> Float?) -> WallArtVerdict {
        let origin = SIMD3(camera.cameraToWorld.columns.3.x, camera.cameraToWorld.columns.3.y, camera.cameraToWorld.columns.3.z)
        let width = Float(camera.imageWidth), height = Float(camera.imageHeight)
        let directions = quad.map { ray(camera: camera, u: $0.x * width, v: $0.y * height) }

        // Rule 1: nearest wall whose plane all four rays hit, in front of the camera, inside its extents.
        var anyHit = false
        var best: (wall: LiveSurface, hits: [SIMD3<Float>], distance: Float)?
        for wall in surfaces where wall.kind == .wall {
            let wallPoint = SIMD3(wall.transform.columns.3.x, wall.transform.columns.3.y, wall.transform.columns.3.z)
            let wallNormal = simd_normalize(SIMD3(wall.transform.columns.2.x, wall.transform.columns.2.y, wall.transform.columns.2.z))
            let hits = directions.compactMap { direction -> SIMD3<Float>? in
                guard let (_, point) = hitPlane(origin: origin, direction: direction, point: wallPoint, normal: wallNormal) else { return nil }
                return inside(wall, point: point, slack: 0.1) ? point : nil
            }
            if !hits.isEmpty { anyHit = true }
            guard hits.count == 4 else { continue }
            let distance = hits.map { simd_distance($0, origin) }.reduce(0, +) / 4
            if best.map({ distance < $0.distance }) ?? true { best = (wall, hits, distance) }
        }
        guard let best else { return .rejected(anyHit ? .spansWalls : .notOnWall) }
        let wall = best.wall

        // Rule 2: normal facing the camera; LiDAR at 5 points vs. expected depth on the wall plane.
        let wallPoint = SIMD3(wall.transform.columns.3.x, wall.transform.columns.3.y, wall.transform.columns.3.z)
        var normal = simd_normalize(SIMD3(wall.transform.columns.2.x, wall.transform.columns.2.y, wall.transform.columns.2.z))
        if simd_dot(normal, origin - wallPoint) < 0 { normal = -normal }

        let mid = quad.reduce(SIMD2<Float>(repeating: 0), +) / 4
        let samplePoints = [mid] + quad.map { mid + ($0 - mid) * 0.5 }
        let worldToCamera = camera.cameraToWorld.inverse
        let deltas: [Float] = samplePoints.compactMap { p in
            guard let measured = depthAt(p.x, p.y) else { return nil }
            let direction = ray(camera: camera, u: p.x * width, v: p.y * height)
            guard let (_, onWall) = hitPlane(origin: origin, direction: direction, point: wallPoint, normal: normal) else { return nil }
            let expected = -(worldToCamera * SIMD4(onWall, 1)).z
            return measured - expected
        }

        var standoff: Float = 0
        var measuredPoint = wallPoint
        if deltas.count >= 3 {
            let sorted = deltas.sorted()
            let median = sorted[sorted.count / 2]
            let range = sorted.last! - sorted.first!
            guard range <= 0.06 else { return .rejected(.uneven) }
            guard median <= 0.15 else { return .rejected(.behindWall) }
            guard median >= -0.30 else { return .rejected(.tooFarInFront) }
            standoff = max(0, -median)
            measuredPoint = wallPoint - normal * median
        }

        // Rule 3: re-cast the 4 corner rays onto the measured plane.
        let hitCorners = directions.compactMap { hitPlane(origin: origin, direction: $0, point: measuredPoint, normal: normal)?.point }
        guard hitCorners.count == 4 else { return .rejected(.notOnWall) }
        // The image is in the sensor's fixed landscape frame while the phone is usually upright, so image
        // "top-left" need not be the room's. Reorder into room orientation; `quad` follows so each image
        // corner stays paired with its world corner (and the reference crop comes out upright).
        let order = roomOrder(hitCorners, normal: normal)
        let panel = order.map { hitCorners[$0] }
        let roomQuad = order.map { quad[$0] }
        let panelWidth = (simd_distance(panel[0], panel[1]) + simd_distance(panel[3], panel[2])) / 2
        let panelHeight = (simd_distance(panel[0], panel[3]) + simd_distance(panel[1], panel[2])) / 2
        let center = panel.reduce(SIMD3<Float>(repeating: 0), +) / 4

        // Rule 4: size and aspect ratio.
        guard (0.25...2.5).contains(panelWidth), (0.25...2.5).contains(panelHeight),
              max(panelWidth, panelHeight) / min(panelWidth, panelHeight) <= 5 else {
            return .rejected(.sizeOutOfRange)
        }

        // Rule 5: distance above the floor.
        let floorY = surfaces.filter { $0.kind == .wall }.map { $0.transform.columns.3.y - $0.dimensions.y / 2 }.min() ?? -.greatestFiniteMagnitude
        let lowestY = panel.map(\.y).min()!
        guard lowestY - floorY >= 0.40 else { return .rejected(.nearFloor) }

        // Rule 6: overlap with openings and detected TVs, in the wall's local frame.
        let toWall = wall.transform.inverse
        let local = panel.map { toWall * SIMD4($0, 1) }
        let artMin = SIMD2(local.map(\.x).min()!, local.map(\.y).min()!)
        let artMax = SIMD2(local.map(\.x).max()!, local.map(\.y).max()!)
        for opening in surfaces where opening.kind != .wall {
            let c = toWall * opening.transform.columns.3
            guard abs(c.z) < 0.3 else { continue }
            let half = SIMD2(opening.dimensions.x, opening.dimensions.y) / 2
            if overlaps(aMin: artMin, aMax: artMax, bMin: SIMD2(c.x, c.y) - half, bMax: SIMD2(c.x, c.y) + half) {
                return .rejected(.overlapsOpening)
            }
        }
        for object in objects where object.category == "television" {
            let c = toWall * SIMD4(object.center, 1)
            guard abs(c.z) < 0.5 else { continue }
            let half = SIMD2(object.dimensions.x, object.dimensions.y) / 2
            if overlaps(aMin: artMin, aMax: artMax, bMin: SIMD2(c.x, c.y) - half, bMax: SIMD2(c.x, c.y) + half) {
                return .rejected(.overlapsTV)
            }
        }

        // Rule 7: shape/size RoomPlan sometimes misses as a television.
        let longEdge = max(panelWidth, panelHeight), shortEdge = min(panelWidth, panelHeight)
        if (1.70...1.85).contains(longEdge / shortEdge), panelWidth >= 0.55 {
            return .rejected(.likelyTV)
        }

        // Rule 8: frontality.
        let cameraToCenter = simd_normalize(center - origin)
        let frontality = max(0, min(1, simd_dot(cameraToCenter, -normal)))

        return .sighting(WallArtSighting(corners: panel, normal: normal, standoff: standoff, width: panelWidth,
                                         height: panelHeight, center: center, cameraPosition: origin,
                                         timestamp: camera.timestamp, quad: roomQuad, frontality: frontality))
    }

    // MARK: - Geometry helpers

    /// Index permutation putting a cyclic quad's `corners` into room order — top-left, top-right,
    /// bottom-right, bottom-left as seen by someone facing the wall (`normal` points toward them), with
    /// "up" = world +Y. Top-left is the corner maximizing `up − right`; top-right is whichever of its two
    /// neighbors lies further right, so the result is always a rotation/reflection of the input cycle.
    /// Returns the identity order if `normal` is (near-)vertical.
    private static func roomOrder(_ corners: [SIMD3<Float>], normal: SIMD3<Float>) -> [Int] {
        let up = SIMD3<Float>(0, 1, 0)
        let rightRaw = simd_cross(-normal, up)
        guard corners.count == 4, simd_length(rightRaw) > 1e-4 else { return [0, 1, 2, 3] }
        let right = simd_normalize(rightRaw)
        let topLeft = corners.indices.max { simd_dot(corners[$0], up) - simd_dot(corners[$0], right)
                                          < simd_dot(corners[$1], up) - simd_dot(corners[$1], right) }!
        let next = (topLeft + 1) % 4, previous = (topLeft + 3) % 4
        let step = simd_dot(corners[next], right) >= simd_dot(corners[previous], right) ? 1 : 3
        return (0..<4).map { (topLeft + step * $0) % 4 }
    }

    /// World-space ray direction through a normalized-pixel image point (sensor orientation, top-left origin
    /// scaled to pixels), from the camera's pose. `d = ((u·W − cx)/fx, −(v·H − cy)/fy, −1)`, rotated by
    /// `cameraToWorld` and normalized.
    private static func ray(camera: PhotoFrameSnapshot, u: Float, v: Float) -> SIMD3<Float> {
        let intrinsics = camera.intrinsics
        let fx = intrinsics[0][0], fy = intrinsics[1][1]
        let cx = intrinsics[2][0], cy = intrinsics[2][1]
        let direction = SIMD3<Float>((u - cx) / fx, -(v - cy) / fy, -1)
        let world = camera.cameraToWorld * SIMD4(direction, 0)
        return simd_normalize(SIMD3(world.x, world.y, world.z))
    }

    /// Where a ray meets an unbounded plane, if in front of the camera (`t > 0.1`); nil if the ray is
    /// (near-)parallel to the plane or the intersection is behind/too close to the origin.
    private static func hitPlane(origin: SIMD3<Float>, direction: SIMD3<Float>, point: SIMD3<Float>,
                                 normal: SIMD3<Float>) -> (t: Float, point: SIMD3<Float>)? {
        let facing = simd_dot(direction, normal)
        guard abs(facing) > 1e-4 else { return nil }
        let t = simd_dot(point - origin, normal) / facing
        guard t > 0.1 else { return nil }
        return (t, origin + direction * t)
    }

    /// Whether `point` lies within `wall`'s extents (its own local x/y half-dimensions), with `slack` meters
    /// of tolerance on each side.
    private static func inside(_ wall: LiveSurface, point: SIMD3<Float>, slack: Float) -> Bool {
        let local = wall.transform.inverse * SIMD4(point, 1)
        return abs(local.x) <= wall.dimensions.x / 2 + slack && abs(local.y) <= wall.dimensions.y / 2 + slack
    }

    /// Whether axis-aligned 2D boxes [aMin, aMax] and [bMin, bMax] overlap.
    private static func overlaps(aMin: SIMD2<Float>, aMax: SIMD2<Float>, bMin: SIMD2<Float>, bMax: SIMD2<Float>) -> Bool {
        aMin.x < bMax.x && bMin.x < aMax.x && aMin.y < bMax.y && bMin.y < aMax.y
    }
}
