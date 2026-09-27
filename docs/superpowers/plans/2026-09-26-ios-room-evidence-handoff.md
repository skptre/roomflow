# iPhone Room Evidence and Designer Handoff Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. This document is a plan, not authorization to implement the web/backend work described as dependencies.

**Goal:** Let someone save a measured room on their iPhone, review optional visual evidence, and share a reliable package that enables Designer to reconstruct the room and recognize its existing furniture.

**Architecture:** Preserve the original RoomPlan export and keep editable state, photos, approximate colors, and user corrections separate. Capture a bounded set of calibrated reference images during the same AR session; save them locally and export selected evidence with a versioned manifest. Gemini recognition and shopping remain server/web responsibilities.

**Tech Stack:** Existing Swift 5 / iOS 17 target, SwiftUI, RoomPlan, ARKit, Foundation, ImageIO/Core Image for image encoding, CryptoKit for checksums, Swift Testing. No new cloud SDK or credentials in the app.

**Spec:** `spec.md`, especially sections 5 (capture/import), photo discoveries, evidence/provenance, and persistence; `CLAUDE.md`; user-approved scan-to-Designer architecture from this conversation. This plan extends the implemented raw export without executing the broader `2026-09-26-ios-mvp-integration.md` backlog.

## Scope and current baseline

Starting point: `keshav-ios` at `c77f6e0`, including test-target commit `04ab9af`.

Already implemented:
- Final processed RoomPlan capture, local floor-plan conversion, camera-sampled approximate colors.
- Raw `.roomplan.json` sharing through `RoomPlanFileExport` and retry UI.
- Separate editable RoomFlow JSON, with a different coordinate frame/schema.
- File writer tests. Actual phone-to-browser transfer remains unverified.

Missing:
- Durable saved rooms; HomeView's Saved Room button is disabled.
- Exportable reference images. Existing `ColorFrame` images are only 160 pixels wide and are discarded after color estimation.
- A documented, versioned evidence package and review of shared photos.
- Tested association between images and final RoomPlan object identifiers.

The phone supplies geometry and visual evidence. It does not need Gemini to convert coordinates, search Amazon/IKEA, scrape product pages, or generate product models. Trying real products in the browser requires no additional iOS shopping UI. Recognition results must never silently change captured measurements.

## Global constraints

- Preserve the existing iOS 17 deployment target and Swift 5 setting.
- “Keep the original capture separate from later design edits.”
- “Missing visual detail does not destroy the measured capture or block room inspection.”
- “A single ordinary photo does not establish absolute size.”
- “Keep credentials and provider calls on the server.”
- Raw export stays exactly default `JSONEncoder().encode(CapturedRoom)`; freeze its bytes once and never normalize or wrap them.
- Native capture coordinates and edited RoomModel coordinates remain explicitly distinct. No web-coordinate conversion on iOS.
- No photos, real scans, signing assets, or private capture manifests in Git or diagnostics.
- Preserve the unrelated local `RoomColorSampler.swift` sampling tweak; it is outside this plan.
- Proposed v1 limits below are implementation choices, not existing guarantees. Measure them on a supported physical phone before release.

## User workflow

1. Scan the room. Explain that optional reference photos help recreate furniture appearance; allow geometry-only capture.
2. Finish processing and save the measured room first.
3. Open a review showing the detected furniture and selected photos. Change a label, exclude a photo, or turn off all photo sharing.
4. Share the existing **RoomPlan JSON** for today's browser, or **Room package** for an evidence-aware consumer once that consumer supports the contract.
5. Return to Saved Rooms later without rescanning. Failed sharing never deletes the saved room.

Use Dynamic Type, VoiceOver labels, minimum 44-point action targets, non-color-only statuses, and headings without terminal periods. Do not claim the scan found every piece of furniture or that a projected image region identifies an exact product.

## Proposed export contract v1

Document in `docs/ios-room-package.md`. This is a proposed shared interface: obtain consumer agreement before freezing it. The existing browser accepts raw JSON only; it must not be described as accepting this package yet.

Export one `<capture-id>.roomflow.zip` containing:

| Path | Meaning |
| --- | --- |
| `manifest.json` | Schema/version, capture identity, file inventory and evidence metadata |
| `capture.roomplan.json` | Frozen original RoomPlan bytes, required |
| `editable.roomflow.json` | Current edited native RoomModel, optional and never substituted for raw geometry |
| `appearance.json` | Approximate sampled colors and user annotations, optional |
| `photos/<photo-id>.jpg` | Only photos selected for sharing, optional |

Manifest fields:
- `schemaVersion: 1`, `packageId: UUID`, `captureId: UUID`, `capturedAt` as ISO-8601 UTC, `units: "meters"`, `coordinateSpace: "roomplan-native-v1"`.
- `files`: relative path, media type, byte count, SHA-256. Permit only the documented paths; reject duplicate names, traversal, symlinks, missing files, and nonfinite metadata before export.
- `photos`: photo UUID, file path, capture-session UUID, AR-frame timestamp in seconds, pixel width/height, camera-to-world 4×4 transform as 16 column-major numbers, intrinsics as 9 column-major numbers, and `pixelOrientation: "sensor-native"`.
- Photo intrinsics MUST describe the exported pixels. No silent rotation, mirroring, cropping, or resizing without the corresponding calibration transform. Strip location/EXIF metadata; keep required calibration in the manifest.
- `associations`: final RoomPlan source UUID, photo UUID, normalized top-left image rectangle `[x,y,width,height]`, and `method: "projected-bounds"`. This is a candidate region, not confirmed segmentation, identity, or visibility.
- `appearance.json`: version, capture ID, optional sampled colors keyed by source UUID, optional floor color, user labels/category overrides keyed by source UUID. Include provenance (`camera-estimate` / `user-supplied`); never overwrite the original category or measurements.
- User corrections identify the source object, not an array index. A user-added item without RoomPlan geometry has no fabricated source UUID or measured dimensions.

Start with at most 12 reference JPEGs, maximum long edge 1280 pixels, quality 0.8, and 20 MiB combined image bytes. These are configurable v1 defaults. Do not export raw video or depth in v1. If evidence exceeds limits, reduce/drop images and explain it; never lose the raw scan.

## Review focus

1. Late callbacks after cancellation or a new scan must not attach old images to the new room — Task 2 lifecycle tests.
2. Portrait display versus sensor-native pixels must not rotate object associations — Task 3 projection tests and Task 6 physical checks.
3. Poor coverage, occlusion, mirrors, or tracking changes must yield uncertain/missing associations, not confident wrong labels — Tasks 2/3 and physical checks.
4. App termination or low disk space must preserve the last complete saved capture — Task 1 atomic-save tests.
5. A removed photo must not leak through an old export or cached share URL — Tasks 4/5 exclusion and regeneration tests.

## Task 1: Persist the original scan and edited state separately

**Files:** Create `ios/RoomFlow/Models/SavedRoomRecord.swift`, `ios/RoomFlow/Services/RoomArchiveStore.swift`, `ios/RoomFlow/Views/SavedRoomsView.swift`, `ios/RoomFlowTests/RoomArchiveStoreTests.swift`; modify `HomeView.swift`, `RoomEditorView.swift`, `ScanSummaryView.swift` under `ios/RoomFlow/Views/`.

**Interfaces:** `SavedRoomRecord` holds stable capture ID, name, capturedAt, edited revision and evidence status. `RoomArchiveStore` is an actor initialized with a root URL; expose `saveCapture(id: UUID, rawData: Data, editableData: Data) async throws`, `saveEdits(id: UUID, editableData: Data) async throws`, `load(id: UUID) async throws -> RoomArchive`, and `list() async throws -> [SavedRoomRecord]`. `RoomArchive` contains frozen raw bytes and current editable bytes; Task 2 adds evidence references.

- [ ] Add tests `originalBytesSurviveEditsAndReload`, `failedWritePreservesPreviousRevision`, and `incompleteStagingDirectoryIsNotListed`. Use synthetic bytes/temp directories; expect exact original byte equality after reopening and no partial records after injected write failure.
- [ ] Run `RoomArchiveStoreTests` before implementation and confirm the new tests fail.
- [ ] Implement local storage in Application Support with UUID-scoped directories, file protection, and atomic revision publication. Never overwrite the original scan during editor save. A disk failure keeps the in-memory scan available for retry/export.
- [ ] Save the processed result before opening the editor; enable Saved Rooms and reopen both raw evidence and current editable state. Save committed editor changes through the store with visible retry on failure.
- [ ] Run the focused tests and simulator launch/reopen flow; commit as `feat(ios): save captured rooms locally`.

## Task 2: Capture bounded reference photos in the scan session

**Files:** Create `Models/RoomPhotoEvidence.swift`, `Services/RoomEvidenceRecorder.swift`, `Models/ScanCaptureResult.swift` under `ios/RoomFlow/`; create `ios/RoomFlowTests/RoomEvidenceRecorderTests.swift`; modify `Services/RoomScanService.swift`, `Views/RoomScanView.swift`, `Views/HomeView.swift`, and the archive store.

**Interfaces:** `RoomPhotoEvidence` contains the photo metadata from the manifest plus a local file URL. `ScanCaptureResult` carries CapturedRoom, color estimates, and `[RoomPhotoEvidence]`. `RoomEvidenceRecorder.start(sessionID: UUID)`, `consider(frame: ARFrame, sessionID: UUID)`, `finish(sessionID: UUID) async throws -> [RoomPhotoEvidence]`, and `cancel(sessionID: UUID)` own the recorder lifecycle. Inject a pure candidate-selection policy and file writer for tests.

- [ ] Test `limitsCandidateCountAndBytes`, `dropsFramesWhileEncodingBusy`, `cancelRejectsLateCompletion`, `newSessionRejectsOldFrames`, and `imageFailureDoesNotFailGeometry` with deterministic timestamps/transforms and fake encoder failures.
- [ ] Confirm failing tests, then implement a bounded recorder. Consider frames no more often than every 750 ms; retain a candidate only after normal tracking and at least 0.25 m translation or 15° rotation since the last retained view. Keep at most 24 temporary candidates and select at most 12 final images spread across scan time. Bounds are tuning defaults, not a coverage guarantee.
- [ ] Encode off the main thread with at most one encode in flight. Copy only needed pixel data; do not retain ARFrame objects indefinitely. Own temporary files by scan-session UUID and reject callbacks from canceled sessions. Do not replace RoomCaptureView's AR session delegate.
- [ ] Preserve sensor pixel orientation and correctly scale intrinsics for resize. Treat tracking interruption/relocalization as a loss of association confidence; discard automatic associations unless frame alignment is validated. Geometry-only completion remains available on any evidence failure.
- [ ] Replace the two-argument scan completion callback with `ScanCaptureResult`, attach saved evidence to the archive, and expose an opt-in capture toggle. Finish and failure paths must stop sampling. Cancellation removes only that unfinished session's temporary evidence.
- [ ] Run focused tests, full suite, and a physical-phone scan performance check; commit as `feat(ios): retain calibrated room photos`.

## Task 3: Associate photos with final captured objects

**Files:** Create `ios/RoomFlow/Services/RoomEvidenceProjector.swift`, `ios/RoomFlow/Models/RoomAppearanceEvidence.swift`, `ios/RoomFlowTests/RoomEvidenceProjectorTests.swift`; extend the archive store and scan completion pipeline.

**Interfaces:** `RoomEvidenceProjector.associate(room: CapturedRoom, photos: [RoomPhotoEvidence]) -> [RoomPhotoAssociation]`. A pure projection helper consumes an oriented object box, camera-to-world matrix, intrinsics and pixel dimensions; returns an optional normalized image rectangle. `RoomPhotoAssociation` uses final source UUIDs and the manifest fields above.

- [ ] Add known-matrix tests for image center, rotated boxes, non-square images, behind-camera geometry, partial clipping, nonfinite input, and source-ID preservation. Assert identical results regardless of device UI orientation.
- [ ] Confirm failure; implement using final processed room transforms and inverse camera pose. Reject boxes crossing the camera near plane in v1; clip valid projected bounds to image edges and reject zero-area bounds. Do not infer unseen furniture surfaces or visibility from a rectangle.
- [ ] Preserve multiple candidate photos per object. Emit no association when coordinate continuity is uncertain. Copy sampled colors with explicit approximate provenance; never change original geometry/category.
- [ ] Run focused tests and inspect overlays on real captured photos before treating the frame relationship as verified; commit as `feat(ios): map photos to captured objects`.

## Task 4: Review room evidence before sharing

**Files:** Create `ios/RoomFlow/Views/RoomEvidenceReviewView.swift`, `ios/RoomFlow/Models/RoomEvidenceSelection.swift`, `ios/RoomFlowTests/RoomEvidenceSelectionTests.swift`; modify `Views/ScanSummaryView.swift` and archive persistence.

**Interfaces:** `RoomEvidenceSelection` holds selected photo UUIDs and user annotations keyed by source UUID. Persist with a selection revision. Package creation consumes this selection, never the recorder's entire directory.

- [ ] Test `excludedPhotoIsAbsentFromSelection`, `geometryOnlySelectionHasNoPhotos`, `labelCorrectionPreservesSourceGeometry`, and `selectionSurvivesReload`.
- [ ] Confirm failure, then implement the selection model and persist explicit changes.
- [ ] Build **Review room** with detected-object labels, approximate-color markers, candidate reference images and photo exclusion controls. Explain that some items may be missing. A label correction stays separate from RoomPlan's original category. Do not create dimensions for unidentified items.
- [ ] Add **Include reference photos** and a visible shared-photo count. Keep geometry-only sharing available. Changing selection invalidates any previous package URL.
- [ ] Run focused tests and manually verify VoiceOver order, large text, empty evidence and no-color-only states; commit as `feat(ios): review shared room evidence`.

## Task 5: Build and share the versioned evidence package

**Files:** Create `ios/RoomFlow/Models/RoomPackageManifest.swift`, `ios/RoomFlow/Services/RoomPackageExport.swift`, `ios/RoomFlowTests/RoomPackageExportTests.swift`, `docs/ios-room-package.md`; modify `Views/ScanSummaryView.swift`.

**Interfaces:** `RoomPackageExport.export(archive: RoomArchive, selection: RoomEvidenceSelection, destination: URL) async throws -> URL`. Introduce a small `RoomPackageArchiver` protocol with `archive(directory: URL, to: URL) throws`. Use an iOS-compatible ZIP implementation only after a focused compatibility/license check; do not assume Foundation has a general ZIP writer. Isolate any chosen dependency here and commit its resolution file.

- [ ] Agree manifest field names and sensor-coordinate conventions with the consuming team; write the contract and a synthetic, non-private fixture. Consumer implementation is a separate task, not part of this iOS plan.
- [ ] Add tests `rawPayloadIsByteIdentical`, `photoSelectionControlsArchiveEntries`, `geometryOnlyPackageIsValid`, `manifestHashesMatchFiles`, `invalidPathsAreRejected`, `archiveFailureKeepsSavedRoom`, and `changedSelectionCreatesFreshPackage`. Decompress test output with an independent ZIP reader and verify its inventory.
- [ ] Confirm failure; implement manifest validation, explicit allowlisted file assembly in a fresh staging directory, checksums and atomic archive publication. Never recursively export the saved-room directory. Enforce the v1 image count/byte budget.
- [ ] Share the resulting file with a retained URL and retry. Keep **Share RoomPlan JSON** independent of packaging errors. Do not label the new package as browser-compatible until the receiving implementation passes integration tests.
- [ ] Ensure excluded photos and old selection data cannot appear in a regenerated export. Clean temporary packages only after sharing is finished; deleting a saved room removes only that room's local archive and related temporary files.
- [ ] Run focused tests and the full suite; commit as `feat(ios): share versioned room evidence package`.

## Task 6: Verify the phone-to-Designer boundary

**Files:** Create `docs/ios-room-evidence-verification.md`. Record outcomes without embedding private room media.

- [ ] Run simulator tests: `xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test`. Replace the destination only if unavailable; record the actual device/runtime. Focused checks use `-only-testing:RoomFlowTests/<TestStruct>`.
- [ ] Run device compilation: `xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`. Require exit 0 for both commands; simulator checks do not prove LiDAR capture.
- [ ] On a supported physical phone, scan a safe test room in portrait and landscape; finish, reopen after app termination, edit, export original JSON again and compare its hash with the saved original.
- [ ] Inspect projected object bounds on exported images. Check a sofa/table with occlusion, a partially visible object and an object behind the camera. If alignment cannot be verified, ship photos as unassociated references rather than claiming correct automatic matches.
- [ ] Cancel during processing, background the app, simulate save/export failures, and retry. Verify the last successful room remains available and another room's photos never appear.
- [ ] Import the original JSON into the current Designer; check scale, orientation, openings and object placement. Record one independent wall measurement and any discrepancy; do not promise certified fit.
- [ ] Once a package consumer exists, import the package and check IDs, camera transforms, selected photo inventory and optional appearance. Until then, mark package integration explicitly unverified; do not block raw JSON handoff.
- [ ] Verify excluded photos are absent, geometry-only sharing works, and no image/scan payloads are logged. Record physical device, OS, app commit and consuming importer commit.
- [ ] Commit the non-private verification report only after recording actual results.

## Later iOS work, intentionally outside this delivery

- Direct upload / QR pairing: add only after backend authentication, upload limits, retention, endpoint and job-status contracts exist. Use cancellable resumable transfer, idempotent package IDs and retry from saved files; never ship Gemini keys on iOS. File sharing is the initial working path.
- Extra photos after scanning: ordinary camera photos must be explicitly marked uncalibrated and user-associated. Do not pretend they share the old AR world frame. A resumed calibrated scan needs a separate alignment design.
- Photographing a newly discovered furniture item: separate capture flow with optional user-entered measurements and estimated/unknown provenance; it must not fabricate a retailer listing. This is separate from capturing furniture already inside the room.
- Native product shopping, image-to-3D generation, applying web edits back to iOS and exact furniture/brand identification are separate projects.

## Completion criteria

The iPhone can reopen a saved measured room, export the original raw JSON unchanged, and optionally share a bounded, reviewed evidence package with documented camera calibration and source IDs. Evidence failure never blocks geometry export. Automatic associations require physical-device verification; package compatibility requires the separate consumer. No Gemini or retailer integration is claimed by completing this iOS plan.
