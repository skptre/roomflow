import Foundation
import Testing
import simd
@testable import RoomFlow

struct WallArtTrackerTests {
    /// A `WallArtSighting` with corners on the plane through `center` perpendicular to `normal`,
    /// `width`×`height`, frontality 1, seen from `camera`.
    private func sighting(center: SIMD3<Float>, width: Float = 0.4, height: Float = 0.3,
                          camera: SIMD3<Float> = [0, 1.5, 0], normal: SIMD3<Float> = [0, 0, 1]) -> WallArtSighting {
        let n = simd_normalize(normal)
        // Build an "up" and "right" basis on the plane.
        let worldUp = SIMD3<Float>(0, 1, 0)
        var right = simd_cross(worldUp, n)
        if simd_length(right) < 1e-4 { right = SIMD3<Float>(1, 0, 0) }
        right = simd_normalize(right)
        let up = simd_normalize(simd_cross(n, right))
        let hw = width / 2, hh = height / 2
        let tl = center - right * hw + up * hh
        let tr = center + right * hw + up * hh
        let br = center + right * hw - up * hh
        let bl = center - right * hw - up * hh
        return WallArtSighting(corners: [tl, tr, br, bl], normal: n, standoff: 0, width: width, height: height,
                               center: center, cameraPosition: camera, timestamp: 1,
                               quad: [[0, 0], [1, 0], [1, 1], [0, 1]], frontality: 1)
    }

    private func wall(z: Float = -3, width: Float = 4, height: Float = 2.6, center: SIMD3<Float>? = nil) -> LiveSurface {
        var t = matrix_identity_float4x4
        t.columns.3 = SIMD4(center ?? [0, height / 2, z], 1)
        return LiveSurface(sourceId: UUID(), kind: .wall, transform: t, dimensions: [width, height, 0])
    }

    @Test func groupsByPositionAndNormal() {
        var tracker = WallArtTracker()
        let a = sighting(center: [0, 1.4, -3])
        let b = sighting(center: [0.05, 1.4, -3]) // 5 cm away → same group
        let c = sighting(center: [0, 1.4, -3], normal: [1, 0, 0]) // different normal → new group

        let ra = tracker.add(a)
        let rb = tracker.add(b)
        let rc = tracker.add(c)

        #expect(ra.group == rb.group)
        #expect(rc.group != ra.group)
        #expect(ra.isNewBest == true) // always true for a new group
        #expect(tracker.sightingCount(group: ra.group) == 2)
        #expect(tracker.sightingCount(group: rc.group) == 1)
        #expect(tracker.sightingCount(group: 99) == 0)
    }

    @Test func confirmedRequiresThreeSightingsAndCameraSpread() {
        var tracker = WallArtTracker()
        for _ in 0..<3 {
            _ = tracker.add(sighting(center: [0, 1.4, -3], camera: [0, 1.5, 0]))
        }
        #expect(tracker.confirmedCount == 0)

        var tracker2 = WallArtTracker()
        for x: Float in [0, 0.15, 0.3] {
            _ = tracker2.add(sighting(center: [0, 1.4, -3], camera: [x, 1.5, 0]))
        }
        #expect(tracker2.confirmedCount == 1)
    }

    @Test func finalizeAttachesToNearestContainingWall() {
        var tracker = WallArtTracker()
        for x: Float in [0, 0.15, 0.3] {
            _ = tracker.add(sighting(center: [0.5, 1.4, -3], camera: [x, 1.5, 0]))
        }
        let targetWall = wall(z: -3, width: 4, height: 2.6, center: [0, 1.3, -3])
        let results = tracker.finalize(walls: [targetWall])
        #expect(results.count == 1)
        let item = results[0].item
        #expect(abs(item.centerX - 0.5) < 0.02)
        #expect(abs(item.centerY - 0.1) < 0.02)
        #expect(abs(item.width - 0.4) < 0.02)
        #expect(item.wallSourceId == targetWall.sourceId)
    }

    @Test func mergesOverlappingItemsOnSameWall() {
        var tracker = WallArtTracker()
        for x: Float in [0, 0.15, 0.3] {
            _ = tracker.add(sighting(center: [0, 1.3, -3], width: 0.38, height: 0.3, camera: [x, 1.5, 0]))
        }
        for x: Float in [0, 0.15, 0.3] {
            _ = tracker.add(sighting(center: [0.43, 1.3, -3], width: 0.38, height: 0.3, camera: [x, 1.5, 0]))
        }
        let targetWall = wall(z: -3, width: 4, height: 2.6, center: [0, 1.3, -3])
        let results = tracker.finalize(walls: [targetWall])
        #expect(results.count == 1)
        #expect(abs(results[0].item.width - 0.81) < 0.02)
        #expect(results[0].groups.count == 2)
    }

    @Test func groupFarInFrontOfEveryWallIsDropped() {
        var tracker = WallArtTracker()
        for x: Float in [0, 0.15, 0.3] {
            _ = tracker.add(sighting(center: [0, 1.3, -2], camera: [x, 1.5, 0])) // 1 m in front of the z=-3 wall
        }
        let targetWall = wall(z: -3, width: 4, height: 2.6, center: [0, 1.3, -3])
        let results = tracker.finalize(walls: [targetWall])
        #expect(results.isEmpty)
    }

    @Test func wallArtItemEncodesAndDecodesEqual() throws {
        let item = WallArtItem(id: UUID(), wallSourceId: UUID(), centerX: 0.5, centerY: 0.1, width: 0.4,
                               height: 0.3, standoff: 0.02, sightingCount: 3, photoFileName: nil)
        let data = try JSONEncoder().encode(item)
        let decoded = try JSONDecoder().decode(WallArtItem.self, from: data)
        #expect(decoded == item)
    }
}
