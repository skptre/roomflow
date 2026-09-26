# Changelog

Newest first. Append an entry after every code change (what changed, why, where); never edit older entries.
Format: `### YYYY-MM-DD — area: summary`, then bullets naming files and new/changed functions.

## 2026-09-26

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
