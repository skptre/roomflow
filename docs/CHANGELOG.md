# Changelog

Newest first. Append an entry after every code change (what changed, why, where); never edit older entries.
Format: `### YYYY-MM-DD — area: summary`, then bullets naming files and new/changed functions.

## 2026-09-26

### iOS: judge rectangles as possible wall art
- New `ios/RoomFlow/Services/WallArtDetector.swift`: pure `WallArtDetector.judge(quad:camera:surfaces:objects:depthAt:)`,
  extracted and TDD-tested from `WallArtSpike`'s judging logic (the spike itself is untouched; it is deleted in a
  later task). Produces `WallArtSighting` (measured corners/normal/standoff/width/height/center/frontality) or
  `WallArtVerdict.rejected(WallArtRejection)` (`notOnWall`, `spansWalls`, `uneven`, `behindWall`, `tooFarInFront`,
  `sizeOutOfRange`, `nearFloor`, `overlapsOpening`, `overlapsTV`, `likelyTV`). Adds a `likelyTV` rule (16:9-ish,
  ≥55 cm wide) the spike didn't have, since RoomPlan sometimes misses TVs entirely.
- New `ios/RoomFlowTests/WallArtDetectorTests.swift`: 6 tests covering a flush and a standoff panel, uneven/behind/
  too-far-in-front depth, off-wall/small/low/TV-shaped rejections, door and TV overlap, and a rectangle spanning
  past a wall's edge.
- Why: Task 1 of the wall-art-detection plan pulls the spike's ad hoc judging into a pure, unit-tested type so
  later tasks (scanning integration, spike removal) can build on deterministic, verified geometry.

### iOS: wall-art spike, round 3 (layered canvases)
- `WallArtSpike.swift`: LiDAR sampled at five points; a consistent surface up to 30 cm in front of the wall counts as a
  panel standing off the wall (layered canvas) and is measured on its own plane; uneven depth is still "something in
  front". Rejects rectangles under 25 cm or starting below 40 cm (furniture). Summary merges groups on the same wall
  within 10 cm into pieces. Why: the real test painting is a multi-panel canvas ~20 cm off the wall and was rejected.

### iOS: wall-art spike, round 2
- `WallArtSpike.swift`: groups sightings by 3D position instead of live wall ID (the device log showed wall `836B`
  replaced by `91A5` mid-scan, splitting one object into two groups); rejects surfaces more than 8 cm behind the wall
  (seen through a doorway/window); summary shows first-seen time, height above floor, and the final wall matched by
  position.

### iOS: spike: log possible wall art during scanning
- New `ios/RoomFlow/Services/WallArtSpike.swift` (DEBUG only): `WallArtSpike` (`reset()`, `process(frame:surfaces:objects:)`,
  `logSummary(finalRoom:)`). Vision rectangle detection every 500 ms; corners cast onto live walls; rejects by LiDAR depth
  in front, size, door/window/opening or TV overlap; groups accepted sightings per wall. Logs only (category `WallArt`).
- `LiveRoomObserver.swift`: new `LiveSurface` and `latestSurfaces()` (live walls, doors, windows, openings).
- `RoomScanService.swift`: calls the spike under `#if DEBUG`.
- Why: RoomPlan has no category for paintings; this checks on a real room whether rectangle + wall geometry finds them.

### iOS: furniture-aware photos — review fixes
- `ios/RoomFlow/Services/RoomScanService.swift`: sampling loop now calls `updateFocus(with:)` before the
  every-third-tick ambient-color/photo block, so an ambient encode starting first can no longer make the same
  tick's focused shot refuse (busy encoder). In `updateFocus(with:)`'s `.shoot` case, `hint?.dwellProgress = 0`
  now runs whether or not the shot was accepted; only `shotsTaken += 1` and `recordShot` stay conditional on
  acceptance.
- `ios/RoomFlow/Services/ObjectFocusTracker.swift`: `update(objects:camera:depthAt:)` now prefers, among
  in-view objects, the most-centered one that is neither complete nor due a new angle; only when every
  in-view object is complete or needs a new angle does it fall back to the most-centered overall (so that
  hint still shows). New test `ObjectFocusTrackerTests.prefersIncompleteObjectOverACompleteCenteredOne`.
- `ios/RoomFlow/Services/RoomEvidenceRecorder.swift`: new `noteTrackingInterrupted(sessionID:)` marks a
  tracking interruption seen outside `consider(...)` (interruptions += 1, all candidates
  `trackingContinuous = false`; ignores a stale session) — factored out of, and now shared with,
  `consider(snapshot:sessionID:makeImage:)`'s own tracking-lost branch. `RoomScanService.updateFocus(with:)`
  calls it when `snapshot.trackingNormal` is false. New test
  `RoomEvidenceRecorderTests.noteTrackingInterruptedMarksCandidatesUncertain`.
- `ios/RoomFlow/Views/RoomEvidenceReviewView.swift`: dropped the `!associations.isEmpty` guard on the photo
  footnote so it behaves like the "Sharing N of M" footnote above it (gated only on `selection.includePhotos`);
  removed the `= []` default on the `associations` init parameter (the one caller, `ScanSummaryView`, already
  passes it explicitly).
- `ios/RoomFlow/Services/LiveRoomObserver.swift`: log prefix `[spike]` → `[live]`; wrapped the log-string
  building in `record(_:)` (`shouldLog`/`addedObjects`/`removedNames`/`emit` — not the `seen`/`current`/`latest`
  state updates) in `#if DEBUG` so release builds skip that work.
- `docs/DECISIONS.md`: renamed the "Live object spike forwards to the session's existing delegate" entry to
  "Live-object feed forwards to the session's existing delegate" (body unchanged).
- `docs/INDEX.md`: new row "iOS — furniture-aware photos (live objects, focus hint, coverage)".
- `docs/ARCHITECTURE.md`: added an `ObjectFocusTrackerTests.swift` Tests-table row; extended the
  `RoomEvidenceRecorderTests.swift` row with focused shots/thinning/final-selection/old-archive coverage;
  fixed the `ScanFocusHintView.swift` Views-table row (was 3 cells in a 2-column table); added
  `noteTrackingInterrupted(sessionID:)` to the recorder's Services-table row; updated the
  `RoomEvidenceReviewView.swift` row for the now-required `associations` parameter.

### iOS: show which furniture has photos after a scan
- New `ios/RoomFlow/Models/PhotoCoverage.swift`: `PhotoCoverage` (`covered`, `total`, `missing`, `summary`) and
  `PhotoCoverage.make(objects:associations:photoIds:label:)` compute, from scanned objects (only those with a
  `sourceId`) and their photo associations, how many have a counted photo and the display names of those that
  don't (repeats collapsed, e.g. "Chair ×2"). Presentation only — never changes measurements or which photos
  are shared.
- `ScanSummaryView.swift`: below the "Reference photos (N)" link, a footnote from `PhotoCoverage.make(...)`
  (scan names only, all photos counted) when `appearance` is available. Passes `appearance?.associations` into
  `RoomEvidenceReviewView`.
- `RoomEvidenceReviewView.swift`: new `let associations: [RoomPhotoAssociation]` and
  `init(captureID:room:photos:associations:store:)` (`associations` defaults to `[]`, so the one existing
  caller in `ScanSummaryView.swift` — now updated — is the only call site). `photoSection` shows the same
  footnote, scoped to the currently shared photos and using the person's own object labels
  (`selection.label(for:)`), only when photos are included and associations exist.
- New `ios/RoomFlowTests/PhotoCoverageTests.swift`: covered/missing counts and names, excluded photos don't
  count, user labels override scan names in `missing`, objects without a `sourceId` are ignored, "only item"
  and "all N items" summaries.

### iOS: hint overlay on the scan screen
- New `ios/RoomFlow/Models/ObjectNames.swift`: `ObjectNames.display(category:)` turns category strings
  ("television", "washerDryer") into display names ("TV", "Washer"), splitting camelCase and handling special
  short names. Used by views to show user-friendly furniture names without storage changes.
- New `ios/RoomFlow/Views/ScanFocusHintView.swift`: small non-blocking capsule showing the name of the
  furniture in view, photo count and progress ring, and guidance ("hold steady", "try another side", etc.).
  Sits under the top controls; appears only when `RoomScanService.capturePhotos` is on, scanning, and
  something is in focus. New `ScanFocusHintView.message(for:)` implements the copy table from the plan:
  4 cases (0 photos + no new angle, 1+ photos + new angle, 1+ photos holding, complete).
- `ios/RoomFlow/Views/RoomScanView.swift`: shows `ScanFocusHintView` below the Cancel button when
  `scanner.state == .scanning` and `scanner.focusHint` is non-nil, with a `.opacity` transition and
  animation keyed on the object ID. Updated `.scanning` status text to vary by `capturePhotos` flag.
- New `ios/RoomFlowTests/ScanFocusHintTests.swift`: 2 test cases over message text (4 scenarios) and
  display names (camelCase, special cases, unknown).
- Why: task 4 of the furniture-aware photos plan. Surfaces the focus hint (created by task 1's tracker,
  wired up by task 3) so the person knows which object the app is trying to photograph and how many
  shots are done and needed.
- Verified: device build (`generic/platform=iOS`, `CODE_SIGNING_ALLOWED=NO`) succeeds; full suite
  (`RoomFlowTests` scheme, iPhone 18 Pro Simulator) — 56/56 tests pass (54 existing + 2 new).
- Fix round 1: `RoomScanView.swift` animation now respects `accessibilityReduceMotion` setting (disables hint opacity transition for users who prefer reduced motion).

### iOS: furniture-aware photos — live feed and scan loop wiring
- `ios/RoomFlow/Services/LiveRoomObserver.swift`: promoted from a debug-only spike to the live-object feed
  used at runtime. New `latestObjects() -> [LiveObject]`: thread-safe copy of the newest live room's objects
  (built in `record(_:)`, cleared in `reset()`). `emit(_:)` now only logs in `DEBUG` builds (dropped the
  duplicate `print`, since the `Logger` line already showed in Xcode's console).
- `ios/RoomFlow/Services/RoomScanService.swift`: removed the three `#if DEBUG` guards around `liveObserver`,
  `install(on:)`, and `logFinalOverlap(with:)` — the live feed now runs in release builds too. New
  `private(set) var focusHint: FocusHint?` (nil unless `capturePhotos` is on, scanning, and something is
  framed), backed by `ObjectFocusTracker`. `startColorSampling()` now polls every 250 ms: `updateFocus(with:)`
  runs the focus tracker and takes focused photos every tick (via `RoomEvidenceRecorder.captureFocused`),
  while `colorSampler.capture`/ambient `evidenceRecorder.consider` still run every third tick (~750 ms, as
  before). New `Self.depth(in:u:v:)` reads LiDAR depth from the scene-depth map at a normalized point for the
  tracker's occlusion check. `focusHint` is reset to nil in `start()`, `finish()`, `cancel()`, and
  `stopEvidence()`.
- Why: task 3 of the furniture-aware photos plan. Connects task 1's `ObjectFocusTracker` and task 2's
  `RoomEvidenceRecorder.captureFocused` to the running scan, so the app can actually surface a focus hint
  and take a focused photo while scanning, instead of just having the pieces in isolation.
- Verified: device build (`generic/platform=iOS`, `CODE_SIGNING_ALLOWED=NO`) succeeds with no new warnings in
  either file; full suite (`RoomFlowTests` scheme, iPhone 18 Pro Simulator) — 54/54 tests pass. Not verified:
  behavior on a physical LiDAR device (no device build/run was available in this session).

### iOS: furniture-aware photos — recorder focused shots and coverage-aware selection
- `ios/RoomFlow/Models/RoomPhotoEvidence.swift`: new `focusObjectId: UUID?` field (default nil, local archive
  only, not part of the package manifest) recording which live object a photo was deliberately taken of;
  `CodingKeys` updated so old archives without the key decode it as nil.
- `ios/RoomFlow/Services/RoomEvidenceRecorder.swift`:
  - `PhotoCandidatePolicy.thin(_:) -> (kept:dropped:)` replaces the old even-halving of `candidates` in
    `encodingFinished`: thins ambient (non-focused) photos first, then the newest photo of whichever object
    has the most, only touching the single remaining ambient photo or a focused photo last.
  - `PhotoCandidatePolicy.selectFinal(_:)` reworked: round-robins one photo per object (first-seen order,
    then a second each, …) up to `maxPhotos`, fills the remainder with ambient photos spread evenly over
    time, then trims to `maxTotalBytes` by dropping the largest ambient photo first and only then the
    largest photo of the busiest object. Output sorted by timestamp.
  - `RoomEvidenceRecorder.consider(snapshot:sessionID:makeImage:)` refactored: the encode-starting body moved
    into private `startEncode(_:snapshot:sessionID:focusObjectId:)`, shared with the new focused path.
  - New `RoomEvidenceRecorder.captureFocused(snapshot:objectId:sessionID:makeImage:) -> Bool` and
    `captureFocused(frame:objectId:sessionID:) -> Bool`: take a deliberate photo of `objectId` now, bypassing
    `minimumInterval`/`isNewView` (the focus tracker already decided), refused only when the session is
    stale, tracking isn't normal, an encode is already in flight, or `makeImage` returns nil.
  - New internal `RoomEvidenceRecorder.snapshot(of: ARFrame) -> PhotoFrameSnapshot` extracted out of
    `consider(frame:sessionID:)` for reuse by the focused-frame path and by task 3's caller.
- Test: `ios/RoomFlowTests/RoomEvidenceRecorderTests.swift` — 7 new cases covering focused-shot capture
  (bypasses the motion gate, still refused while an encode is busy, refused for a stale session/lost
  tracking/failed image), `thin` (drops ambient before focused, trims the busiest object when only focused
  photos remain), `selectFinal` (covers every object before filling ambient, trims ambient before losing an
  object to the byte budget), and that photos without a `focusObjectId` key still decode.
- Why: task 2 of the furniture-aware photos plan. Task 1's `ObjectFocusTracker` decides when to take a
  focused shot; the recorder now has a path to actually take one and to keep it through thinning and final
  selection instead of losing it to the old even-spread-over-time logic, which could drop the only photo of
  a small or briefly-seen item.

### iOS: furniture-aware photos — focus tracker
- New `ios/RoomFlow/Services/ObjectFocusTracker.swift`: `LiveObject`, `FocusShotPolicy`, `FocusHint`,
  `FocusDecision`, and pure `ObjectFocusTracker` (`update(objects:camera:depthAt:)`,
  `recordShot(objectId:cameraToWorld:objectCenter:)`, `shots(for:)`, `reset()`). Decides, per sampling tick,
  whether a live-detected object is in view (unclipped, big enough, close enough, unoccluded by LiDAR depth),
  the phone is steady, and a not-yet-photographed angle is due, dwelling before signalling a shot and capping
  at `maxShotsPerObject`.
- Test: `ios/RoomFlowTests/ObjectFocusTrackerTests.swift`, 9 cases covering dwell timing, movement rejection,
  edge-clipping, occlusion, angle diversity/cap, tracking loss, and most-centered-object selection.
- Why: task 1 of the furniture-aware photos plan. One real scan (see `docs/ios-room-evidence-verification.md`)
  produced usable photos of only 2 of 8 detected items because nothing told the person which objects still
  needed a closer shot; this pure decider is the first building block for a live on-screen hint.

### Docs: live-object spike results
- `docs/ios-room-evidence-verification.md`: on-device results of the `LiveRoomObserver` spike (delegate slot was
  empty, preview unchanged, live IDs survive into the final room, detection latency).

### iOS: spike: log live detected objects during scanning
- New `ios/RoomFlow/Services/LiveRoomObserver.swift` (`LiveRoomObserver`, `install(on:)`, `logFinalOverlap(with:)`),
  wired in `RoomScanService.start()` / `captureView(didPresent:)` under `#if DEBUG`.
- Why: step 1 of furniture-aware photo capture. Checks that `RoomCaptureSession.delegate` can deliver live
  `didUpdate` rooms without breaking `RoomCaptureView`'s preview, and whether live object IDs match the final room.
  Logs go to the Xcode console and Console.app (subsystem `RoomFlow`, category `LiveObjects`).

### Docs: project records and indexing
- Added `docs/INDEX.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, and the rules in
  `.claude/documentation.md` / `.claude/index.md`, referenced from `CLAUDE.md` and `AGENTS.md`.
- Why: every change is recorded and indexed so files can be found without searching.

### iOS: color sampling from cleaner regions (`7513603`)
- `RoomColorSampler.wallPoints` samples 55–80% of wall height; `objectPoints` uses a 3×3 top grid for tables.

### iOS: verification report (`0ef5182`), photo metadata wording (`c298eb6`)
- `docs/ios-room-evidence-verification.md`: automated + iPhone 15 Pro results, findings, open checks.
- `ImageIOPhotoEncoder` doc and `docs/ios-room-package.md`: JPEGs carry only pixel-dimension EXIF tags.

### iOS: versioned room package (`cc677a8`)
- New `RoomPackageManifest` (`validate()`, `isAllowed(_:)`), `PackageAppearance`, `RoomPackageExport.export(…)`,
  `CoordinatorZipArchiver`; `ScanSummaryView` gains Prepare/Share Room Package. Contract: `docs/ios-room-package.md`.

### iOS: Review room (`2d3e6dc`)
- New `RoomEvidenceSelection` (`setLabel`, `setPhoto`, `setIncludePhotos`, `sharedPhotos`), `ObjectAnnotation`,
  `RoomEvidenceReviewView`; `RoomArchiveStore.saveSelection`; `RoomArchive.selection`.

### iOS: photos mapped to objects (`25d4719`)
- New `RoomEvidenceProjector` (`projectedBounds`, `associate`, `appearance`), `RoomAppearanceEvidence`,
  `SourceColor`, `RoomPhotoAssociation`; `appearance.json` in saved rooms; region overlay in `RoomPhotosView`.

### iOS: photo viewer (`86e6d4c`)
- New `RoomPhotosView`, `SensorPhoto` (display-only 90° rotation); editor points at saved photo copies.

### iOS: calibrated reference photos (`929cda3`)
- New `RoomEvidenceRecorder`, `PhotoCandidatePolicy`, `ImageIOPhotoEncoder`, `RoomPhotoEvidence`, `ScanCaptureResult`;
  opt-in toggle on Home; photos saved with the room.

### iOS: saved rooms (`5e8141c`)
- New actor `RoomArchiveStore` (`saveCapture`, `saveEdits`, `load`, `list`), `SavedRoomRecord`, `RawCapture`,
  `RoomArchive`, `SavedRoomsView`; raw scan frozen once via `RoomPlanFileExport.encode`.

### iOS: raw RoomPlan export (`c77f6e0`)
- New `RoomPlanFileExport`; Share RoomPlan JSON on the details screen.

### iOS: test target (`04ab9af`)
- `RoomFlowTests` target (Swift Testing) with a smoke test.

### iOS: top-down plan with camera colors (`63b4f6a`)
- New `RoomEditorView`, `RoomEditorState`, `FloorPlanGeometry`, `FloorPlanTransform`, `RoomColorSampler`,
  `ColorFrame`, `ColorMath`, `PlanPalette`; `EstimatedColor` on walls/objects/floor.

### iOS: RoomModel details screen (`a3b3520`), RoomModel + converter (`e65310a`), app + scanning (`2e3e615`)
- `RoomModel`, `RoomObject`, `RoomNormalizer`, `RoomPlanConverter`, `SampleRoom`, `ScanSummaryView`,
  `RoomScanService`, `RoomScanView`, `HomeView`, `Theme`; Xcode project with synchronized folders.

### Web (Yash): merged PRs #1–#8 and the designer home studio
- Scaffold, CI, coordinate conventions and schemas, RoomPlan import adapter, design store with undo/revisions,
  dollhouse scene with openings/cutaway, select/drag/rotate/remove/keep/lock, catalog with honest subtotal,
  themes as coordinated proposals, shop data, room studio layout. Details: git history and `.claude/plans/`.
