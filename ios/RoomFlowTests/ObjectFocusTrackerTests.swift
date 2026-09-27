import Foundation
import Testing
import simd
@testable import RoomFlow

struct ObjectFocusTrackerTests {
    /// 1920×1440 sensor, fx = fy = 1500, principal point at the center.
    private let intrinsics = simd_float3x3(columns: ([1500, 0, 0], [0, 1500, 0], [960, 720, 1]))

    /// Camera at `position` looking down -Z, turned `yawDegrees` about +Y (positive turns left).
    private func camera(time: TimeInterval, position: SIMD3<Float> = [0, 1, 0], yawDegrees: Float = 0,
                        tracking: Bool = true) -> PhotoFrameSnapshot {
        var pose = simd_float4x4(simd_quatf(angle: yawDegrees * .pi / 180, axis: [0, 1, 0]))
        pose.columns.3 = SIMD4(position, 1)
        return PhotoFrameSnapshot(timestamp: time, cameraToWorld: pose, intrinsics: intrinsics,
                                  imageWidth: 1920, imageHeight: 1440, trackingNormal: tracking)
    }

    /// A 0.8 m cube centered at `center`.
    private func sofa(_ id: UUID = UUID(), at center: SIMD3<Float> = [0, 1, -2.5]) -> LiveObject {
        var transform = matrix_identity_float4x4
        transform.columns.3 = SIMD4(center, 1)
        return LiveObject(sourceId: id, category: "sofa", transform: transform, dimensions: [0.8, 0.8, 0.8], center: center)
    }

    private let noDepth: (Double, Double) -> Float? = { _, _ in nil }

    @Test func steadyFramedObjectIsShotAfterDwell() {
        var tracker = ObjectFocusTracker()
        let object = sofa()
        _ = tracker.update(objects: [object], camera: camera(time: 0), depthAt: noDepth) // first frame: not steady yet
        var decision = FocusDecision.none
        for step in 1...8 {
            decision = tracker.update(objects: [object], camera: camera(time: Double(step) * 0.25), depthAt: noDepth)
            if case .shoot = decision { break }
        }
        guard case .shoot(let hint) = decision else { Issue.record("expected a shot, got \(decision)"); return }
        #expect(hint.objectId == object.sourceId)
        #expect(hint.shotsTaken == 0)
    }

    @Test func movingCameraNeverShoots() {
        var tracker = ObjectFocusTracker()
        let object = sofa()
        for step in 0..<20 {
            // 0.2 m per 0.25 s = 0.8 m/s, above the 0.3 m/s steadiness limit.
            let pose = camera(time: Double(step) * 0.25, position: [Float(step) * 0.02 - 0.2, 1, Float(step) * 0.2])
            if case .shoot = tracker.update(objects: [object], camera: pose, depthAt: noDepth) {
                Issue.record("shot while moving at step \(step)")
            }
        }
    }

    @Test func objectCutOffByImageEdgeIsNotInView() {
        var tracker = ObjectFocusTracker()
        // 1.6 m to the right at 2.5 m: its right edge projects past the image and gets clipped.
        let object = sofa(at: [1.6, 1, -2.5])
        for step in 0..<12 {
            #expect(tracker.update(objects: [object], camera: camera(time: Double(step) * 0.25), depthAt: noDepth) == .none)
        }
    }

    @Test func occludedObjectIsNotInView() {
        var tracker = ObjectFocusTracker()
        let object = sofa()
        // LiDAR sees something 1 m away; the sofa's near face is ~2.1 m away.
        let somethingInFront: (Double, Double) -> Float? = { _, _ in 1.0 }
        for step in 0..<12 {
            #expect(tracker.update(objects: [object], camera: camera(time: Double(step) * 0.25), depthAt: somethingInFront) == .none)
        }
    }

    @Test func depthAtTheObjectDoesNotCountAsOccluded() {
        var tracker = ObjectFocusTracker()
        let object = sofa()
        let atSofa: (Double, Double) -> Float? = { _, _ in 2.2 }
        _ = tracker.update(objects: [object], camera: camera(time: 0), depthAt: atSofa)
        guard case .hint = tracker.update(objects: [object], camera: camera(time: 0.25), depthAt: atSofa) else {
            Issue.record("expected the sofa to be in view"); return
        }
    }

    @Test func sameViewAsksForAnotherSideThenCapsAtThree() {
        var tracker = ObjectFocusTracker()
        let object = sofa()
        tracker.recordShot(objectId: object.sourceId, cameraToWorld: camera(time: 0).cameraToWorld, objectCenter: object.center)

        var sawNewAngle = false
        for step in 1...8 {
            let decision = tracker.update(objects: [object], camera: camera(time: Double(step) * 0.25), depthAt: noDepth)
            if case .shoot = decision { Issue.record("re-shot the same view") }
            if case .hint(let hint) = decision, hint.needsNewAngle { sawNewAngle = true }
        }
        #expect(sawNewAngle)

        tracker.recordShot(objectId: object.sourceId, cameraToWorld: camera(time: 5, position: [1.2, 1, 0]).cameraToWorld,
                           objectCenter: object.center)
        tracker.recordShot(objectId: object.sourceId, cameraToWorld: camera(time: 6, position: [-1.2, 1, 0]).cameraToWorld,
                           objectCenter: object.center)
        #expect(tracker.shots(for: object.sourceId) == 3)
        guard case .hint(let hint) = tracker.update(objects: [object], camera: camera(time: 7), depthAt: noDepth) else {
            Issue.record("expected a hint"); return
        }
        #expect(hint.isComplete)
        #expect(hint.progress == 1)
    }

    @Test func newAngleAllowsSecondShot() {
        var tracker = ObjectFocusTracker()
        let object = sofa()
        tracker.recordShot(objectId: object.sourceId, cameraToWorld: camera(time: 0).cameraToWorld, objectCenter: object.center)
        // 1.2 m to the right, turned ~26° left to face the sofa: ≥ 20° from the first view.
        let side: (TimeInterval) -> PhotoFrameSnapshot = { self.camera(time: $0, position: [1.2, 1, 0], yawDegrees: 25.6) }
        var decision = FocusDecision.none
        for step in 0...8 {
            decision = tracker.update(objects: [object], camera: side(10 + Double(step) * 0.25), depthAt: noDepth)
            if case .shoot = decision { break }
        }
        guard case .shoot(let hint) = decision else { Issue.record("expected a second shot, got \(decision)"); return }
        #expect(hint.shotsTaken == 1)
    }

    @Test func lostTrackingResetsDwell() {
        var tracker = ObjectFocusTracker()
        let object = sofa()
        _ = tracker.update(objects: [object], camera: camera(time: 0), depthAt: noDepth)
        _ = tracker.update(objects: [object], camera: camera(time: 0.25), depthAt: noDepth)
        #expect(tracker.update(objects: [object], camera: camera(time: 0.5, tracking: false), depthAt: noDepth) == .none)
        if case .shoot = tracker.update(objects: [object], camera: camera(time: 0.75), depthAt: noDepth) {
            Issue.record("shot right after tracking came back")
        }
    }

    @Test func prefersIncompleteObjectOverACompleteCenteredOne() {
        var tracker = ObjectFocusTracker()
        let centered = sofa(at: [0, 1, -3])
        let offCenter = sofa(at: [0.7, 1, -3])
        // Fill the centered object's shots from three well-separated angles so it's complete.
        tracker.recordShot(objectId: centered.sourceId, cameraToWorld: camera(time: 0).cameraToWorld, objectCenter: centered.center)
        tracker.recordShot(objectId: centered.sourceId, cameraToWorld: camera(time: 0, position: [1.2, 1, 0]).cameraToWorld,
                           objectCenter: centered.center)
        tracker.recordShot(objectId: centered.sourceId, cameraToWorld: camera(time: 0, position: [-1.2, 1, 0]).cameraToWorld,
                           objectCenter: centered.center)
        _ = tracker.update(objects: [offCenter, centered], camera: camera(time: 0), depthAt: noDepth)
        guard case .hint(let hint) = tracker.update(objects: [offCenter, centered], camera: camera(time: 0.25), depthAt: noDepth) else {
            Issue.record("expected a hint"); return
        }
        #expect(hint.objectId == offCenter.sourceId)
    }

    @Test func picksMostCenteredObject() {
        var tracker = ObjectFocusTracker()
        let centered = sofa(at: [0, 1, -3])
        let offCenter = sofa(at: [0.7, 1, -3])
        _ = tracker.update(objects: [offCenter, centered], camera: camera(time: 0), depthAt: noDepth)
        guard case .hint(let hint) = tracker.update(objects: [offCenter, centered], camera: camera(time: 0.25), depthAt: noDepth) else {
            Issue.record("expected a hint"); return
        }
        #expect(hint.objectId == centered.sourceId)
    }
}
