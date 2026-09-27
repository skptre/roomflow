# Furniture-Aware Scan Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While someone scans normally, notice furniture RoomPlan has just detected, show a small non-blocking hint ("Sofa found — hold steady") with a progress ring, and automatically keep 2–3 sharp, well-framed reference photos per item from different angles; afterwards show which items have photos ("Photos cover 7 of 8 items — missing: TV").

**Architecture:** `LiveRoomObserver` (spike, proven on device) becomes the production live-object feed: it forwards every session callback and publishes the latest detected objects. A pure, unit-tested `ObjectFocusTracker` decides per sampling tick whether an object is well framed and unoccluded, the phone is steady, and a shot from a new angle is due. `RoomEvidenceRecorder` gets a focused-shot path that tags photos with the live object ID, plus a coverage-aware thin/keep policy. Final photo↔object association still uses the final processed room via `RoomEvidenceProjector` (unchanged); a pure `PhotoCoverage` summarizes it for the UI.

**Tech Stack:** Swift 5 mode, iOS 17, SwiftUI, RoomPlan, ARKit, simd, Swift Testing. No new dependencies.

**Spec:** Agreed design in the 2026-09-26 handoff ("Problem to solve next"); spike results in `docs/ios-room-evidence-verification.md` › "Spike: live detected objects"; `CLAUDE.md`; `.claude/documentation.md`. Builds on `docs/superpowers/plans/2026-09-26-ios-room-evidence-handoff.md` (Tasks 1–6 done).

## Global Constraints

- Branch: continue on `spike/live-object-hints` (from `keshav-ios`, currently at `3dfebbe`); iOS code + docs only. Do not touch `web/`.
- Keep iOS 17 deployment target, Swift 5 mode, `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`; new pure types are `nonisolated`.
- Photo capture stays opt-in (`RoomScanService.capturePhotos`). With it off: no hint, no focused shots, behavior unchanged.
- Hint is non-blocking: no forced stops, no bursts, never covers the center of the camera view or the Cancel/Done controls; scanning continues regardless.
- Caps: ≤3 shots per object; ≤24 temporary candidates; final ≤12 photos and ≤20 MiB (existing `PhotoCandidatePolicy` values).
- Final association uses the FINAL processed room (`RoomEvidenceProjector.associate(room:photos:)`), never a live update.
- Package contract `docs/ios-room-package.md` is Yash-agreed: do NOT add fields to the package manifest. New `RoomPhotoEvidence.focusObjectId` is local-only (saved archive), optional, backward compatible.
- Photos: sensor orientation, no GPS/device EXIF (existing `ImageIOPhotoEncoder`); never log photos or full scan payloads.
- Metal API Validation stays OFF in the shared scheme (RoomPlan crash otherwise).
- Every code commit updates, in the same commit: `docs/CHANGELOG.md` (new `### iOS: …` entry at the top of the `## 2026-09-26` section, or a new date heading), `docs/ARCHITECTURE.md` (new/changed files and public functions), `docs/DECISIONS.md` for real tradeoffs. Stage docs by explicit path — `docs/superpowers/` must stay untracked.
- New functions/types get a short `///` doc comment (what + non-obvious contract), matching surrounding density.
- User-facing copy: plain words, no "RoomPlan", "ID", "confidence", "tracker".
- Commands:
  - Tests: `xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test`
  - One suite: append `-only-testing:RoomFlowTests/<SuiteName>` to the test command.
  - Device build check: `xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`
- New files in `ios/RoomFlow/` and `ios/RoomFlowTests/` join targets automatically (synchronized groups); no pbxproj edits.

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `ios/RoomFlow/Services/ObjectFocusTracker.swift` | Create | Pure: `LiveObject`, `FocusShotPolicy`, `FocusHint`, `FocusDecision`, `ObjectFocusTracker` — framing, steadiness, occlusion, dwell, angle diversity, per-object cap |
| `ios/RoomFlowTests/ObjectFocusTrackerTests.swift` | Create | Tracker behavior with synthetic poses |
| `ios/RoomFlow/Models/RoomPhotoEvidence.swift` | Modify | Optional `focusObjectId: UUID?` (Codable, local only) |
| `ios/RoomFlow/Services/RoomEvidenceRecorder.swift` | Modify | `captureFocused(...) -> Bool`; `PhotoCandidatePolicy.thin(_:)`; coverage-aware `selectFinal(_:)` |
| `ios/RoomFlowTests/RoomEvidenceRecorderTests.swift` | Modify | Focused shots, thinning, final selection, old-archive decoding |
| `ios/RoomFlow/Services/LiveRoomObserver.swift` | Modify | Production live feed: `latestObjects()`; logging DEBUG-only, no duplicate `print` |
| `ios/RoomFlow/Services/RoomScanService.swift` | Modify | 250 ms loop; tracker + focused shots; observable `focusHint` |
| `ios/RoomFlow/Models/ObjectNames.swift` | Create | Pure: human names for RoomPlan categories ("television" → "TV") |
| `ios/RoomFlow/Views/ScanFocusHintView.swift` | Create | Hint capsule with progress ring; copy; accessibility |
| `ios/RoomFlowTests/ScanFocusHintTests.swift` | Create | Hint copy and display names |
| `ios/RoomFlow/Views/RoomScanView.swift` | Modify | Show the hint while scanning with photos on |
| `ios/RoomFlow/Models/PhotoCoverage.swift` | Create | Pure: which captured objects have ≥1 photo region among given photos |
| `ios/RoomFlowTests/PhotoCoverageTests.swift` | Create | Counts, missing names, excluded photos |
| `ios/RoomFlow/Views/ScanSummaryView.swift` | Modify | "Photos cover X of Y items — missing: …" |
| `ios/RoomFlow/Views/RoomEvidenceReviewView.swift` | Modify | Same summary for the photos being shared |
| `docs/ios-room-evidence-verification.md` | Modify (Task 6) | Device results |

---

### Task 1: ObjectFocusTracker (pure decision logic)

**Files:**
- Create: `ios/RoomFlow/Services/ObjectFocusTracker.swift`
- Test: `ios/RoomFlowTests/ObjectFocusTrackerTests.swift`
- Docs: `docs/ARCHITECTURE.md` (Services table row), `docs/CHANGELOG.md`, `docs/DECISIONS.md`

**Interfaces:**
- Consumes (existing): `RoomEvidenceProjector.projectedBounds(boxTransform:dimensions:cameraToWorld:intrinsics:pixelWidth:pixelHeight:) -> NormalizedRect?` (nil if the box crosses the near plane or is off-image; otherwise clipped to 0…1), `NormalizedRect` (`x, y, width, height, midX, midY, maxX, maxY`), `PhotoFrameSnapshot` (`timestamp, cameraToWorld, intrinsics, imageWidth, imageHeight, trackingNormal`).
- Produces:
  - `nonisolated struct LiveObject: Equatable, Sendable { var sourceId: UUID; var category: String; var transform: simd_float4x4; var dimensions: SIMD3<Float>; var center: SIMD3<Float> }`
  - `nonisolated struct FocusShotPolicy: Sendable` (fields in Step 3)
  - `nonisolated struct FocusHint: Equatable, Sendable { objectId: UUID; category: String; shotsTaken: Int; shotsWanted: Int; dwellProgress: Double; needsNewAngle: Bool; isComplete: Bool (computed); progress: Double (computed) }`
  - `nonisolated enum FocusDecision: Equatable { case none; case hint(FocusHint); case shoot(FocusHint) }`
  - `nonisolated struct ObjectFocusTracker` with `init(policy: FocusShotPolicy = .init())`, `mutating func update(objects: [LiveObject], camera: PhotoFrameSnapshot, depthAt: (Double, Double) -> Float?) -> FocusDecision`, `mutating func recordShot(objectId: UUID, cameraToWorld: simd_float4x4, objectCenter: SIMD3<Float>)`, `func shots(for: UUID) -> Int`, `mutating func reset()`

Decision rules, per `update` call, in order:
1. `camera.trackingNormal == false` → forget the previous pose, clear target and dwell, return `.none`.
2. Steady = a previous pose exists, `dt > 0`, linear speed ≤ `maxLinearSpeed` (m/s) and angular speed ≤ `maxAngularSpeedDegrees` (°/s). The first frame after start/reset/lost tracking is not steady.
3. For each object: `projectedBounds` with the snapshot's intrinsics and image size. In view = non-nil; all four edges at least `edgeMargin` inside 0…1 (a clipped box touches 0 or 1 and fails); area ≥ `minAreaFraction`; camera→center distance ≤ `maxDistance`; not occluded: if `depthAt(midX, midY)` returns a finite `d`, require `d ≥ distance − max(dimensions)/2 − occlusionTolerance`.
4. Target = in-view object whose rect center is nearest (0.5, 0.5). None → clear target/dwell, `.none`.
5. Target already has `maxShotsPerObject` shots → `.hint` (complete).
6. View direction (camera position → object center, unit) within `minAngleBetweenShotsDegrees` of any earlier shot's direction for that object → `.hint` with `needsNewAngle = true`, dwell cleared.
7. Target changed, not steady, or no dwell running → dwell starts now; `.hint` with `dwellProgress = 0`.
8. Else `dwellProgress = min(1, (t − dwellStart) / dwellSeconds)`; at 1 → `.shoot(hint)` and dwell restarts at `t`. The caller calls `recordShot` only if the recorder accepted the photo.

- [ ] **Step 1: Write the failing tests**

```swift
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
```

- [ ] **Step 2: Run to verify failure**

Run: test command + `-only-testing:RoomFlowTests/ObjectFocusTrackerTests`
Expected: build FAIL — `cannot find 'ObjectFocusTracker' in scope`.

- [ ] **Step 3: Implement**

```swift
import Foundation
import simd

/// An object detected so far in the live scan (RoomPlan world frame, meters).
/// `transform` is the box center pose; `dimensions` are width, height, depth; `center` is the box center.
nonisolated struct LiveObject: Equatable, Sendable {
    var sourceId: UUID
    /// RoomPlan category name, e.g. "sofa".
    var category: String
    var transform: simd_float4x4
    var dimensions: SIMD3<Float>
    var center: SIMD3<Float>
}

/// When a detected object counts as well framed and a focused photo is due. v1 tuning defaults.
nonisolated struct FocusShotPolicy: Sendable {
    var maxShotsPerObject = 3
    /// How long the phone must stay steady on the same object before a photo.
    var dwellSeconds: TimeInterval = 0.6
    /// The whole projected box must sit at least this far (normalized) inside every image edge.
    var edgeMargin = 0.03
    /// The projected box must cover at least this fraction of the image.
    var minAreaFraction = 0.04
    /// Camera to box center, meters; LiDAR depth and detail get unreliable beyond this.
    var maxDistance: Float = 4.0
    /// Steadiness stands in for sharpness: camera speed limits between sampling ticks.
    var maxLinearSpeed: Float = 0.3
    var maxAngularSpeedDegrees: Float = 25
    /// Later photos of the same object must view it from at least this different a direction.
    var minAngleBetweenShotsDegrees: Float = 20
    /// LiDAR depth nearer than the box's near face by more than this means something is in front.
    var occlusionTolerance: Float = 0.3
}

/// What the scan screen shows about the object in focus.
nonisolated struct FocusHint: Equatable, Sendable {
    var objectId: UUID
    var category: String
    var shotsTaken: Int
    var shotsWanted: Int
    /// 0...1 progress toward the next photo while the phone is held steady.
    var dwellProgress: Double
    /// This view was already photographed; the person should look from another side.
    var needsNewAngle: Bool

    var isComplete: Bool { shotsTaken >= shotsWanted }
    /// Ring progress, 0...1.
    var progress: Double {
        min(1, (Double(shotsTaken) + (isComplete ? 0 : dwellProgress)) / Double(max(shotsWanted, 1)))
    }
}

nonisolated enum FocusDecision: Equatable {
    case none
    case hint(FocusHint)
    /// Take a focused photo of `hint.objectId` now; call `recordShot` only if it was accepted.
    case shoot(FocusHint)
}

/// Decides, one sampling tick at a time, which detected object to photograph and when.
/// Pure and deterministic: callers pass camera snapshots and a depth lookup; no ARKit types.
nonisolated struct ObjectFocusTracker {
    private let policy: FocusShotPolicy
    private var previous: (time: TimeInterval, pose: simd_float4x4)?
    private var target: UUID?
    private var dwellStart: TimeInterval?
    /// Unit view directions (camera → object center) of accepted photos, per object.
    private var shotDirections: [UUID: [SIMD3<Float>]] = [:]

    init(policy: FocusShotPolicy = FocusShotPolicy()) {
        self.policy = policy
    }

    func shots(for objectId: UUID) -> Int { shotDirections[objectId]?.count ?? 0 }

    mutating func reset() {
        previous = nil
        target = nil
        dwellStart = nil
        shotDirections = [:]
    }

    /// Records an accepted photo of `objectId` taken from `cameraToWorld`.
    mutating func recordShot(objectId: UUID, cameraToWorld: simd_float4x4, objectCenter: SIMD3<Float>) {
        shotDirections[objectId, default: []].append(Self.direction(from: cameraToWorld, to: objectCenter))
    }

    /// `depthAt(u, v)` returns LiDAR depth in meters at a normalized, top-left-origin image point, or nil.
    mutating func update(objects: [LiveObject], camera: PhotoFrameSnapshot,
                         depthAt: (Double, Double) -> Float?) -> FocusDecision {
        guard camera.trackingNormal else {
            previous = nil
            target = nil
            dwellStart = nil
            return .none
        }
        let steady = isSteady(camera)
        previous = (camera.timestamp, camera.cameraToWorld)

        let c = camera.cameraToWorld.columns.3
        let cameraPosition = SIMD3(c.x, c.y, c.z)
        let inView: [(object: LiveObject, offCenter: Double)] = objects.compactMap { object in
            guard let rect = RoomEvidenceProjector.projectedBounds(
                boxTransform: object.transform, dimensions: object.dimensions,
                cameraToWorld: camera.cameraToWorld, intrinsics: camera.intrinsics,
                pixelWidth: camera.imageWidth, pixelHeight: camera.imageHeight) else { return nil }
            let m = policy.edgeMargin
            guard rect.x >= m, rect.y >= m, rect.maxX <= 1 - m, rect.maxY <= 1 - m,
                  rect.width * rect.height >= policy.minAreaFraction else { return nil }
            let distance = simd_distance(cameraPosition, object.center)
            guard distance <= policy.maxDistance else { return nil }
            if let measured = depthAt(rect.midX, rect.midY), measured.isFinite {
                let nearFace = distance - object.dimensions.max() / 2
                guard measured >= nearFace - policy.occlusionTolerance else { return nil }
            }
            return (object, hypot(rect.midX - 0.5, rect.midY - 0.5))
        }
        guard let best = inView.min(by: { $0.offCenter < $1.offCenter })?.object else {
            target = nil
            dwellStart = nil
            return .none
        }

        var hint = FocusHint(objectId: best.sourceId, category: best.category, shotsTaken: shots(for: best.sourceId),
                             shotsWanted: policy.maxShotsPerObject, dwellProgress: 0, needsNewAngle: false)
        if hint.isComplete {
            target = best.sourceId
            dwellStart = nil
            return .hint(hint)
        }
        let direction = Self.direction(from: camera.cameraToWorld, to: best.center)
        let minCos = cos(policy.minAngleBetweenShotsDegrees * .pi / 180)
        if (shotDirections[best.sourceId] ?? []).contains(where: { simd_dot($0, direction) > minCos }) {
            target = best.sourceId
            dwellStart = nil
            hint.needsNewAngle = true
            return .hint(hint)
        }
        guard steady, target == best.sourceId, let start = dwellStart else {
            target = best.sourceId
            dwellStart = camera.timestamp
            return .hint(hint)
        }
        hint.dwellProgress = min(1, (camera.timestamp - start) / policy.dwellSeconds)
        guard hint.dwellProgress >= 1 else { return .hint(hint) }
        dwellStart = camera.timestamp
        return .shoot(hint)
    }

    private func isSteady(_ camera: PhotoFrameSnapshot) -> Bool {
        guard let previous else { return false }
        let dt = Float(camera.timestamp - previous.time)
        guard dt > 0 else { return false }
        let a = previous.pose.columns.3, b = camera.cameraToWorld.columns.3
        let speed = simd_distance(SIMD3(a.x, a.y, a.z), SIMD3(b.x, b.y, b.z)) / dt
        let relative = simd_quatf(previous.pose).inverse * simd_quatf(camera.cameraToWorld)
        let angle = relative.angle > .pi ? 2 * .pi - relative.angle : relative.angle
        return speed <= policy.maxLinearSpeed && angle * 180 / .pi / dt <= policy.maxAngularSpeedDegrees
    }

    private static func direction(from cameraToWorld: simd_float4x4, to point: SIMD3<Float>) -> SIMD3<Float> {
        let c = cameraToWorld.columns.3
        return simd_normalize(point - SIMD3(c.x, c.y, c.z))
    }
}
```

Test arithmetic, if something fails:
- Dwell: frames every 0.25 s; frame 1 starts dwell (first steady frame), progress 0.42 at frame 2, 0.83 at frame 3, shot at frame 4 (≤ 8).
- Edge cut: sofa at x = 1.6, depth 2.5 → near-face corners at x = 2.0, depth 2.1 → u = 960 + 1500·2.0/2.1 ≈ 2389 px > 1920 → clipped, `maxX == 1` > 0.97 → rejected.
- New angle: from (1.2, 1, 0) to (0, 1, −2.5): direction ≈ (−0.43, 0, −0.90); first view (0, 0, −1); angle ≈ 25.6° > 20°. Yaw 25.6° keeps the sofa centered.
- `sameViewAsksForAnotherSide…`: the 2nd/3rd `recordShot` calls simulate accepted photos; the final `update` from the first view is in view and complete.

- [ ] **Step 4: Run to verify pass**

Run: test command + `-only-testing:RoomFlowTests/ObjectFocusTrackerTests`
Expected: 9 tests PASS.

- [ ] **Step 5: Docs, full tests, commit**

ARCHITECTURE › Services table, new row:
`| ObjectFocusTracker.swift | Pure: decides when a detected object is well framed and unoccluded, the phone steady, and a new-angle photo due | LiveObject, FocusShotPolicy, FocusHint, FocusDecision, ObjectFocusTracker (update(objects:camera:depthAt:), recordShot(objectId:cameraToWorld:objectCenter:), shots(for:), reset()) |`

CHANGELOG: `### iOS: furniture-aware photos — focus tracker` with file and types, and why (one real scan had photos of only 2 of 8 items).

DECISIONS: `## Steadiness stands in for photo sharpness` — camera speed from successive ARKit poses is free each tick; rejected: measuring blur on the image (e.g. Laplacian variance), which needs a full image read every 250 ms. Also: dwell of 0.6 s before a shot, rejected immediate shots on detection (spike showed detection happens while the camera is already resting on the item, but the box is still refining).

Run full test command. Expected: all pass (38 existing + 9).

```bash
git add ios/RoomFlow/Services/ObjectFocusTracker.swift ios/RoomFlowTests/ObjectFocusTrackerTests.swift docs/ARCHITECTURE.md docs/CHANGELOG.md docs/DECISIONS.md
git commit -m "feat(ios): decide when a detected object is ready for a photo"
```

---

### Task 2: Recorder — focused shots, coverage-aware thinning and final selection

**Files:**
- Modify: `ios/RoomFlow/Models/RoomPhotoEvidence.swift` (field + `CodingKeys`)
- Modify: `ios/RoomFlow/Services/RoomEvidenceRecorder.swift`
- Test: `ios/RoomFlowTests/RoomEvidenceRecorderTests.swift`
- Docs: ARCHITECTURE (`RoomEvidenceRecorder.swift`, `RoomPhotoEvidence.swift` rows), CHANGELOG, DECISIONS

**Interfaces:**
- Consumes: `PhotoFrameSnapshot`; existing recorder internals (`sessionID`, `encoding`, `lastKeptPose`, `candidates`, `interruptions`, `policy`, `encoder`, `directory(for:)`, `downscaledImage`).
- Produces:
  - `RoomPhotoEvidence.focusObjectId: UUID?` (default nil; Codable key `focusObjectId`; old archives decode to nil).
  - `PhotoCandidatePolicy.thin(_ candidates: [RoomPhotoEvidence]) -> (kept: [RoomPhotoEvidence], dropped: [RoomPhotoEvidence])`
  - `PhotoCandidatePolicy.selectFinal(_:) -> [RoomPhotoEvidence]` — same signature, new behavior, output sorted by timestamp.
  - `RoomEvidenceRecorder.captureFocused(snapshot: PhotoFrameSnapshot, objectId: UUID, sessionID: UUID, makeImage: () -> CGImage?) -> Bool`
  - `RoomEvidenceRecorder.captureFocused(frame: ARFrame, objectId: UUID, sessionID: UUID) -> Bool`

Rules:
- `captureFocused` bypasses `minimumInterval` and `isNewView` (the tracker decided) but returns false when the session is stale, tracking isn't normal, an encode is in flight, or `makeImage` returns nil. It sets `lastKeptPose` so the ambient path doesn't immediately repeat the view.
- `thin`: while `count > maxCandidates`: if >1 ambient photo (`focusObjectId == nil`), drop every other ambient one (odd positions, keeps first); else drop the newest photo of the object with the most photos, if it has >1 or there's no ambient left; else drop the single ambient photo.
- `selectFinal`: round-robin over objects (1st photo of each object in first-seen order, then 2nd, …) up to `maxPhotos`; fill the rest with ambient photos spread evenly over time; then while over `maxTotalBytes`, remove the largest ambient photo, else the largest photo of the object with the most photos.

- [ ] **Step 1: Write failing tests** — append inside `struct RoomEvidenceRecorderTests` (reuses its `FakeEncoder`, `makeRoot()`, `image()`, `frame(time:x:tracking:)`):

```swift
    /// A finished photo record for policy tests (no files involved).
    private func photo(_ time: TimeInterval, focus: UUID? = nil, bytes: Int = 1_000) -> RoomPhotoEvidence {
        var p = RoomPhotoEvidence(id: UUID(), sessionID: UUID(), timestamp: time, pixelWidth: 64, pixelHeight: 48,
                                  cameraToWorld: RoomPhotoEvidence.columnMajor(matrix_identity_float4x4),
                                  intrinsics: RoomPhotoEvidence.columnMajor(matrix_identity_float3x3),
                                  trackingContinuous: true, byteCount: bytes)
        p.focusObjectId = focus
        return p
    }

    @Test func focusedShotIgnoresMotionGateButNotBusyEncoder() async throws {
        let root = makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let gate = DispatchSemaphore(value: 0)
        let recorder = RoomEvidenceRecorder(encoder: FakeEncoder(gate: gate), rootDirectory: root)
        let session = UUID(), sofa = UUID()
        recorder.start(sessionID: session)

        #expect(recorder.captureFocused(snapshot: frame(time: 0, x: 0), objectId: sofa, sessionID: session) { image() })
        // Encoder still busy: refused, so the caller must not count it.
        #expect(!recorder.captureFocused(snapshot: frame(time: 0.1, x: 0), objectId: sofa, sessionID: session) { image() })
        gate.signal()
        await recorder.waitUntilIdle()
        // Same pose 0.2 s later: the ambient path would refuse (interval + no new view); focused accepts.
        #expect(recorder.captureFocused(snapshot: frame(time: 0.2, x: 0), objectId: sofa, sessionID: session) { image() })
        gate.signal()
        await recorder.waitUntilIdle()

        let photos = try await recorder.finish(sessionID: session)
        #expect(photos.count == 2)
        #expect(photos.allSatisfy { $0.focusObjectId == sofa })
    }

    @Test func focusedShotRefusedForStaleSessionOrLostTracking() {
        let root = makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let recorder = RoomEvidenceRecorder(encoder: FakeEncoder(), rootDirectory: root)
        let session = UUID()
        recorder.start(sessionID: session)
        #expect(!recorder.captureFocused(snapshot: frame(time: 0, x: 0), objectId: UUID(), sessionID: UUID()) { image() })
        #expect(!recorder.captureFocused(snapshot: frame(time: 0, x: 0, tracking: false), objectId: UUID(), sessionID: session) { image() })
        #expect(!recorder.captureFocused(snapshot: frame(time: 0, x: 0), objectId: UUID(), sessionID: session) { nil })
    }

    @Test func thinningDropsAmbientBeforeFocused() {
        var policy = PhotoCandidatePolicy()
        policy.maxCandidates = 6
        let a = UUID(), b = UUID()
        let focused = [photo(1, focus: a), photo(2, focus: a), photo(3, focus: b)]
        let ambient = (10..<14).map { photo(Double($0)) }
        let (kept, dropped) = policy.thin(focused + ambient)
        #expect(kept.count <= 6)
        #expect(Set(focused.map(\.id)).isSubset(of: Set(kept.map(\.id))))
        #expect(!dropped.isEmpty && dropped.allSatisfy { $0.focusObjectId == nil })
    }

    @Test func thinningWithOnlyFocusedTrimsBusiestObject() {
        var policy = PhotoCandidatePolicy()
        policy.maxCandidates = 3
        let a = UUID(), b = UUID()
        let (kept, dropped) = policy.thin([photo(1, focus: a), photo(2, focus: a), photo(3, focus: a), photo(4, focus: b)])
        #expect(kept.count == 3)
        #expect(kept.contains { $0.focusObjectId == b })
        #expect(dropped.map(\.timestamp) == [3])
    }

    @Test func finalSelectionCoversEveryObjectFirst() {
        var policy = PhotoCandidatePolicy()
        policy.maxPhotos = 4
        let objects = (0..<3).map { _ in UUID() }
        let focused = objects.enumerated().flatMap { index, id in
            (0..<3).map { photo(Double(index * 3 + $0), focus: id) }
        }
        let ambient = (20..<30).map { photo(Double($0)) }
        let chosen = policy.selectFinal(focused + ambient)
        #expect(chosen.count == 4)
        #expect(Set(chosen.compactMap(\.focusObjectId)) == Set(objects))
        #expect(chosen.map(\.timestamp) == chosen.map(\.timestamp).sorted())
    }

    @Test func byteTrimRemovesAmbientBeforeLosingAnObject() {
        var policy = PhotoCandidatePolicy()
        policy.maxTotalBytes = 3_000
        let a = UUID(), b = UUID()
        let chosen = policy.selectFinal([photo(1, focus: a), photo(2, focus: b), photo(3, bytes: 2_000), photo(4)])
        #expect(chosen.map(\.byteCount).reduce(0, +) <= 3_000)
        #expect(Set(chosen.compactMap(\.focusObjectId)) == [a, b])
    }

    @Test func oldArchivesDecodeWithoutFocusObject() throws {
        var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(photo(1))) as! [String: Any]
        json.removeValue(forKey: "focusObjectId")
        let decoded = try JSONDecoder().decode(RoomPhotoEvidence.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(decoded.focusObjectId == nil)
    }
```

- [ ] **Step 2: Run to verify failure**

Run: test command + `-only-testing:RoomFlowTests/RoomEvidenceRecorderTests`
Expected: build FAIL — `value of type 'RoomPhotoEvidence' has no member 'focusObjectId'`.

- [ ] **Step 3: Implement**

`RoomPhotoEvidence.swift` — after `var byteCount: Int` add:

```swift
    /// Live object this photo was deliberately taken of (focused shot), else nil. Local only: not in the
    /// package manifest; the final photo↔object association always comes from the processed room.
    var focusObjectId: UUID? = nil
```

and change the second `CodingKeys` line to `case pixelOrientation, trackingContinuous, byteCount, focusObjectId`. (Synthesized decoding treats a missing optional key as nil.)

`RoomEvidenceRecorder.swift` — inside `PhotoCandidatePolicy`, replace `selectFinal` and add helpers + `thin`:

```swift
    /// Evenly spread pick of `count` items, keeping the first and last.
    private func spread<T>(_ items: [T], count: Int) -> [T] {
        guard items.count > count else { return items }
        guard count > 1 else { return count == 1 ? [items[0]] : [] }
        let step = Double(items.count - 1) / Double(count - 1)
        return (0..<count).map { items[Int((Double($0) * step).rounded())] }
    }

    /// Focused photos grouped by object: each group in capture order, groups in first-seen order.
    private func focusGroups(_ photos: [RoomPhotoEvidence]) -> [[RoomPhotoEvidence]] {
        var order: [UUID] = []
        var groups: [UUID: [RoomPhotoEvidence]] = [:]
        for photo in photos.sorted(by: { $0.timestamp < $1.timestamp }) {
            guard let id = photo.focusObjectId else { continue }
            if groups[id] == nil { order.append(id) }
            groups[id, default: []].append(photo)
        }
        return order.compactMap { groups[$0] }
    }

    /// Keeps at most `maxCandidates`: ambient photos are thinned first (every other one), then the newest
    /// photo of whichever object has the most. Returns the dropped photos so their files can be deleted.
    func thin(_ candidates: [RoomPhotoEvidence]) -> (kept: [RoomPhotoEvidence], dropped: [RoomPhotoEvidence]) {
        var kept = candidates
        var dropped: [RoomPhotoEvidence] = []
        while kept.count > maxCandidates {
            let ambient = kept.filter { $0.focusObjectId == nil }
            let remove: Set<UUID>
            if ambient.count > 1 {
                remove = Set(ambient.enumerated().filter { !$0.offset.isMultiple(of: 2) }.map(\.element.id))
            } else if let busiest = focusGroups(kept).max(by: { $0.count < $1.count }), let newest = busiest.last,
                      busiest.count > 1 || ambient.isEmpty {
                remove = [newest.id]
            } else if let only = ambient.first {
                remove = [only.id]
            } else {
                break
            }
            dropped += kept.filter { remove.contains($0.id) }
            kept.removeAll { remove.contains($0.id) }
        }
        return (kept, dropped)
    }

    /// Up to `maxPhotos`: one focused photo per object first (then a second each, …), the rest ambient
    /// photos spread over the scan; then trimmed to the byte budget, ambient first. Sorted by capture time.
    func selectFinal(_ candidates: [RoomPhotoEvidence]) -> [RoomPhotoEvidence] {
        let groups = focusGroups(candidates)
        var chosen: [RoomPhotoEvidence] = []
        var round = 0
        while chosen.count < maxPhotos, groups.contains(where: { $0.count > round }) {
            for group in groups where group.count > round && chosen.count < maxPhotos {
                chosen.append(group[round])
            }
            round += 1
        }
        let ambient = candidates.filter { $0.focusObjectId == nil }.sorted { $0.timestamp < $1.timestamp }
        chosen += spread(ambient, count: maxPhotos - chosen.count)

        while chosen.map(\.byteCount).reduce(0, +) > maxTotalBytes, !chosen.isEmpty {
            if let largest = chosen.indices.filter({ chosen[$0].focusObjectId == nil })
                .max(by: { chosen[$0].byteCount < chosen[$1].byteCount }) {
                chosen.remove(at: largest)
            } else if let busiest = focusGroups(chosen).max(by: { $0.count < $1.count }),
                      let largest = busiest.max(by: { $0.byteCount < $1.byteCount }) {
                chosen.removeAll { $0.id == largest.id }
            } else {
                break
            }
        }
        return chosen.sorted { $0.timestamp < $1.timestamp }
    }
```

In `RoomEvidenceRecorder.consider(snapshot:sessionID:makeImage:)`: keep the guards through `let image = makeImage() else { return }`, then replace the rest of the body with `startEncode(image, snapshot: snapshot, sessionID: sessionID, focusObjectId: nil)`. Move the removed code (from `lastKeptPose = snapshot.cameraToWorld` to the end of the `encoding = Task { … }` block) into:

```swift
    /// Records the pose, rescales intrinsics to the exported image, and starts the single in-flight JPEG encode.
    private func startEncode(_ image: CGImage, snapshot: PhotoFrameSnapshot, sessionID: UUID, focusObjectId: UUID?) {
        lastKeptPose = snapshot.cameraToWorld
        // …the moved lines, unchanged, except: after `photo.fileURL = url` add
        photo.focusObjectId = focusObjectId
        // …then the unchanged `let encoder = …` and `encoding = Task { … }`
    }
```

Add after `consider(snapshot:…)`:

```swift
    /// Keeps a deliberate photo of `objectId` now, bypassing the motion gate (the focus tracker decided).
    /// Returns false — and the caller must not count a photo — when the session is stale, tracking isn't
    /// normal, another photo is still encoding, or no image could be made.
    func captureFocused(snapshot: PhotoFrameSnapshot, objectId: UUID, sessionID: UUID,
                        makeImage: () -> CGImage?) -> Bool {
        guard sessionID == self.sessionID, snapshot.trackingNormal, encoding == nil,
              let image = makeImage() else { return false }
        startEncode(image, snapshot: snapshot, sessionID: sessionID, focusObjectId: objectId)
        return true
    }
```

In `encodingFinished`, replace the `if candidates.count > policy.maxCandidates { … }` block with:

```swift
        let (kept, dropped) = policy.thin(candidates)
        candidates = kept
        dropped.forEach { if let url = $0.fileURL { try? FileManager.default.removeItem(at: url) } }
```

In the ARKit extension, extract the `PhotoFrameSnapshot(…)` construction in `consider(frame:sessionID:)` into `static func snapshot(of frame: ARFrame) -> PhotoFrameSnapshot` (internal — Task 3 reuses it), use it there, and add:

```swift
    /// Focused photo from the current AR frame; see `captureFocused(snapshot:objectId:sessionID:makeImage:)`.
    func captureFocused(frame: ARFrame, objectId: UUID, sessionID: UUID) -> Bool {
        let buffer = frame.capturedImage, maxLongEdge = maxLongEdge
        return captureFocused(snapshot: Self.snapshot(of: frame), objectId: objectId, sessionID: sessionID) {
            Self.downscaledImage(buffer, maxLongEdge: maxLongEdge)
        }
    }
```

- [ ] **Step 4: Run to verify pass**

Run: full test command. Expected: all pass. With only ambient photos, `thin` still halves every other photo and `selectFinal` still spreads evenly then trims largest-first, so existing tests (e.g. `limitsCandidateCountAndBytes`) keep passing. If one asserted an exact old ordering, keep its intent (bounded count, early + late coverage) and note the change in the CHANGELOG entry.

- [ ] **Step 5: Docs + commit**

ARCHITECTURE: `RoomEvidenceRecorder.swift` row — add `captureFocused(snapshot:objectId:sessionID:makeImage:)`, `captureFocused(frame:objectId:sessionID:)`, `snapshot(of:)`, `PhotoCandidatePolicy.thin(_:)`, and "final pick covers each object first". `RoomPhotoEvidence.swift` row — add `focusObjectId` (local only).
DECISIONS: `## Per-object photos are kept ahead of ambient ones` — rejected: the old even spread over time (it dropped the only photo of some items); focus IDs never enter the package, association stays geometric on the final room.
CHANGELOG entry naming both files and all new/changed functions.

```bash
git add ios/RoomFlow/Models/RoomPhotoEvidence.swift ios/RoomFlow/Services/RoomEvidenceRecorder.swift ios/RoomFlowTests/RoomEvidenceRecorderTests.swift docs/ARCHITECTURE.md docs/CHANGELOG.md docs/DECISIONS.md
git commit -m "feat(ios): keep focused furniture photos ahead of ambient ones"
```

---

### Task 3: Live feed + scan loop wiring

**Files:**
- Modify: `ios/RoomFlow/Services/LiveRoomObserver.swift`
- Modify: `ios/RoomFlow/Services/RoomScanService.swift`
- Docs: ARCHITECTURE (both rows), CHANGELOG, DECISIONS (update the "Live object spike forwards…" entry)

**Interfaces:**
- Consumes: `LiveObject`, `ObjectFocusTracker`, `FocusDecision`, `FocusHint` (Task 1); `RoomEvidenceRecorder.captureFocused(frame:objectId:sessionID:) -> Bool`, `RoomEvidenceRecorder.snapshot(of:) -> PhotoFrameSnapshot` (Task 2).
- Produces:
  - `LiveRoomObserver.latestObjects() -> [LiveObject]` (thread-safe copy of the newest live room's objects).
  - `RoomScanService.focusHint: FocusHint?` — observable; nil when photos are off, not scanning, or nothing framed.

`LiveRoomObserver` changes:
- Doc comment: replace "SPIKE (debug builds only)…" with "Live-object feed: takes `RoomCaptureSession.delegate`, forwards every callback unchanged to the previous delegate, and keeps the newest detected objects for the focus tracker. Debug builds also log detections and whether live IDs survive into the final room." Keep the install/forwarding code unchanged.
- Add `private var latest: [LiveObject] = []`. In `record(_:)`, inside the locked section, set:

```swift
        latest = room.objects.map { object in
            let c = object.transform.columns.3
            return LiveObject(sourceId: object.identifier, category: Self.name(object.category),
                              transform: object.transform, dimensions: object.dimensions, center: SIMD3(c.x, c.y, c.z))
        }
```

- `reset()` also sets `latest = []`.
- Add:

```swift
    /// The objects in the newest live room update (empty before the first update). Safe from any thread.
    func latestObjects() -> [LiveObject] {
        lock.lock()
        defer { lock.unlock() }
        return latest
    }
```

- `emit`: wrap the body in `#if DEBUG … #endif` and delete the `print` line (the Logger line already shows in Xcode's console; both together produced the duplicated lines seen on device).

`RoomScanService` changes:
- Remove the three `#if DEBUG`/`#endif` pairs around `liveObserver`, `install(on:)`, `logFinalOverlap(with:)`; update the property doc to `/// Live detected objects during a scan; see LiveRoomObserver.`
- Add properties:

```swift
    /// The furniture currently framed and its photo progress; nil unless photo capture is on and something is framed.
    private(set) var focusHint: FocusHint?
    @ObservationIgnored private var focusTracker = ObjectFocusTracker()
    @ObservationIgnored private var sampleTick = 0
```

- `start()`: add `focusTracker.reset(); focusHint = nil; sampleTick = 0` beside `colorSampler.reset()`.
- `finish()`, `cancel()`, `stopEvidence()`: add `focusHint = nil`.
- Replace `startColorSampling()` and add helpers:

```swift
    // Every 250 ms: focus hints (pose only). Every third tick (~750 ms, as before): colors and ambient photos.
    private func startColorSampling() {
        colorSampling?.cancel()
        colorSampling = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if let frame = self.captureView.captureSession.arSession.currentFrame {
                    if self.sampleTick.isMultiple(of: 3) {
                        self.colorSampler.capture(frame)
                        if self.capturePhotos {
                            self.evidenceRecorder.consider(frame: frame, sessionID: self.sessionID)
                        }
                    }
                    if self.capturePhotos { self.updateFocus(with: frame) }
                    self.sampleTick += 1
                }
                try? await Task.sleep(for: .milliseconds(250))
            }
        }
    }

    /// Runs the focus tracker on `frame`, takes a focused photo when one is due, and publishes the hint.
    private func updateFocus(with frame: ARFrame) {
        let snapshot = RoomEvidenceRecorder.snapshot(of: frame)
        let depthMap = (frame.sceneDepth ?? frame.smoothedSceneDepth)?.depthMap
        let objects = liveObserver.latestObjects()
        var hint: FocusHint?
        switch focusTracker.update(objects: objects, camera: snapshot,
                                   depthAt: { u, v in Self.depth(in: depthMap, u: u, v: v) }) {
        case .none:
            hint = nil
        case .hint(let current):
            hint = current
        case .shoot(let current):
            hint = current
            if let object = objects.first(where: { $0.sourceId == current.objectId }),
               evidenceRecorder.captureFocused(frame: frame, objectId: current.objectId, sessionID: sessionID) {
                focusTracker.recordShot(objectId: current.objectId, cameraToWorld: snapshot.cameraToWorld,
                                        objectCenter: object.center)
                hint?.shotsTaken += 1
                hint?.dwellProgress = 0
            }
        }
        // Publish only real changes so SwiftUI isn't redrawn every tick for nothing.
        if hint != focusHint { focusHint = hint }
    }

    /// LiDAR depth in meters at a normalized, top-left-origin image point; nil without depth or for invalid values.
    private static func depth(in map: CVPixelBuffer?, u: Double, v: Double) -> Float? {
        guard let map else { return nil }
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return nil }
        let width = CVPixelBufferGetWidth(map), height = CVPixelBufferGetHeight(map)
        let x = min(width - 1, max(0, Int(u * Double(width))))
        let y = min(height - 1, max(0, Int(v * Double(height))))
        let row = base.advanced(by: y * CVPixelBufferGetBytesPerRow(map)).assumingMemoryBound(to: Float32.self)
        let value = row[x]
        return value.isFinite && value > 0 ? value : nil
    }
```

(Depth map and camera image share the sensor orientation and aspect, so the same normalized point applies — as `ColorFrame.color(at:)` already assumes.)

- [ ] **Step 1: Make the changes above.**
- [ ] **Step 2: Device build** (device build command). Expected: `BUILD SUCCEEDED`; no new warnings in these two files (`grep -E "warning:.*(LiveRoomObserver|RoomScanService)"` empty).
- [ ] **Step 3: Full tests.** Expected: all pass.
- [ ] **Step 4: Docs + commit**

ARCHITECTURE: `LiveRoomObserver.swift` row → purpose "Live-object feed: forwards every session callback to the previous delegate, keeps the newest detected objects; debug-only logging", functions `install(on:)`, `latestObjects()`, `logFinalOverlap(with:)`. `RoomScanService.swift` row → add `focusHint`; purpose "…250 ms loop: focus hints every tick, colors + ambient photos every third".
DECISIONS: edit the "Live object spike forwards to the session's existing delegate" entry (it's ours, from today; a same-day correction is fine): the slot was `nil` on iOS 27 in both device scans; forwarding is kept because it costs nothing and protects against a future `RoomCaptureView` that uses the slot.
CHANGELOG entry.

```bash
git add ios/RoomFlow/Services/LiveRoomObserver.swift ios/RoomFlow/Services/RoomScanService.swift docs/ARCHITECTURE.md docs/CHANGELOG.md docs/DECISIONS.md
git commit -m "feat(ios): take focused furniture photos while scanning"
```

---

### Task 4: Hint overlay on the scan screen

**Files:**
- Create: `ios/RoomFlow/Models/ObjectNames.swift`
- Create: `ios/RoomFlow/Views/ScanFocusHintView.swift`
- Create: `ios/RoomFlowTests/ScanFocusHintTests.swift`
- Modify: `ios/RoomFlow/Views/RoomScanView.swift`
- Docs: ARCHITECTURE (Models + Views rows), CHANGELOG

**Interfaces:**
- Consumes: `FocusHint` (Task 1); `RoomScanService.focusHint` (Task 3); `RoomScanView`'s existing `capturePhotos` property and `statusText(_:)`.
- Produces:
  - `nonisolated enum ObjectNames { static func display(category: String) -> String }`
  - `struct ScanFocusHintView: View { let hint: FocusHint }` with `static func message(for: FocusHint) -> String`

Copy:
- 0 photos, no new-angle: "\(Name) found — hold steady"
- ≥1 photo, needs new angle: "\(Name): \(n) of \(wanted) photos — try another side"
- ≥1 photo, holding: "\(Name): \(n) of \(wanted) photos — hold steady"
- complete: "\(Name) photographed"

- [ ] **Step 1: Failing tests** (`ScanFocusHintTests.swift`)

```swift
import Foundation
import Testing
@testable import RoomFlow

struct ScanFocusHintTests {
    private func hint(_ shots: Int, newAngle: Bool = false, category: String = "sofa") -> FocusHint {
        FocusHint(objectId: UUID(), category: category, shotsTaken: shots, shotsWanted: 3,
                  dwellProgress: 0, needsNewAngle: newAngle)
    }

    @Test func messages() {
        #expect(ScanFocusHintView.message(for: hint(0)) == "Sofa found — hold steady")
        #expect(ScanFocusHintView.message(for: hint(1, newAngle: true)) == "Sofa: 1 of 3 photos — try another side")
        #expect(ScanFocusHintView.message(for: hint(2)) == "Sofa: 2 of 3 photos — hold steady")
        #expect(ScanFocusHintView.message(for: hint(3)) == "Sofa photographed")
    }

    @Test func displayNames() {
        #expect(ObjectNames.display(category: "television") == "TV")
        #expect(ObjectNames.display(category: "refrigerator") == "Fridge")
        #expect(ObjectNames.display(category: "washerDryer") == "Washer")
        #expect(ObjectNames.display(category: "bathtub") == "Bathtub")
        #expect(ObjectNames.display(category: "someNewThing") == "Some new thing")
    }
}
```

- [ ] **Step 2: Run** `-only-testing:RoomFlowTests/ScanFocusHintTests`. Expected: build FAIL (`ScanFocusHintView` / `ObjectNames` missing).

- [ ] **Step 3: Implement**

`ObjectNames.swift`:

```swift
import Foundation

/// Plain names for RoomPlan object categories, for on-screen text only (stored data keeps the category).
nonisolated enum ObjectNames {
    private static let special = ["television": "TV", "refrigerator": "Fridge", "washerDryer": "Washer"]

    /// "television" → "TV"; camel case split into words, first letter capitalized ("someNewThing" → "Some new thing").
    static func display(category: String) -> String {
        if let name = special[category] { return name }
        let words = category.reduce(into: "") { result, character in
            if character.isUppercase, !result.isEmpty { result.append(" ") }
            result.append(character)
        }
        return words.prefix(1).uppercased() + words.dropFirst().lowercased()
    }
}
```

`ScanFocusHintView.swift`:

```swift
import SwiftUI

/// Small, non-blocking scan hint for the furniture in view, with a ring that fills as photos are taken.
/// Sits under the top controls so the camera view stays clear.
struct ScanFocusHintView: View {
    let hint: FocusHint
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().stroke(.white.opacity(0.25), lineWidth: 3)
                Circle()
                    .trim(from: 0, to: hint.progress)
                    .stroke(.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                if hint.isComplete {
                    Image(systemName: "checkmark").font(.caption2.bold())
                }
            }
            .frame(width: 22, height: 22)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: hint.progress)
            .accessibilityHidden(true)

            Text(Self.message(for: hint))
                .font(.callout)
                .lineLimit(2)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
        .accessibilityElement(children: .combine)
    }

    /// The hint's text; see the copy table in the plan.
    static func message(for hint: FocusHint) -> String {
        let name = ObjectNames.display(category: hint.category)
        if hint.isComplete { return "\(name) photographed" }
        if hint.shotsTaken == 0 && !hint.needsNewAngle { return "\(name) found — hold steady" }
        let count = "\(hint.shotsTaken) of \(hint.shotsWanted) photos"
        return hint.needsNewAngle ? "\(name): \(count) — try another side" : "\(name): \(count) — hold steady"
    }
}
```

`RoomScanView.swift` — in `body`, change the overlay `VStack` to:

```swift
            VStack {
                HStack {
                    // existing Cancel button + Spacer(), unchanged
                }
                if scanner.state == .scanning, let hint = scanner.focusHint {
                    ScanFocusHintView(hint: hint)
                        .padding(.top, 8)
                        .transition(.opacity)
                }
                Spacer()
                bottomPanel
            }
            .padding(20)
            .animation(.easeOut(duration: 0.2), value: scanner.focusHint?.objectId)
```

and in `bottomPanel` `.scanning`, choose the text by `capturePhotos`:

```swift
                statusText(capturePhotos
                    ? "Walk slowly around the room. When furniture is found, hold the phone steady on it for a moment."
                    : "Walk slowly around the room. Point at every wall, door, window, and piece of furniture.")
```

- [ ] **Step 4: Run full tests + device build.** Expected: all pass; `BUILD SUCCEEDED`.
- [ ] **Step 5: Docs + commit**

ARCHITECTURE: Models row `ObjectNames.swift` (`ObjectNames.display(category:)`); Views row `ScanFocusHintView.swift` (`ScanFocusHintView`, `message(for:)`); `RoomScanView.swift` row mention the hint. CHANGELOG entry.

```bash
git add ios/RoomFlow/Models/ObjectNames.swift ios/RoomFlow/Views/ScanFocusHintView.swift ios/RoomFlow/Views/RoomScanView.swift ios/RoomFlowTests/ScanFocusHintTests.swift docs/ARCHITECTURE.md docs/CHANGELOG.md
git commit -m "feat(ios): show a furniture photo hint while scanning"
```

---

### Task 5: Photo coverage summary after the scan and in Review room

**Files:**
- Create: `ios/RoomFlow/Models/PhotoCoverage.swift`
- Test: `ios/RoomFlowTests/PhotoCoverageTests.swift`
- Modify: `ios/RoomFlow/Views/ScanSummaryView.swift` (photo section ~line 55–66; Review link line 46)
- Modify: `ios/RoomFlow/Views/RoomEvidenceReviewView.swift` (stored property, init, `photoSection`)
- Docs: ARCHITECTURE (Models + both Views rows), CHANGELOG

**Interfaces:**
- Consumes: `RoomObject` (`category`, `sourceId`), `RoomPhotoAssociation` (`sourceId`, `photoId`), `RoomEvidenceSelection.label(for:) -> String?`, `RoomEvidenceSelection.sharedPhotos(from:)`, `ObjectNames.display(category:)` (Task 4).
- Produces:
  - `nonisolated struct PhotoCoverage: Equatable { var covered: Int; var total: Int; var missing: [String]; var summary: String? }`
  - `static func PhotoCoverage.make(objects: [RoomObject], associations: [RoomPhotoAssociation], photoIds: Set<UUID>, label: (UUID) -> String?) -> PhotoCoverage`
  - `RoomEvidenceReviewView.init(captureID:room:photos:associations:store:)` — new `associations: [RoomPhotoAssociation] = []` before `store`.

Rules: only objects with a `sourceId` count. Covered = some association with that `sourceId` has `photoId ∈ photoIds`. `missing` = user label if any, else `ObjectNames.display`, in room order, repeats collapsed as "Chair ×2". `summary`: nil when `total == 0`; "Photos cover the only item" (1 of 1); "Photos cover all \(total) items"; else "Photos cover \(covered) of \(total) items — missing: \(missing joined by ", ")".

- [ ] **Step 1: Failing tests** — first open `ios/RoomFlow/Models/RoomModel.swift` / `RoomObject.swift` to confirm `Vector3` and `ObjectDimensions` initializers (e.g. `Vector3(x:y:z:)`, `ObjectDimensions(width:height:depth:)`) and adjust `object(_:)` if they differ.

```swift
import Foundation
import Testing
@testable import RoomFlow

struct PhotoCoverageTests {
    private func object(_ category: String) -> RoomObject {
        RoomObject(id: "\(category)-1", category: category, position: Vector3(x: 0, y: 0, z: 0),
                   dimensions: ObjectDimensions(width: 1, height: 1, depth: 1), yawDegrees: 0,
                   movable: true, source: "roomplan", confidence: "high", sourceId: UUID())
    }

    private func association(_ object: RoomObject, _ photo: UUID) -> RoomPhotoAssociation {
        RoomPhotoAssociation(sourceId: object.sourceId!, photoId: photo, rect: [0, 0, 0.5, 0.5])
    }

    @Test func countsCoveredAndNamesMissing() {
        let sofa = object("sofa"), tv = object("television"), chairA = object("chair"), chairB = object("chair")
        let photo = UUID()
        let coverage = PhotoCoverage.make(objects: [sofa, tv, chairA, chairB], associations: [association(sofa, photo)],
                                          photoIds: [photo], label: { _ in nil })
        #expect(coverage.covered == 1)
        #expect(coverage.total == 4)
        #expect(coverage.summary == "Photos cover 1 of 4 items — missing: TV, Chair ×2")
    }

    @Test func excludedPhotosDoNotCount() {
        let sofa = object("sofa"), photo = UUID()
        let coverage = PhotoCoverage.make(objects: [sofa], associations: [association(sofa, photo)],
                                          photoIds: [], label: { _ in nil })
        #expect(coverage.covered == 0)
        #expect(coverage.missing == ["Sofa"])
    }

    @Test func userLabelsNameMissingItems() {
        let tv = object("television")
        let coverage = PhotoCoverage.make(objects: [tv], associations: [], photoIds: [], label: { _ in "Big screen" })
        #expect(coverage.missing == ["Big screen"])
    }

    @Test func objectsWithoutScanIdentityAreIgnored() {
        var added = object("sofa")
        added.sourceId = nil
        #expect(PhotoCoverage.make(objects: [added], associations: [], photoIds: [], label: { _ in nil }).summary == nil)
    }

    @Test func completeSummaries() {
        let sofa = object("sofa"), bed = object("bed"), photo = UUID()
        let one = PhotoCoverage.make(objects: [sofa], associations: [association(sofa, photo)],
                                     photoIds: [photo], label: { _ in nil })
        #expect(one.summary == "Photos cover the only item")
        let two = PhotoCoverage.make(objects: [sofa, bed], associations: [association(sofa, photo), association(bed, photo)],
                                     photoIds: [photo], label: { _ in nil })
        #expect(two.summary == "Photos cover all 2 items")
    }
}
```

- [ ] **Step 2: Run** `-only-testing:RoomFlowTests/PhotoCoverageTests`. Expected: build FAIL (`PhotoCoverage` missing).

- [ ] **Step 3: Implement** `PhotoCoverage.swift`:

```swift
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
```

- [ ] **Step 4: UI**

`ScanSummaryView` — directly after the `Label("Reference photos (\(photos.count))", …)` navigation link inside `if !photos.isEmpty`, add:

```swift
                if let appearance,
                   let summary = PhotoCoverage.make(objects: room.objects, associations: appearance.associations,
                                                    photoIds: Set(photos.map(\.id)), label: { _ in nil }).summary {
                    Text(summary)
                        .font(.footnote)
                        .foregroundStyle(Color.rfSecondaryText)
                }
```

(This screen uses scan names; the person's labels live in Review room.) At line 46 pass the associations: `RoomEvidenceReviewView(captureID: rawCapture.id, room: room, photos: photos, associations: appearance?.associations ?? [])`.

`RoomEvidenceReviewView` — add `let associations: [RoomPhotoAssociation]` after `let photos`; init becomes `init(captureID: UUID, room: RoomModel, photos: [RoomPhotoEvidence], associations: [RoomPhotoAssociation] = [], store: RoomArchiveStore = .shared)` assigning `self.associations = associations`. In `photoSection`, right after the "Sharing X of Y photos…" `Text`, add:

```swift
            if !associations.isEmpty, selection.includePhotos,
               let summary = PhotoCoverage.make(objects: room.objects, associations: associations,
                                                photoIds: Set(selection.sharedPhotos(from: photos).map(\.id)),
                                                label: { selection.label(for: $0) }).summary {
                Text(summary)
                    .font(.footnote)
                    .foregroundStyle(Color.rfSecondaryText)
            }
```

Check `sharedPhotos(from:)`'s return type in `RoomEvidenceSelection.swift`: if it returns `[RoomPhotoEvidence]` keep `.map(\.id)`; if it returns IDs, pass `Set(...)` directly.

- [ ] **Step 5: Full tests + device build.** Expected: all pass; `BUILD SUCCEEDED`.
- [ ] **Step 6: Docs + commit**

ARCHITECTURE: Models row `PhotoCoverage.swift` (`PhotoCoverage`, `make(objects:associations:photoIds:label:)`, `summary`); `ScanSummaryView.swift` and `RoomEvidenceReviewView.swift` rows mention the coverage line and the new `associations` init parameter. CHANGELOG entry.

```bash
git add ios/RoomFlow/Models/PhotoCoverage.swift ios/RoomFlowTests/PhotoCoverageTests.swift ios/RoomFlow/Views/ScanSummaryView.swift ios/RoomFlow/Views/RoomEvidenceReviewView.swift docs/ARCHITECTURE.md docs/CHANGELOG.md
git commit -m "feat(ios): show which furniture has photos after a scan"
```

---

### Task 6: On-device verification (needs the user's iPhone 15 Pro)

**Files:**
- Modify: `docs/ios-room-evidence-verification.md`, `docs/CHANGELOG.md`

- [ ] **Step 1:** User runs the RoomFlow scheme on the iPhone from Xcode with photo capture ON, in a room with ≥4 detectable items (sofa/armchair, table, TV, bed or storage).
- [ ] **Step 2:** Check and record each as pass/fail with notes:
  - Hint appears within ~1 s of an item being detected; ring fills while steady; "try another side" after a photo; "photographed" after 3.
  - Hint never blocks Cancel / Done Scanning; scanning and Apple's preview continue normally.
  - With photo capture OFF: no hint, old status text.
  - Scan summary shows "Photos cover X of Y items"; in Reference photos, each covered item's region box sits on the item.
  - Review room: leaving out an item's only photo lowers the count.
  - `.roomflow.zip` still imports in the web app on `feat/web-roomflow-zip-import` (manifest unchanged).
  - Coverage compared with the earlier scan (2 of 8 items): record the new X of Y.
- [ ] **Step 3:** Add "Furniture-aware photos (date, commit, iPhone 15 Pro)" to the verification report with the table; move unmet checks to "Still unverified"; CHANGELOG entry; commit:

```bash
git add docs/ios-room-evidence-verification.md docs/CHANGELOG.md
git commit -m "docs(ios): record furniture-aware photo results from iPhone 15 Pro"
```

## Out of scope (later)

- Web: pre-select the best photo/crop in "Match appearance from photo" via `evidenceStore.regionsFor` (Yash's code; separate discussion).
- Blur scoring on the image itself; per-category framing rules; photos of walls/openings.
- Pushing `spike/live-object-hints` or merging it into `keshav-ios` — ask the user first.
