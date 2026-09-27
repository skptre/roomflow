#if DEBUG
import ARKit
import Foundation
import OSLog
import RoomPlan
import Vision
import simd

/// SPIKE (debug builds only): finds rectangles in camera frames and logs whether each one looks like
/// art hanging on a scanned wall, and why not. Nothing is stored in the room or the package.
///
/// Per rectangle: corners are cast as rays from the camera onto the live walls (all four must land on
/// the same wall), then rejected if LiDAR sees something in front of the wall at its center, if it's too
/// small or large, or if it overlaps a door/window/opening or a TV. Accepted sightings are grouped per
/// wall; `logSummary(finalRoom:)` reports the groups seen often enough to count as art.
///
/// `process` is called on the main actor; Vision runs on a private queue, one frame at a time.
nonisolated final class WallArtSpike: @unchecked Sendable {
    private struct Cluster {
        var wallId: UUID
        var center: SIMD3<Float>
        var sizes: [SIMD2<Float>] = []
        var cameraPositions: [SIMD3<Float>] = []
        /// Seconds into the scan when first accepted, to match a group with what was being pointed at.
        var firstSeen: TimeInterval = 0
        /// Panel corners (world) from the latest sighting, for merging panels into pieces.
        var corners: [SIMD3<Float>] = []
    }

    private struct Camera {
        var cameraToWorld: simd_float4x4
        var intrinsics: simd_float3x3
        var width: Float
        var height: Float
        var position: SIMD3<Float> { SIMD3(cameraToWorld.columns.3.x, cameraToWorld.columns.3.y, cameraToWorld.columns.3.z) }

        /// World-space ray through a normalized, top-left-origin image point (sensor orientation).
        func ray(_ u: Float, _ v: Float) -> SIMD3<Float> {
            let px = u * width, py = v * height
            let d = SIMD3<Float>((px - intrinsics[2][0]) / intrinsics[0][0], -(py - intrinsics[2][1]) / intrinsics[1][1], -1)
            let w = cameraToWorld * SIMD4(d, 0)
            return simd_normalize(SIMD3(w.x, w.y, w.z))
        }
    }

    private let log = Logger(subsystem: "RoomFlow", category: "WallArt")
    private let queue = DispatchQueue(label: "RoomFlow.WallArtSpike", qos: .utility)
    private let lock = NSLock()
    private var busy = false
    private var clusters: [Cluster] = []
    private var startedAt = Date()
    private var frameCount = 0

    func reset() {
        lock.lock(); busy = false; clusters = []; startedAt = Date(); frameCount = 0; lock.unlock()
    }

    /// Analyzes `frame` unless the previous frame is still being analyzed.
    func process(frame: ARFrame, surfaces: [LiveSurface], objects: [LiveObject]) {
        guard frame.camera.trackingState == .normal, surfaces.contains(where: { $0.kind == .wall }) else { return }
        lock.lock()
        if busy { lock.unlock(); return }
        busy = true; frameCount += 1
        let index = frameCount, elapsed = Date().timeIntervalSince(startedAt)
        lock.unlock()

        nonisolated(unsafe) let image = frame.capturedImage
        nonisolated(unsafe) let depth = (frame.sceneDepth ?? frame.smoothedSceneDepth)?.depthMap
        let camera = Camera(cameraToWorld: frame.camera.transform, intrinsics: frame.camera.intrinsics,
                            width: Float(frame.camera.imageResolution.width), height: Float(frame.camera.imageResolution.height))
        queue.async { [self] in
            defer { lock.lock(); busy = false; lock.unlock() }
            let request = VNDetectRectanglesRequest()
            request.maximumObservations = 8
            request.minimumSize = 0.1
            request.minimumConfidence = 0.7
            request.minimumAspectRatio = 0.2
            request.quadratureTolerance = 30
            do { try VNImageRequestHandler(cvPixelBuffer: image, orientation: .up).perform([request]) } catch { return }
            let found = request.results ?? []
            guard !found.isEmpty else { return }
            emit(String(format: "t=%.1fs frame#%d: %d rectangle(s)", elapsed, index, found.count))
            for (n, observation) in found.enumerated() {
                let verdict = judge(observation, camera: camera, surfaces: surfaces, objects: objects, depth: depth, elapsed: elapsed)
                emit("  rect\(n + 1) conf=\(String(format: "%.2f", observation.confidence)) \(verdict)")
            }
        }
    }

    /// Logs the art candidates seen from enough frames and positions, and whether their wall survived.
    func logSummary(finalRoom: CapturedRoom) {
        lock.lock(); let all = clusters; lock.unlock()
        let floorY = finalRoom.floors.first.map { $0.transform.columns.3.y }
            ?? finalRoom.walls.map { $0.transform.columns.3.y - $0.dimensions.y / 2 }.min() ?? 0
        emit("summary: \(all.count) candidate group(s); ART = seen ≥3 times from camera spots ≥0.2 m apart")
        for (n, cluster) in all.enumerated() {
            let count = Float(cluster.sizes.count)
            let w = cluster.sizes.map(\.x).reduce(0, +) / count, h = cluster.sizes.map(\.y).reduce(0, +) / count
            let spread = Self.spread(cluster.cameraPositions)
            let status = cluster.sizes.count >= 3 && spread >= 0.2 ? "ART" : "weak"
            let wall = Self.finalWall(for: cluster.center, in: finalRoom).map { String($0.identifier.uuidString.prefix(4)) } ?? "none"
            emit(String(format: "  group%d %@ first t=%.0fs %.0f×%.0f cm, center %.2f m above floor, sightings=%d spread=%.2fm finalWall=%@",
                        n + 1, status, cluster.firstSeen, w * 100, h * 100, cluster.center.y - floorY,
                        cluster.sizes.count, spread, wall))
        }

        // Panels of one artwork (layered/multi-panel canvases) show up as separate groups: merge groups on
        // the same final wall whose rectangles overlap or sit within 10 cm, and report each piece's outline.
        var pieces: [(wall: CapturedRoom.Surface, min: SIMD2<Float>, max: SIMD2<Float>, members: [Int], sightings: Int, positions: [SIMD3<Float>])] = []
        for (n, cluster) in all.enumerated() where cluster.corners.count == 4 {
            guard let wall = Self.finalWall(for: cluster.center, in: finalRoom) ?? Self.nearestWall(to: cluster.center, in: finalRoom) else { continue }
            let local = cluster.corners.map { wall.transform.inverse * SIMD4($0, 1) }
            var lo = SIMD2(local.map(\.x).min()!, local.map(\.y).min()!), hi = SIMD2(local.map(\.x).max()!, local.map(\.y).max()!)
            var members = [n + 1], sightings = cluster.sizes.count, positions = cluster.cameraPositions
            while let i = pieces.firstIndex(where: { $0.wall.identifier == wall.identifier
                && Self.overlaps($0.min - 0.1, $0.max + 0.1, lo, hi) }) {
                let other = pieces.remove(at: i)
                lo = simd_min(lo, other.min); hi = simd_max(hi, other.max)
                members += other.members; sightings += other.sightings; positions += other.positions
            }
            pieces.append((wall, lo, hi, members.sorted(), sightings, positions))
        }
        emit("pieces: \(pieces.count) (panels within 10 cm on the same wall merged)")
        for piece in pieces {
            let size = piece.max - piece.min
            let status = piece.sightings >= 3 && Self.spread(piece.positions) >= 0.2 ? "ART" : "weak"
            emit(String(format: "  piece %@ %.0f×%.0f cm on wall %@ from groups %@ (%d sightings)", status, size.x * 100, size.y * 100,
                        String(piece.wall.identifier.uuidString.prefix(4)), piece.members.map(String.init).joined(separator: "+"), piece.sightings))
        }

    }

    // MARK: - Judging one rectangle

    private func judge(_ observation: VNRectangleObservation, camera: Camera, surfaces: [LiveSurface],
                       objects: [LiveObject], depth: CVPixelBuffer?, elapsed: TimeInterval) -> String {
        // Vision: normalized, bottom-left origin → top-left origin.
        let corners = [observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft]
            .map { SIMD2<Float>(Float($0.x), 1 - Float($0.y)) }
        var best: (wall: LiveSurface, hits: [SIMD3<Float>], distance: Float)?
        var anyHit = false
        for wall in surfaces where wall.kind == .wall {
            let hits = corners.compactMap { Self.hit(origin: camera.position, direction: camera.ray($0.x, $0.y), wall: wall) }
            if !hits.isEmpty { anyHit = true }
            guard hits.count == 4 else { continue }
            let distance = hits.map { simd_distance($0, camera.position) }.reduce(0, +) / 4
            if best.map({ distance < $0.distance }) ?? true { best = (wall, hits, distance) }
        }
        guard let best else { return anyHit ? "REJECT corners not all on one wall" : "REJECT not on any wall" }
        let wall = best.wall, hits = best.hits

        let wallName = String(wall.sourceId.uuidString.prefix(4))
        let wallPoint = SIMD3(wall.transform.columns.3.x, wall.transform.columns.3.y, wall.transform.columns.3.z)
        var normal = simd_normalize(SIMD3(wall.transform.columns.2.x, wall.transform.columns.2.y, wall.transform.columns.2.z))
        if simd_dot(normal, camera.position - wallPoint) < 0 { normal = -normal } // toward the camera

        // LiDAR at five points inside the rectangle, each compared with the wall plane at that point.
        // Flush = on the wall; consistent and nearer (≤30 cm) = a flat panel standing off the wall (layered canvas);
        // uneven = an object in front; farther = seen through a gap.
        let mid = corners.reduce(SIMD2<Float>(repeating: 0), +) / 4
        let samples = [mid] + corners.map { mid + ($0 - mid) * 0.5 }
        let worldToCamera = camera.cameraToWorld.inverse
        let deltas: [Float] = samples.compactMap { p in
            guard let measured = Self.depth(in: depth, u: p.x, v: p.y),
                  let onWall = Self.hitPlane(origin: camera.position, direction: camera.ray(p.x, p.y), point: wallPoint, normal: normal)
            else { return nil }
            return measured + (worldToCamera * SIMD4(onWall, 1)).z // measured − expected z-depth
        }
        var standoff: Float = 0
        var depthNote = "depth n/a"
        if deltas.count >= 3 {
            let sorted = deltas.sorted(), median = sorted[sorted.count / 2], range = sorted.last! - sorted.first!
            depthNote = String(format: "depthΔ=%+.2fm (range %.2f, %d pts)", median, range, deltas.count)
            if median > 0.08 { return "REJECT wall=\(wallName) surface behind the wall, seen through a gap (\(depthNote))" }
            if median < -0.08 {
                guard range <= 0.05, median >= -0.30 else { return "REJECT wall=\(wallName) something in front (\(depthNote))" }
                standoff = -median
            }
        }

        // Measure on the panel's own plane (the wall shifted toward the camera by the standoff).
        let panelPoint = wallPoint + normal * standoff
        let panel = corners.compactMap { Self.hitPlane(origin: camera.position, direction: camera.ray($0.x, $0.y), point: panelPoint, normal: normal) }
        guard panel.count == 4 else { return "REJECT wall=\(wallName) panel plane not visible" }
        let width = (simd_distance(panel[0], panel[1]) + simd_distance(panel[3], panel[2])) / 2
        let height = (simd_distance(panel[0], panel[3]) + simd_distance(panel[1], panel[2])) / 2
        let center = panel.reduce(SIMD3<Float>(repeating: 0), +) / 4
        let size = String(format: "%.0f×%.0f cm", width * 100, height * 100)
        let kind = standoff > 0 ? String(format: "panel %.0f cm off wall", standoff * 100) : "flush"

        guard (0.25...2.5).contains(width), (0.25...2.5).contains(height), max(width, height) / min(width, height) <= 5 else {
            return "REJECT \(size) wall=\(wallName) size out of range (\(depthNote))"
        }
        let floorY = surfaces.filter { $0.kind == .wall }.map { $0.transform.columns.3.y - $0.dimensions.y / 2 }.min() ?? -10
        let bottom = panel.map(\.y).min()! - floorY
        guard bottom >= 0.4 else {
            return String(format: "REJECT %@ wall=%@ starts %.2f m above floor, likely furniture (%@)", size, wallName, bottom, depthNote)
        }
        let toWall = wall.transform.inverse
        let local = hits.map { toWall * SIMD4($0, 1) }
        let artMin = SIMD2(local.map(\.x).min()!, local.map(\.y).min()!)
        let artMax = SIMD2(local.map(\.x).max()!, local.map(\.y).max()!)
        for opening in surfaces where opening.kind != .wall {
            let c = toWall * opening.transform.columns.3
            guard abs(c.z) < 0.3 else { continue } // not in this wall
            let half = SIMD2(opening.dimensions.x, opening.dimensions.y) / 2
            if Self.overlaps(artMin, artMax, SIMD2(c.x, c.y) - half, SIMD2(c.x, c.y) + half) {
                return "REJECT \(size) wall=\(wallName) overlaps \(opening.kind.rawValue) (\(depthNote))"
            }
        }
        for tv in objects where tv.category == "television" {
            let c = toWall * SIMD4(tv.center, 1)
            guard abs(c.z) < 0.5 else { continue }
            let half = SIMD2(tv.dimensions.x, tv.dimensions.y) / 2
            if Self.overlaps(artMin, artMax, SIMD2(c.x, c.y) - half, SIMD2(c.x, c.y) + half) {
                return "REJECT \(size) wall=\(wallName) overlaps TV (\(depthNote))"
            }
        }
        let group = record(wallId: wall.sourceId, center: center, size: SIMD2(width, height), corners: panel,
                           camera: camera.position, elapsed: elapsed)
        return String(format: "ACCEPT %@ %@ wall=%@ bottom %.2f m %@ → group%d", size, kind, wallName, bottom, depthNote, group)
    }

    /// Adds a sighting to the group within 15 cm, or starts one. Returns its 1-based number. Grouped by
    /// position, not wall ID: live wall IDs change while RoomPlan merges walls (seen on device).
    private func record(wallId: UUID, center: SIMD3<Float>, size: SIMD2<Float>, corners: [SIMD3<Float>],
                        camera: SIMD3<Float>, elapsed: TimeInterval) -> Int {
        lock.lock(); defer { lock.unlock() }
        if let i = clusters.firstIndex(where: { simd_distance($0.center, center) < 0.15 }) {
            let n = Float(clusters[i].sizes.count)
            clusters[i].center = (clusters[i].center * n + center) / (n + 1)
            clusters[i].wallId = wallId
            clusters[i].sizes.append(size)
            clusters[i].cameraPositions.append(camera)
            clusters[i].corners = corners
            return i + 1
        }
        clusters.append(Cluster(wallId: wallId, center: center, sizes: [size], cameraPositions: [camera], firstSeen: elapsed, corners: corners))
        return clusters.count
    }

    /// The final room's wall with the nearest plane (for panels standing off the wall), within 40 cm.
    private static func nearestWall(to point: SIMD3<Float>, in room: CapturedRoom) -> CapturedRoom.Surface? {
        room.walls.map { ($0, abs((($0.transform.inverse) * SIMD4(point, 1)).z)) }
            .filter { $0.1 < 0.4 }.min { $0.1 < $1.1 }?.0
    }

    /// The final room's wall whose plane the point lies on (within 10 cm) and inside of, if any.
    private static func finalWall(for point: SIMD3<Float>, in room: CapturedRoom) -> CapturedRoom.Surface? {
        room.walls.first { wall in
            let local = wall.transform.inverse * SIMD4(point, 1)
            return abs(local.z) < 0.1 && abs(local.x) <= wall.dimensions.x / 2 + 0.05 && abs(local.y) <= wall.dimensions.y / 2 + 0.05
        }
    }

    // MARK: - Geometry helpers

    /// Where a ray meets a wall's plane, if in front of the camera and inside the wall (5 cm slack).
    private static func hit(origin: SIMD3<Float>, direction: SIMD3<Float>, wall: LiveSurface) -> SIMD3<Float>? {
        let normal = simd_normalize(SIMD3(wall.transform.columns.2.x, wall.transform.columns.2.y, wall.transform.columns.2.z))
        let point = SIMD3(wall.transform.columns.3.x, wall.transform.columns.3.y, wall.transform.columns.3.z)
        let facing = simd_dot(direction, normal)
        guard abs(facing) > 1e-4 else { return nil }
        let t = simd_dot(point - origin, normal) / facing
        guard t > 0.1 else { return nil }
        let world = origin + direction * t
        let local = wall.transform.inverse * SIMD4(world, 1)
        guard abs(local.x) <= wall.dimensions.x / 2 + 0.05, abs(local.y) <= wall.dimensions.y / 2 + 0.05 else { return nil }
        return world
    }

    /// Where a ray meets an unbounded plane, if in front of the camera.
    private static func hitPlane(origin: SIMD3<Float>, direction: SIMD3<Float>, point: SIMD3<Float>, normal: SIMD3<Float>) -> SIMD3<Float>? {
        let facing = simd_dot(direction, normal)
        guard abs(facing) > 1e-4 else { return nil }
        let t = simd_dot(point - origin, normal) / facing
        return t > 0.1 ? origin + direction * t : nil
    }

    private static func overlaps(_ aMin: SIMD2<Float>, _ aMax: SIMD2<Float>, _ bMin: SIMD2<Float>, _ bMax: SIMD2<Float>) -> Bool {
        aMin.x < bMax.x && bMin.x < aMax.x && aMin.y < bMax.y && bMin.y < aMax.y
    }

    /// Largest distance between any two camera positions (how many viewpoints a group was seen from).
    private static func spread(_ points: [SIMD3<Float>]) -> Float {
        var best: Float = 0
        for a in points { for b in points { best = max(best, simd_distance(a, b)) } }
        return best
    }

    /// LiDAR depth (m) at a normalized, top-left-origin point; nil without depth or for invalid values.
    private static func depth(in map: CVPixelBuffer?, u: Float, v: Float) -> Float? {
        guard let map else { return nil }
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return nil }
        let width = CVPixelBufferGetWidth(map), height = CVPixelBufferGetHeight(map)
        let x = min(width - 1, max(0, Int(u * Float(width)))), y = min(height - 1, max(0, Int(v * Float(height))))
        let value = base.advanced(by: y * CVPixelBufferGetBytesPerRow(map)).assumingMemoryBound(to: Float32.self)[x]
        return value.isFinite && value > 0 ? value : nil
    }

    private func emit(_ message: String) {
        log.notice("[art] \(message, privacy: .public)")
    }
}
#endif
