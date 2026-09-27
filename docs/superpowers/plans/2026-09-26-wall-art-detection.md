# Wall Art Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While scanning with photo capture on, find framed art, posters and flat canvases hanging on walls (RoomPlan has no category for them), measure each on its wall, keep a straight-on photo of it, save it with the room, and let the person review/remove false finds.

**Architecture:** Vision rectangle detection on camera frames (every 500 ms, off the main thread) → pure `WallArtDetector` judges one rectangle against live walls, LiDAR flatness, size, floor clearance, openings and TVs → pure `WallArtTracker` groups sightings by 3D position (live wall IDs change mid-scan), confirms groups seen ≥3 times from ≥0.2 m apart, and at the end re-attaches them to the FINAL room's walls and merges touching panels into one piece. A `WallArtScanner` owns Vision + straight-on photos (CIPerspectiveCorrection). Items are saved locally (`wallArt.json` + `art/*.jpg`) and shown in Review room.

**Tech Stack:** Swift 5 mode, iOS 17, Vision, ARKit, Core Image, RoomPlan, Swift Testing. No new dependencies.

**Spec:** Device spikes 2026-09-26 (`WallArtSpike.swift` logs): A4 sheet measured 21×30 cm; a TV consistently ~85 cm wide; one 38 cm canvas panel measured 39 cm; live wall IDs replaced mid-scan (`836B`→`91A5`); early live wall planes off by 10–20 cm (flat surfaces read +0.11 m behind / −0.20 m in front); layered canvas panels stand off the wall; RoomPlan did not always detect the TV. User-approved direction: rectangle detection first, Gemini fallback later.

## Global Constraints

- Branch `spike/live-object-hints` (iOS only). Do not touch `web/`, `.worktrees/`, `docs/superpowers/`, `.claude/`, any `.env*`.
- iOS 17, Swift 5 mode, `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`; pure types are `nonisolated`.
- Art detection runs only when photo capture is on (`RoomScanService.capturePhotos`); with it off nothing changes.
- Measurements are "measured estimate" (camera + LiDAR), never claimed exact; a single sighting is never saved.
- The package contract `docs/ios-room-package.md` is Yash-agreed: this plan does NOT add art to the package (separate agreement later).
- Never log photos or full payloads; art photos are straight-on crops ≤1024 px, JPEG via the existing `ImageIOPhotoEncoder` (no metadata).
- Every code commit updates `docs/CHANGELOG.md` (new entry at top of `## 2026-09-26`), `docs/ARCHITECTURE.md` rows for new/changed files and public functions, `docs/DECISIONS.md` for real tradeoffs; stage docs by explicit path. `///` doc comments on new types/functions.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands: tests `xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test` (one suite: `-only-testing:RoomFlowTests/<Suite>`); device build `xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`.
- New files join targets automatically (synchronized groups).
- A "Fact-Forcing Gate" hook blocks the first Bash and each new file/edit until facts are stated; state them and retry.

## Conventions (shared by all tasks)

- World = RoomPlan native (meters, +Y up). Camera looks down −Z; camera +X = image right, +Y = image up.
- Image points are normalized, **top-left origin** (Vision's bottom-left y is flipped once, in `WallArtScanner`).
- Quad corner order: top-left, top-right, bottom-right, bottom-left.
- `LiveSurface` (exists, `LiveRoomObserver.swift`): `sourceId`, `kind` (.wall/.door/.window/.opening), `transform` (center pose; local Z = normal), `dimensions` (x width, y height).
- `LiveObject` (exists, `ObjectFocusTracker.swift`): `sourceId`, `category`, `transform`, `dimensions`, `center`.
- `PhotoFrameSnapshot` (exists, `RoomEvidenceRecorder.swift`): `timestamp`, `cameraToWorld`, `intrinsics`, `imageWidth`, `imageHeight`, `trackingNormal`.

---

### Task 1: WallArtDetector (judge one rectangle)

**Files:**
- Create: `ios/RoomFlow/Services/WallArtDetector.swift`
- Test: `ios/RoomFlowTests/WallArtDetectorTests.swift`
- Docs: ARCHITECTURE (Services row), CHANGELOG, DECISIONS ("TV-shaped rectangles are skipped"; "panels measured on their own plane")

**Interfaces — Produces:**
- `nonisolated struct WallArtSighting: Equatable, Sendable { corners: [SIMD3<Float>]; normal: SIMD3<Float>; standoff: Float; width: Float; height: Float; center: SIMD3<Float>; cameraPosition: SIMD3<Float>; timestamp: TimeInterval; quad: [SIMD2<Float>]; frontality: Float }`
- `nonisolated enum WallArtRejection: String, Sendable { notOnWall, spansWalls, uneven, behindWall, tooFarInFront, sizeOutOfRange, nearFloor, overlapsOpening, overlapsTV, likelyTV }`
- `nonisolated enum WallArtVerdict: Equatable, Sendable { case sighting(WallArtSighting), rejected(WallArtRejection) }`
- `nonisolated enum WallArtDetector { static func judge(quad: [SIMD2<Float>], camera: PhotoFrameSnapshot, surfaces: [LiveSurface], objects: [LiveObject], depthAt: (Float, Float) -> Float?) -> WallArtVerdict }`

Rules, in order:
1. Cast each corner as a ray; a wall "holds" the quad when all 4 rays hit its plane in front of the camera (t > 0.1) inside its extents with 10 cm slack. No wall hit by any ray → `.notOnWall`; some hit but no single wall holds all 4 → `.spansWalls`. Several hold → nearest (mean hit distance).
2. `normal` = wall local Z flipped to face the camera. LiDAR at 5 points (quad center, and halfway from center to each corner): `delta = measured − expectedZDepthOnWallPlane`. With ≥3 valid samples: `range > 0.06` → `.uneven`; `median > 0.15` → `.behindWall`; `median < −0.30` → `.tooFarInFront`; otherwise the **measured plane** is the wall plane shifted by `−median` along `normal` (where LiDAR actually sees the surface; this also absorbs early wall-position error) and `standoff = max(0, −median)`. Fewer than 3 samples → wall plane, `standoff = 0`.
3. Re-cast the 4 corner rays onto the measured plane → `corners`; `width` = mean of top/bottom edge lengths, `height` = mean of left/right; `center` = corner mean.
4. `width` and `height` in 0.25…2.5 m and long/short ≤ 5, else `.sizeOutOfRange`.
5. `floorY` = min over walls of (center.y − height/2); lowest corner y − floorY < 0.40 → `.nearFloor`.
6. In the holding wall's local frame, the quad's box overlaps a door/window/opening whose center has |local z| < 0.3 → `.overlapsOpening`; overlaps a `television` object whose center has |local z| < 0.5 → `.overlapsTV`.
7. width/height in 1.70…1.85 and width ≥ 0.55 → `.likelyTV` (RoomPlan misses TVs sometimes).
8. `frontality` = dot(normalize(camera → center), −normal) clamped 0…1.

- [ ] **Step 1: Write the failing tests**

```swift
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
```

- [ ] **Step 2: Run** `-only-testing:RoomFlowTests/WallArtDetectorTests` → build FAIL (`WallArtDetector` missing).
- [ ] **Step 3: Implement** `WallArtDetector.swift` per the rules. Private static helpers: `ray(camera:u:v:) -> SIMD3<Float>` (`d = ((u·W − cx)/fx, −(v·H − cy)/fy, −1)` rotated by `cameraToWorld`, normalized); `hitPlane(origin:direction:point:normal:) -> (t: Float, point: SIMD3<Float>)?` (nil if |dot| < 1e-4 or t ≤ 0.1); `inside(_ wall:, point:, slack:) -> Bool`; `overlaps(aMin:aMax:bMin:bMax:)`. Expected z-depth of a world point = `−(cameraToWorld.inverse * p).z`. `///` comments on every type/function.
- [ ] **Step 4: Run** the suite → 6 PASS; then the full suite.
- [ ] **Step 5: Docs + commit** (`feat(ios): judge rectangles as possible wall art`).

---

### Task 2: WallArtTracker + WallArtItem (group, confirm, finalize)

**Files:**
- Create: `ios/RoomFlow/Models/WallArtItem.swift`, `ios/RoomFlow/Services/WallArtTracker.swift`
- Test: `ios/RoomFlowTests/WallArtTrackerTests.swift`
- Docs: ARCHITECTURE (Models + Services rows), CHANGELOG, DECISIONS ("art grouped by position, attached to final walls")

**Interfaces:**
- Consumes: `WallArtSighting` (Task 1), `LiveSurface`.
- Produces:
  - `nonisolated struct WallArtItem: Codable, Equatable, Identifiable, Sendable { var id: UUID; var wallSourceId: UUID; var centerX: Double; var centerY: Double; var width: Double; var height: Double; var standoff: Double; var sightingCount: Int; var photoFileName: String?; var method: String = "rectangle-lidar-v1" }` — `centerX/centerY` in the wall's local frame (meters from the wall center, +x along the wall, +y up); sizes in meters; a measured estimate.
  - `nonisolated struct WallArtTracker { init(); mutating func add(_ sighting: WallArtSighting) -> (group: Int, isNewBest: Bool); var confirmedCount: Int { get }; func finalize(walls: [LiveSurface]) -> [(item: WallArtItem, groups: [Int])] }`

Rules:
- `add`: joins the first group whose running-mean center is within 0.15 m and whose normal dot > 0.9; else starts a group. Keeps at most 30 sightings per group (drop oldest). `isNewBest` when this sighting's `frontality × width × height` exceeds the group's previous best by more than 10% (always true for a new group).
- Confirmed group: ≥3 sightings and max pairwise camera distance ≥ 0.2 m.
- `finalize(walls:)` (the final room's walls as `LiveSurface`): for each confirmed group take the median width/height/standoff and the median center (per axis); attach to the final wall with the nearest plane within 0.4 m (|local z|) whose extents contain the center (+0.1 slack); unattached groups are dropped. Then merge items on the same wall whose wall-local boxes overlap or are within 0.10 m (union box; standoff = max; sightingCount = sum; groups = union, sorted). Items get fresh `UUID()`s; `photoFileName` nil.

- [ ] **Step 1: Failing tests** in `WallArtTrackerTests.swift`, with a helper `sighting(center: SIMD3<Float>, width: Float = 0.4, height: Float = 0.3, camera: SIMD3<Float> = [0, 1.5, 0], normal: SIMD3<Float> = [0, 0, 1]) -> WallArtSighting` (4 corners on the plane through `center` perpendicular to `normal`, frontality 1):
  1. two sightings 5 cm apart → same group; a sighting with normal `[1, 0, 0]` at the same spot → new group.
  2. three sightings from one camera spot → `confirmedCount == 0`; from cameras at x = 0, 0.15, 0.3 → 1.
  3. `finalize` attaches to a wall centered `(0, 1.3, −3)` (4 × 2.6 m): sightings centered `(0.5, 1.4, −3)` → `centerX ≈ 0.5`, `centerY ≈ 0.1`, width ≈ 0.4, `wallSourceId` = that wall.
  4. two confirmed panels (0.38 m wide) centered x = 0 and x = 0.43 (5 cm gap) → one item ≈ 0.81 m wide with both groups.
  5. a confirmed group 1 m in front of every wall → no item.
  6. `WallArtItem` encodes and decodes equal (JSONEncoder/Decoder).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; full suite. **Step 5: Docs + commit** (`feat(ios): group wall-art sightings and attach them to final walls`).

---

### Task 3: WallArtScanner + scan wiring (replaces the spike)

**Files:**
- Create: `ios/RoomFlow/Services/WallArtScanner.swift`
- Delete: `ios/RoomFlow/Services/WallArtSpike.swift`
- Modify: `ios/RoomFlow/Services/RoomScanService.swift`, `ios/RoomFlow/Models/ScanCaptureResult.swift`, `ios/RoomFlow/Views/RoomScanView.swift`
- Docs: ARCHITECTURE (remove spike row; add scanner row; update service/result rows), CHANGELOG, DECISIONS (straight-on photo via CIPerspectiveCorrection)

**Interfaces:**
- Consumes: Tasks 1–2; `LiveRoomObserver.latestSurfaces()` / `latestObjects()`; `PhotoEncoding` / `ImageIOPhotoEncoder`.
- Produces:
  - `nonisolated enum DepthMapReader { static func depth(in map: CVPixelBuffer?, u: Float, v: Float) -> Float? }` (moved from `RoomScanService`'s private `depth(in:u:v:)`, which then calls this — one implementation).
  - `nonisolated final class WallArtScanner: @unchecked Sendable { init(encoder: any PhotoEncoding = ImageIOPhotoEncoder()); func reset(directory: URL); func process(frame: ARFrame, surfaces: [LiveSurface], objects: [LiveObject]); var confirmedCount: Int { get }; func finish(finalRoom: CapturedRoom) async -> [WallArtItem] }`
  - `ScanCaptureResult.wallArt: [WallArtItem]` (default `[]`), `RoomScanService.wallArt: [WallArtItem]`, and `RoomScanService.wallArtDirectory: URL?` (temp folder holding `art/*.jpg`).

Behavior:
- `process`: skip unless tracking is normal and a live wall exists; one frame at a time (lock + `busy`). On a private utility queue: `VNDetectRectanglesRequest` (maximumObservations 8, minimumSize 0.1, minimumConfidence 0.7, minimumAspectRatio 0.2, quadratureTolerance 30) on `frame.capturedImage`, orientation `.up`; flip Vision y (`1 − y`); snapshot the camera; depth via `DepthMapReader` on `sceneDepth ?? smoothedSceneDepth`; `WallArtDetector.judge`; on `.sighting` → `tracker.add`; when `isNewBest`, make a straight-on crop with `CIFilter.perspectiveCorrection()` (pixel corners; Core Image origin is bottom-left: `x = u·W`, `y = H − v·H`), scaled so the long edge ≤ 1024, and keep it as that group's best `CGImage` (at most 16 groups hold images).
- `finish(finalRoom:)`: drain the queue; convert `finalRoom.walls` to `LiveSurface(kind: .wall)`; `tracker.finalize`; for each item write the best image among its groups to `<directory>/<item.id>.jpg` via the encoder and set `photoFileName`; return items. Write failures leave `photoFileName = nil` (never fail the scan). Release all images.
- `RoomScanService`: when `capturePhotos`, `start()` calls `wallArtScanner.reset(directory: RoomEvidenceRecorder.defaultRoot/<sessionID>/art)` (create it); every 2nd loop tick with `capturePhotos`, `process(…)`; in `didPresent`'s photo Task after `evidenceRecorder.finish`, `wallArt = await wallArtScanner.finish(finalRoom: processedResult)` and set `wallArtDirectory` (same session guard as photos). `cancel()`/failures clear `wallArt`. Remove every `WallArtSpike` reference (property, reset, process, summary).
- `RoomScanView`: pass `scanner.wallArt` and `scanner.wallArtDirectory` into `ScanCaptureResult` (add `wallArtDirectory: URL?` there too).

- [ ] Steps: implement → device build (no new warnings in touched files) → full tests → docs → commit (`feat(ios): detect wall art while scanning`). Vision/Core Image glue has no unit tests; its logic is in Tasks 1–2.

---

### Task 4: Save, reopen and review wall art

**Files:**
- Modify: `ios/RoomFlow/Services/RoomArchiveStore.swift` (+ layout doc comment), `ios/RoomFlow/Models/RoomArchive*` (wherever `RoomArchive` is declared), `ios/RoomFlow/Views/HomeView.swift`, `ios/RoomFlow/Views/SavedRoomsView.swift`, `ios/RoomFlow/Views/RoomEditorView.swift` (pass-through as needed), `ios/RoomFlow/Views/ScanSummaryView.swift`, `ios/RoomFlow/Views/RoomEvidenceReviewView.swift`
- Test: `ios/RoomFlowTests/RoomArchiveStoreTests.swift`
- Docs: ARCHITECTURE, CHANGELOG

**Interfaces:**
- `RoomArchiveStore.saveCapture(…, wallArt: [WallArtItem] = [], wallArtDirectory: URL? = nil, …)`: writes `wallArt.json` (only when non-empty) and copies each item's `<wallArtDirectory>/<photoFileName>` into `art/`; a missing photo file sets that item's `photoFileName` to nil instead of failing.
- `RoomArchive.wallArt: [WallArtItem]` and `RoomArchive.wallArtDirectory: URL` (`rooms/<id>/art`).
- `RoomArchiveStore.saveWallArt(id: UUID, items: [WallArtItem]) throws` — atomic replace of `wallArt.json`.
- Rooms without `wallArt.json` load `[]`.

UI:
- `ScanSummaryView`: when there is wall art, a row "Wall art (N)" leading to Review room, with the footnote "Sizes are measured estimates."
- `RoomEvidenceReviewView`: section "Wall art (N)": per item a straight-on photo thumbnail (when present), "About W × H cm" (rounded), where it hangs ("On wall K" by index among the room's walls via `wallSourceId`, else "On a wall"), and a "Not wall art" button that removes it and persists via `saveWallArt` (errors shown like other save errors). Empty state when the scan had photos on: "No wall art was found. Framed pictures and posters work best." Accessible labels; no jargon.
- Temporary art files live under the scan session's temp folder, which HomeView already removes after saving.

- [ ] Steps: failing archive tests (save + load round trip with one item and a photo file; room without `wallArt.json` loads `[]`; `saveWallArt` replaces; missing photo → `photoFileName` nil) → implement → tests → device build → docs → commit (`feat(ios): save and review detected wall art`).

---

### Task 5: On-device verification (user's iPhone)

- [ ] Scan with photo capture on, in the room with the layered canvas (4 panels ≈ 38 cm each, ≈ 152 cm total), a framed picture/poster if any, a TV, a door and outlets.
- [ ] Record: art found and size vs tape; TV not reported; doors/outlets not reported; photos straight-on; a Review-room removal persists after reopening.
- [ ] Add "Wall art detection" to `docs/ios-room-evidence-verification.md`; commit.

## Out of scope (later)
- Package/web: `wallArt.json` + art photos in `.roomflow.zip` and drawing art on web walls — needs Yash's agreement on `docs/ios-room-package.md` first.
- Gemini fallback for irregular art the rectangle finder misses; a live "Picture found — hold steady" hint.
