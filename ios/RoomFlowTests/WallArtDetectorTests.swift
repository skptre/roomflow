import Foundation
import Testing
import simd
@testable import RoomFlow

struct WallArtDetectorTests {
    /// 1920×1440 sensor, fx = fy = 1500, principal point centered; camera at (0, 1.5, 0) looking down −Z.
    private func camera(at position: SIMD3<Float> = [0, 1.5, 0]) -> PhotoFrameSnapshot {
        var pose = matrix_identity_float4x4
        pose.columns.3 = SIMD4(position, 1)
        return PhotoFrameSnapshot(timestamp: 1, cameraToWorld: pose,
                                  intrinsics: simd_float3x3(columns: ([1500, 0, 0], [0, 1500, 0], [960, 720, 1])),
                                  imageWidth: 1920, imageHeight: 1440, trackingNormal: true)
    }

    /// A wall facing +Z (floor at y = 0 when centered at height/2).
    private func wall(z: Float = -3, kind: LiveSurface.Kind = .wall, width: Float = 4, height: Float = 2.6,
                      center: SIMD3<Float>? = nil) -> LiveSurface {
        var t = matrix_identity_float4x4
        t.columns.3 = SIMD4(center ?? [0, height / 2, z], 1)
        return LiveSurface(sourceId: UUID(), kind: kind, transform: t, dimensions: [width, height, 0])
    }

    /// Normalized image quad (TL, TR, BR, BL) of a world rectangle x0…x1, y0…y1 at depth z, seen by `camera()`.
    private func quad(x0: Float, x1: Float, y0: Float, y1: Float, z: Float = -3, cameraY: Float = 1.5) -> [SIMD2<Float>] {
        let d = -z
        func p(_ x: Float, _ y: Float) -> SIMD2<Float> {
            SIMD2((960 + 1500 * x / d) / 1920, (720 - 1500 * (y - cameraY) / d) / 1440)
        }
        return [p(x0, y1), p(x1, y1), p(x1, y0), p(x0, y0)]
    }

    private let flush: (Float, Float) -> Float? = { _, _ in 3.0 }
    private let noDepth: (Float, Float) -> Float? = { _, _ in nil }

    @Test func measuresFlushArt() {
        let verdict = WallArtDetector.judge(quad: quad(x0: -0.3, x1: 0.3, y0: 1.2, y1: 1.6), camera: camera(),
                                            surfaces: [wall()], objects: [], depthAt: flush)
        guard case .sighting(let s) = verdict else { Issue.record("expected sighting, got \(verdict)"); return }
        #expect(abs(s.width - 0.6) < 0.01)
        #expect(abs(s.height - 0.4) < 0.01)
        #expect(s.standoff == 0)
        #expect(s.frontality > 0.99)
    }

    @Test func panelStandingOffTheWallIsMeasuredOnItsOwnPlane() {
        // Surface really at z = −2.8 (20 cm in front); quad drawn from that plane.
        let verdict = WallArtDetector.judge(quad: quad(x0: -0.19, x1: 0.19, y0: 1.0, y1: 1.8, z: -2.8), camera: camera(),
                                            surfaces: [wall()], objects: [], depthAt: { _, _ in 2.8 })
        guard case .sighting(let s) = verdict else { Issue.record("expected sighting, got \(verdict)"); return }
        #expect(abs(s.standoff - 0.2) < 0.01)
        #expect(abs(s.width - 0.38) < 0.01) // not the ~7% larger size on the wall plane
    }

    @Test func rejectsUnevenDepthAndSurfacesBehindOrFarInFront() {
        var n = 0
        let uneven: (Float, Float) -> Float? = { _, _ in n += 1; return n.isMultiple(of: 2) ? 2.5 : 3.0 }
        let q = quad(x0: -0.3, x1: 0.3, y0: 1.2, y1: 1.6)
        #expect(WallArtDetector.judge(quad: q, camera: camera(), surfaces: [wall()], objects: [], depthAt: uneven) == .rejected(.uneven))
        #expect(WallArtDetector.judge(quad: q, camera: camera(), surfaces: [wall()], objects: [], depthAt: { _, _ in 3.3 }) == .rejected(.behindWall))
        #expect(WallArtDetector.judge(quad: q, camera: camera(), surfaces: [wall()], objects: [], depthAt: { _, _ in 2.5 }) == .rejected(.tooFarInFront))
    }

    @Test func rejectsOffWallSmallLowAndTVShapes() {
        let c = camera()
        #expect(WallArtDetector.judge(quad: quad(x0: -0.3, x1: 0.3, y0: 1.2, y1: 1.6), camera: c, surfaces: [], objects: [], depthAt: noDepth) == .rejected(.notOnWall))
        #expect(WallArtDetector.judge(quad: quad(x0: -0.1, x1: 0.1, y0: 1.3, y1: 1.5), camera: c, surfaces: [wall()], objects: [], depthAt: noDepth) == .rejected(.sizeOutOfRange))
        #expect(WallArtDetector.judge(quad: quad(x0: -0.4, x1: 0.4, y0: 0.1, y1: 0.8), camera: c, surfaces: [wall()], objects: [], depthAt: noDepth) == .rejected(.nearFloor))
        // 16:9, 89 cm wide.
        #expect(WallArtDetector.judge(quad: quad(x0: -0.445, x1: 0.445, y0: 1.2, y1: 1.7), camera: c, surfaces: [wall()], objects: [], depthAt: noDepth) == .rejected(.likelyTV))
    }

    @Test func rejectsRectanglesOverDoorsAndDetectedTVs() {
        let q = quad(x0: -0.3, x1: 0.3, y0: 1.2, y1: 1.6)
        let door = wall(kind: .door, width: 0.9, height: 2.0, center: [0, 1.0, -3])
        #expect(WallArtDetector.judge(quad: q, camera: camera(), surfaces: [wall(), door], objects: [], depthAt: noDepth) == .rejected(.overlapsOpening))
        var t = matrix_identity_float4x4
        t.columns.3 = SIMD4(0, 1.4, -2.95, 1)
        let tv = LiveObject(sourceId: UUID(), category: "television", transform: t, dimensions: [1.0, 0.6, 0.08], center: [0, 1.4, -2.95])
        #expect(WallArtDetector.judge(quad: q, camera: camera(), surfaces: [wall()], objects: [tv], depthAt: noDepth) == .rejected(.overlapsTV))
    }

    @Test func rectangleHangingOffTheEdgeOfAWallIsRejected() {
        // A 1 m wide wall covering x −1…0: the quad's right corners (x = 0.4) miss it.
        let left = wall(width: 1.0, center: [-0.5, 1.3, -3])
        let verdict = WallArtDetector.judge(quad: quad(x0: -0.4, x1: 0.4, y0: 1.2, y1: 1.6), camera: camera(),
                                            surfaces: [left], objects: [], depthAt: noDepth)
        #expect(verdict == .rejected(.spansWalls))
    }
}
