# Architecture

Every file and what it's for. iOS entries list the key types and functions so they can be found without searching.
Web entries (owned by Yash) are indexed at file/folder level. Update this file whenever a file is added, removed,
or changes purpose, or a public type/function is added (see `.claude/documentation.md`).

## Repository

| Path | Purpose |
| --- | --- |
| `CLAUDE.md` | Engineering rules for every agent; includes the documentation rules |
| `AGENTS.md` | Codex entry point; defers to `CLAUDE.md` and `spec.md` |
| `spec.md` | Product specification |
| `.claude/documentation.md`, `.claude/index.md` | When to update which document; read `docs/INDEX.md` first |
| `.claude/plans/` | Web implementation plans |
| `.claude/settings.json` | Shared Claude Code settings |
| `.github/` | PR template, web CI workflow |
| `docs/` | Project records, contracts, UX notes, screenshots |
| `ios/` | Native iOS capture app (Swift/SwiftUI, RoomPlan) |
| `web/` | Browser workspace (Vite, React, TypeScript, React Three Fiber) |
| `local-data/` | Git-ignored; real scans kept on this machine only |

## iOS (`ios/`)

Xcode 27 project `ios/RoomFlow.xcodeproj` with synchronized folders: any file under `RoomFlow/` or
`RoomFlowTests/` joins its target automatically. iOS 17+, Swift 5 mode, main-actor default isolation
(pure data/math types are marked `nonisolated`). Shared scheme has Metal API Validation off (see DECISIONS).

### Commands

```
xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test
xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

The Simulator can't run RoomPlan (no LiDAR). Load rooms there via Home › Debug rooms (sample room, or JSON
copied into the app's Documents folder).

### App flow

Home → Scan (RoomPlan) → scan frozen as raw bytes + converted to RoomModel + colors/photos/regions → saved
(`RoomArchiveStore`) → plan (`RoomEditorView`) → details (`ScanSummaryView`): Share RoomPlan JSON · Review room ·
Room package · Editable Room JSON. Saved Rooms reopens any saved room.

`ios/RoomFlow/RoomFlowApp.swift` — `@main` app; opens `HomeView`.

### Models (`ios/RoomFlow/Models/`)

| File | Purpose | Key types / functions |
| --- | --- | --- |
| `RoomModel.swift` | Native editable room in RoomFlow's frame (longest wall on +X, corner at origin, floor y=0) | `RoomModel` (`jsonData()`, `jsonEncoder/Decoder`), `RoomDimensions`, `Vector3`, `FloorPoint`, `Wall`, `WallOpening`, `EstimatedColor` (`hex`, `sampleCount`; 0 = illustrative), `CaptureAlignment` |
| `RoomObject.swift` | Furniture/fixture in the room frame | `RoomObject` (`isMovable(category:)`, `fixtureCategories`), `ObjectDimensions` |
| `SampleRoom.swift` | DEBUG-only synthetic 4.2×3.8 m room with illustrative colors | `SampleRoom.make()` |
| `SavedRoomRecord.swift` | Saved-room list entry and loaded archive | `SavedRoomRecord` (`EvidenceStatus`), `RawCapture` (frozen bytes), `RoomArchive` (raw, editable, photos, appearance, selection) |
| `ScanCaptureResult.swift` | Everything one finished scan produced | `ScanCaptureResult` (room, colors, photos) |
| `RoomPhotoEvidence.swift` | Reference photo + calibration (sensor-native pixels) | `RoomPhotoEvidence` (`fileName`, `columnMajor(_:)`, `focusObjectId` — local-only, not in package manifest) |
| `RoomAppearanceEvidence.swift` | Approximate colors and photo regions per capture (`appearance.json`) | `RoomAppearanceEvidence`, `SourceColor`, `RoomPhotoAssociation` |
| `RoomEvidenceSelection.swift` | User's sharing choices and labels (`selection.json`) | `RoomEvidenceSelection` (`initial(for:)`, `sharedPhotos(from:)`, `setIncludePhotos`, `setPhoto(_:included:)`, `setLabel(_:for:)`, `label(for:)`), `ObjectAnnotation` |
| `RoomPackageManifest.swift` | `manifest.json` of the package, with validation | `RoomPackageManifest` (`FileEntry`, `PhotoEntry`, `ValidationError`, `isAllowed(_:)`, `validate()`), `PackageAppearance` |

### Services (`ios/RoomFlow/Services/`)

| File | Purpose | Key types / functions |
| --- | --- | --- |
| `RoomScanService.swift` | Owns RoomCaptureView/session; permission, state machine, 250 ms loop: focus hints every tick, colors + ambient photos every third | `RoomScanService` (`State`, `Failure`, `isSupported`, `capturePhotos`, `start()`, `finish()`, `cancel()`, `capturedRoom`, `colorEstimates`, `photos`, `focusHint`) |
| `LiveRoomObserver.swift` | Live-object feed: forwards every session callback to the previous delegate, keeps the newest detected objects; debug-only logging | `LiveRoomObserver` (`install(on:)`, `latestObjects()`, `logFinalOverlap(with:)`) |
| `RoomPlanFileExport.swift` | Raw export: exactly `JSONEncoder().encode(CapturedRoom)` | `encode(_:) -> RawCapture`, `export(_:directory:)`, `write(data:roomID:directory:)`, `fileName(roomID:)` |
| `RoomArchiveStore.swift` | Saved rooms in Application Support; staging + rename publish | actor `RoomArchiveStore` (`shared`, `saveCapture(id:rawData:editableData:photos:appearance:…)`, `saveEdits`, `saveSelection`, `load(id:)`, `list()`, `ArchiveError`) |
| `RoomPlanConverter.swift` | Only reader of `CapturedRoom` into RoomModel | `RoomPlanConverter.convert(_:colors:capturedAt:)` |
| `RoomNormalizer.swift` | Pure frame math: align to longest wall, floor to 0, stable IDs | `CaptureElement`, `RoomNormalizer.makeRoom(from:floorColor:id:capturedAt:)`, `yaw(of:)` |
| `RoomColorSampler.swift` | Keeps small frames during scan; median color per wall/object/floor | `RoomColorEstimates`, `RoomColorSampler` (`capture(_:)`, `estimate(for:)`, `reset()`), `ColorFrame.init?(frame:width:)` |
| `ColorFrame.swift` | ARKit-free projection + color math (testable on Mac) | `ColorFrame.color(at:depthTolerance:)`, `ColorMath.median(_:)`, `clampRGB` |
| `RoomEvidenceRecorder.swift` | Bounded calibrated photo capture per scan session, plus deliberate per-object focused shots | `PhotoFrameSnapshot`, `PhotoCandidatePolicy` (`isNewView`, `thin(_:)`, `selectFinal` — final pick covers each object first, then spreads ambient photos, then trims by bytes), `PhotoEncoding`, `ImageIOPhotoEncoder`, `RoomEvidenceRecorder` (`start`, `consider(frame:sessionID:)`, `consider(snapshot:…)`, `captureFocused(snapshot:objectId:sessionID:makeImage:)`, `captureFocused(frame:objectId:sessionID:)`, `snapshot(of:)`, `finish`, `cancel`, `removeTemporaryFiles`, `waitUntilIdle`) |
| `RoomEvidenceProjector.swift` | Projects object boxes into photos (candidate regions) | `ProjectableObject`, `NormalizedRect`, `RoomEvidenceProjector` (`projectedBounds(…)`, `associate(objects:photos:)`, `associate(room:photos:)`, `appearance(room:colors:photos:)`) |
| `RoomPackageExport.swift` | Builds `<capture-id>.roomflow.zip` from allowlisted files | `RoomPackageArchiver`, `CoordinatorZipArchiver`, `RoomPackageExport` (`export(archive:selection:destination:archiver:)`, `Result`, `maxPhotos`, `maxPhotoBytes`) |
| `FloorPlanGeometry.swift` | Pure plan math: fit-to-view, footprints, hit test, wall outline | `FloorPlanTransform` (`toView`, `toRoom`), `FloorPlanGeometry` (`axes`, `footprint(of:)`, `contains`, `object(at:in:margin:)`, `outline(of:)`) |
| `RoomEditorState.swift` | Editable room copy + selection (no move/rotate/delete yet) | `RoomEditorState` (`room`, `originalRoom`, `selectedObjectID`, `select(at:margin:)`) |
| `ObjectFocusTracker.swift` | Pure: decides when a detected object is well framed and unoccluded, the phone steady, and a new-angle photo due | `LiveObject`, `FocusShotPolicy`, `FocusHint`, `FocusDecision`, `ObjectFocusTracker` (`update(objects:camera:depthAt:)`, `recordShot(objectId:cameraToWorld:objectCenter:)`, `shots(for:)`, `reset()`) |

### Views (`ios/RoomFlow/Views/`)

| File | Purpose |
| --- | --- |
| `HomeView.swift` | Entry screen; photo opt-in toggle; freezes raw bytes, converts, saves, opens plan; DEBUG room menu |
| `RoomScanView.swift` | Full-screen RoomPlan UI with Cancel / Done / failure states |
| `RoomEditorView.swift` | Top-down Canvas plan (floor, grid, furniture, walls, openings), tap select, selection card |
| `ScanSummaryView.swift` | Details and exports: Review room, reference photos, Share RoomPlan JSON, Room package, editable JSON |
| `SavedRoomsView.swift` | Lists and reopens saved rooms |
| `RoomPhotosView.swift` | Photo grid/full view; `SensorPhoto` (display-only rotation), `PhotoRegion` overlay |
| `RoomEvidenceReviewView.swift` | Review room: user labels, photo include/exclude, persisted selection |
| `Theme.swift` | `Color.rfBackground/…`, `Color(hex:)`, `RFButtonStyle`, `PlanPalette` |

### Tests (`ios/RoomFlowTests/`, Swift Testing)

| File | Covers |
| --- | --- |
| `RoomFlowTests.swift` | Smoke: sample room builds without LiDAR |
| `RoomPlanFileExportTests.swift` | File name, exact bytes, replace-only-own-file, bad directory |
| `RoomArchiveStoreTests.swift` | Original bytes survive edits, no overwrite by a different scan, failed write keeps revision, photos + appearance saved, staging leftovers ignored |
| `RoomEvidenceRecorderTests.swift` | Limits, busy drop, cancel/late completion, stale session, encode failure, tracking interruption, new-view policy |
| `RoomEvidenceProjectorTests.swift` | Center, rotation, non-square, behind camera, near plane, clipping, outside, non-finite, orientation independence, associations |
| `RoomEvidenceSelectionTests.swift` | Exclusion, geometry-only, label beside geometry, reload |
| `RoomPackageExportTests.swift` | Byte-identical raw, selection controls photos, geometry-only, hashes vs. independent unzip (`ZipReader`), invalid paths, archive failure, fresh package |

## Web (`web/`, owned by Yash)

| Path | Purpose |
| --- | --- |
| `web/src/main.tsx`, `App.tsx`, `index.css` | App entry, root component, design tokens |
| `web/src/import/roomplan.ts` | Imports raw RoomPlan JSON (contract: `docs/contracts/room-import.md`) |
| `web/src/domain/` | Pure logic: schema, units, geometry, layout, money, purchases, catalog, commands, design store, themes, labels, mounting |
| `web/src/scene/` | React Three Fiber scene: architecture, furniture, camera, lighting, cutaway, gestures |
| `web/src/ui/` | Interface components |
| `web/src/fixtures/` | Sample catalog, assemblies, synthetic RoomPlan fixture |
| `web/scripts/` | Fixture and test-GLB generators |

Commands: see `web/README.md` (`npm ci`, `npm run dev`, `typecheck`, `lint`, `test`, `build`).

## Docs (`docs/`)

| File | Purpose |
| --- | --- |
| `INDEX.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `DECISIONS.md` | Project records (this system) |
| `contracts/room-import.md` | Web-owned raw RoomPlan import contract |
| `room-json.md` | iOS native editable RoomModel JSON (not the web import file) |
| `ios-room-package.md` | Proposed `.roomflow.zip` package contract |
| `ios-room-evidence-verification.md` | What's verified on device/simulator and what's open |
| `ux/designer.md` | Web designer UX notes |
| `screenshots/` | Web PR screenshots |
