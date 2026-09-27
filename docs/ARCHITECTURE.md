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
| `ObjectNames.swift` | Display-friendly names for furniture categories in UI text (stored data keeps the category) | `ObjectNames` (`display(category:)`) |
| `PhotoCoverage.swift` | How many scanned objects (with a `sourceId`) appear in the counted photos, and which are missing, for a footnote summary; presentation only | `PhotoCoverage` (`covered`, `total`, `missing`, `summary`), `make(objects:associations:photoIds:label:)` |
| `SampleRoom.swift` | DEBUG-only synthetic 4.2×3.8 m room with illustrative colors | `SampleRoom.make()` |
| `SavedRoomRecord.swift` | Saved-room list entry and loaded archive | `SavedRoomRecord` (`EvidenceStatus`), `RawCapture` (frozen bytes), `RoomArchive` (raw, editable, photos, appearance, selection, `wallArt`, `wallArtDirectory`) |
| `ScanCaptureResult.swift` | Everything one finished scan produced | `ScanCaptureResult` (room, colors, photos, wallArt, wallArtDirectory; custom `init` defaults `wallArt`/`wallArtDirectory`) |
| `RoomPhotoEvidence.swift` | Reference photo + calibration (sensor-native pixels) | `RoomPhotoEvidence` (`fileName`, `columnMajor(_:)`, `focusObjectId` — local-only, not in package manifest) |
| `RoomAppearanceEvidence.swift` | Approximate colors and photo regions per capture (`appearance.json`) | `RoomAppearanceEvidence`, `SourceColor`, `RoomPhotoAssociation` |
| `RoomEvidenceSelection.swift` | User's sharing choices and labels (`selection.json`) | `RoomEvidenceSelection` (`initial(for:)`, `sharedPhotos(from:)`, `setIncludePhotos`, `setPhoto(_:included:)`, `setLabel(_:for:)`, `label(for:)`), `ObjectAnnotation` |
| `RoomPackageManifest.swift` | `manifest.json` of the package, with validation; `wallArt.json`'s schema | `RoomPackageManifest` (`FileEntry`, `PhotoEntry`, `ValidationError`, `isAllowed(_:)`, `validate()`, `wallArtPath`), `PackageAppearance`, `WallArtPackage` (`Item`) |
| `WallArtItem.swift` | Confirmed piece of wall art attached to a final wall, in that wall's local frame (meters from wall center, +x along wall, +y up), plus optional RoomPlan native world pose for export | `WallArtItem` (`worldCenter`, `worldNormal`) |

### Services (`ios/RoomFlow/Services/`)

| File | Purpose | Key types / functions |
| --- | --- | --- |
| `RoomScanService.swift` | Owns RoomCaptureView/session; permission, state machine, 250 ms loop: focus hints every tick, wall-art detection every other tick, colors + ambient photos every third | `RoomScanService` (`State`, `Failure`, `isSupported`, `capturePhotos`, `start()`, `finish()`, `cancel()`, `capturedRoom`, `colorEstimates`, `photos`, `wallArt`, `wallArtDirectory`, `focusHint`) |
| `LiveRoomObserver.swift` | Live-object feed: forwards every session callback to the previous delegate, keeps the newest detected objects; debug-only logging | `LiveRoomObserver` (`install(on:)`, `latestObjects()`, `latestSurfaces()` (`LiveSurface`), `logFinalOverlap(with:)`) |
| `WallArtDetector.swift` | Pure judge: is one image rectangle plausibly art on a scanned wall? Casts corner rays onto walls, measures the LiDAR-seen plane (may stand off the wall), checks size/floor/opening/TV overlap; reorders corners (and `quad`) into room orientation (world up, viewer's right) so portrait frames measure width/height correctly | `WallArtSighting` (corners/quad in room order), `WallArtRejection`, `WallArtVerdict`, `WallArtDetector.judge(quad:camera:surfaces:objects:depthAt:)` |
| `WallArtTracker.swift` | Groups `WallArtSighting`s by position/normal across a scan, decides which groups are confirmed, and attaches confirmed groups to the final room's walls as `WallArtItem`s (merging overlapping items on the same wall), resolving each item's RoomPlan-native world center/normal | `WallArtTracker` (`add(_:)`, `sightingCount(group:)`, `confirmedCount`, `finalize(walls:)`, `worldPose(of:)`) |
| `WallArtScanner.swift` | Runs `WallArtDetector`/`WallArtTracker` on the scan's camera frames (Vision rectangle detection + LiDAR on a private queue, one frame at a time), keeps an upright straight-on `CIPerspectiveCorrection` crop (from the room-ordered quad) of each candidate's best-scoring sighting in ≤16 slots (fewest-sightings slot evicted for a group seen at least as often), drops results from frames started before a `reset`/`discard`, and writes each confirmed item's crop to disk at `finish` | `DepthMapReader` (`depth(in:u:v:)`, moved out of `RoomScanService`), `WallArtScanner` (`init(encoder:)`, `reset(directory:)`, `discard()`, `process(frame:surfaces:objects:)`, `confirmedCount`, `finish(finalRoom:) async`) |
| `RoomPlanFileExport.swift` | Raw export: exactly `JSONEncoder().encode(CapturedRoom)` | `encode(_:) -> RawCapture`, `export(_:directory:)`, `write(data:roomID:directory:)`, `fileName(roomID:)` |
| `RoomArchiveStore.swift` | Saved rooms in Application Support; staging + rename publish | actor `RoomArchiveStore` (`shared`, `saveCapture(id:rawData:editableData:photos:appearance:wallArt:wallArtDirectory:…)` — copies each item's photo into `art/`, clearing `photoFileName` on a missing source file, and writes `wallArt.json` only when non-empty, `saveEdits`, `saveSelection`, `saveWallArt(id:items:)` (atomic replace), `load(id:)`, `list()`, `ArchiveError`) |
| `RoomPlanConverter.swift` | Only reader of `CapturedRoom` into RoomModel | `RoomPlanConverter.convert(_:colors:capturedAt:)` |
| `RoomNormalizer.swift` | Pure frame math: align to longest wall, floor to 0, stable IDs | `CaptureElement`, `RoomNormalizer.makeRoom(from:floorColor:id:capturedAt:)`, `yaw(of:)` |
| `RoomColorSampler.swift` | Keeps small frames during scan; median color per wall/object/floor | `RoomColorEstimates`, `RoomColorSampler` (`capture(_:)`, `estimate(for:)`, `reset()`), `ColorFrame.init?(frame:width:)` |
| `ColorFrame.swift` | ARKit-free projection + color math (testable on Mac) | `ColorFrame.color(at:depthTolerance:)`, `ColorMath.median(_:)`, `clampRGB` |
| `RoomEvidenceRecorder.swift` | Bounded calibrated photo capture per scan session, plus deliberate per-object focused shots | `PhotoFrameSnapshot`, `PhotoCandidatePolicy` (`isNewView`, `thin(_:)`, `selectFinal` — final pick covers each object first, then spreads ambient photos, then trims by bytes), `PhotoEncoding`, `ImageIOPhotoEncoder`, `RoomEvidenceRecorder` (`start`, `consider(frame:sessionID:)`, `consider(snapshot:…)`, `captureFocused(snapshot:objectId:sessionID:makeImage:)`, `captureFocused(frame:objectId:sessionID:)`, `noteTrackingInterrupted(sessionID:)`, `snapshot(of:)`, `finish`, `cancel`, `removeTemporaryFiles`, `waitUntilIdle`) |
| `RoomEvidenceProjector.swift` | Projects object boxes into photos (candidate regions) | `ProjectableObject`, `NormalizedRect`, `RoomEvidenceProjector` (`projectedBounds(…)`, `associate(objects:photos:)`, `associate(room:photos:)`, `appearance(room:colors:photos:)`) |
| `RoomPackageExport.swift` | Builds `<capture-id>.roomflow.zip` from allowlisted files, including `wallArt.json`/`art/` for wall art still in the room's saved list with a resolved world pose | `RoomPackageArchiver`, `CoordinatorZipArchiver`, `RoomPackageExport` (`export(archive:selection:destination:archiver:)`, `Result`, `maxPhotos`, `maxPhotoBytes`) |
| `FloorPlanGeometry.swift` | Pure plan math: fit-to-view, footprints, hit test, wall outline | `FloorPlanTransform` (`toView`, `toRoom`), `FloorPlanGeometry` (`axes`, `footprint(of:)`, `contains`, `object(at:in:margin:)`, `outline(of:)`) |
| `RoomEditorState.swift` | Editable room copy + selection (no move/rotate/delete yet) | `RoomEditorState` (`room`, `originalRoom`, `selectedObjectID`, `select(at:margin:)`) |
| `ObjectFocusTracker.swift` | Pure: decides when a detected object is well framed and unoccluded, the phone steady, and a new-angle photo due | `LiveObject`, `FocusShotPolicy`, `FocusHint`, `FocusDecision`, `ObjectFocusTracker` (`update(objects:camera:depthAt:)`, `recordShot(objectId:cameraToWorld:objectCenter:)`, `shots(for:)`, `reset()`) |

### Views (`ios/RoomFlow/Views/`)

| File | Purpose |
| --- | --- |
| `HomeView.swift` | Entry screen; photo opt-in toggle; freezes raw bytes, converts, saves (including wall art and its temp crop folder), opens plan; DEBUG room menu |
| `RoomScanView.swift` | Full-screen RoomPlan UI with Cancel / Done / failure states; shows `ScanFocusHintView` when a furniture object is in focus; on completion passes the scanner's `wallArt`/`wallArtDirectory` into `ScanCaptureResult` |
| `ScanFocusHintView.swift` | Small hint capsule under scan controls showing furniture name, photo count/progress ring, and guidance; appears when furniture is framed and photo capture is on. Types/functions: `ScanFocusHintView`, `message(for:)` |
| `RoomEditorView.swift` | Top-down Canvas plan (floor, grid, furniture, walls, openings), tap select, selection card; threads `wallArt`/`wallArtDirectory` through to `ScanSummaryView` |
| `ScanSummaryView.swift` | Details and exports: Review room, "Wall art (N)" row (shown when there is wall art) leading to Review room, reference photos (with a `PhotoCoverage` summary footnote), Share RoomPlan JSON, Room package, editable JSON |
| `SavedRoomsView.swift` | Lists and reopens saved rooms, including their saved wall art |
| `RoomPhotosView.swift` | Photo grid/full view; `SensorPhoto` (display-only rotation), `PhotoRegion` overlay |
| `RoomEvidenceReviewView.swift` | Review room: user labels, photo include/exclude, persisted selection, `PhotoCoverage` summary footnote using shared photos and user labels; a "Wall art (N)" section (a removal made before the saved list loads is kept) (thumbnail, "About W × H cm", "On wall K"/"On a wall", a "Not wall art" button that removes the item and calls `RoomArchiveStore.saveWallArt`) shown whenever the scan could have found wall art (reference photos were on), with an empty-state message when none was found; `init(...wallArt:wallArtDirectory:...)` (both default — most callers have no wall art) |
| `Theme.swift` | `Color.rfBackground/…`, `Color(hex:)`, `RFButtonStyle`, `PlanPalette` |

### Tests (`ios/RoomFlowTests/`, Swift Testing)

| File | Covers |
| --- | --- |
| `RoomFlowTests.swift` | Smoke: sample room builds without LiDAR |
| `ScanFocusHintTests.swift` | Display names (camelCase splitting, special cases) and message text (copy rules for 0/1+ photos, new angle, complete) |
| `ObjectFocusTrackerTests.swift` | Dwell timing, movement rejection, edge-clipping, occlusion, angle diversity/cap, tracking loss, most-centered-object selection, preferring an incomplete object over a complete centered one |
| `RoomPlanFileExportTests.swift` | File name, exact bytes, replace-only-own-file, bad directory |
| `RoomArchiveStoreTests.swift` | Original bytes survive edits, no overwrite by a different scan, failed write keeps revision, photos + appearance saved, staging leftovers ignored; wall art saved with its photo and reloaded, no `wallArt.json` loads `[]`, missing photo clears `photoFileName`, `saveWallArt` replaces the list, unknown room throws |
| `WallArtDetectorTests.swift` | Flush and standoff measurement, uneven/behind/far-in-front depth, off-wall/small/near-floor/TV-shaped rejections, door and detected-TV overlap, spanning walls, portrait (camera rolled ±90°) measures width/height and upper-left corner in room orientation, portrait 16:9 → `likelyTV` |
| `WallArtTrackerTests.swift` | Grouping by position/normal, `sightingCount(group:)`, confirmation needs 3 sightings + camera spread, attach to nearest containing wall, merging overlapping items, dropping groups far from any wall, `WallArtItem` round-trip |
| `RoomEvidenceRecorderTests.swift` | Limits, busy drop, cancel/late completion, stale session, encode failure, tracking interruption (including `noteTrackingInterrupted`), new-view policy, focused shots (bypasses motion gate, busy/stale/lost-tracking refusal), thinning (ambient before focused, busiest-object trim), final selection (per-object coverage first, byte trim), old archives decode without `focusObjectId` |
| `RoomEvidenceProjectorTests.swift` | Center, rotation, non-square, behind camera, near plane, clipping, outside, non-finite, orientation independence, associations |
| `RoomEvidenceSelectionTests.swift` | Exclusion, geometry-only, label beside geometry, reload |
| `RoomPackageExportTests.swift` | Byte-identical raw, selection controls photos, geometry-only, hashes vs. independent unzip (`ZipReader`), invalid paths, archive failure, fresh package |
| `PhotoCoverageTests.swift` | Covered/missing counts, excluded photos don't count, user labels name missing items, objects without a `sourceId` are ignored, one-item and all-covered summaries |

## Web (`web/`, owned by Yash)

| Path | Purpose |
| --- | --- |
| `web/src/main.tsx`, `App.tsx`, `index.css` | App entry, root component, design tokens |
| `web/src/import/roomplan.ts` | Imports raw RoomPlan JSON (contract: `docs/contracts/room-import.md`): `parseRoomPlanJson`; floor outline = wall loop → `outlineFromFloors` → `alignedBoundsOutline`; built-in closets (`isBuiltInCloset`, `closetOnWall`, `isClosetDoor` drops their doors) |
| `web/src/import/roomflowPackage.ts` | Imports `.roomflow.zip` (`parseRoomflowPackage`, `isZipArchive`): manifest + SHA-256 checks, raw scan via `parseRoomPlanJson`, evidence (`PackageEvidence`, `PackagePhoto`, `PhotoRegion`); scanned floor color → `finishes.floor` + `floorTexture: 'plain'` (`MIN_FLOOR_SAMPLES`); optional `wallArt.json` → locked `wall-art` objects (`readWallArt`, `wallArtObject`), photos in `PackageEvidence.artPhotos` |
| `web/src/import/zip.ts` | Dependency-free ZIP reader (`readZip`, `crc32`, `ZipError`, `DEFAULT_ZIP_LIMITS`) |
| `web/src/ui/evidenceStore.ts` | In-memory package evidence beside the loaded room (`evidenceStore.set`, `regionsFor`, `artPhotoFor`) |
| `web/src/test/zipWriter.ts` | Test-only ZIP builder (`makeZip`) with tampering options |
| `web/src/domain/` | Pure logic: schema, units, geometry, layout, money, purchases, catalog, commands, design store, themes, labels, mounting |
| `web/src/scene/` | React Three Fiber scene: architecture, furniture, camera, lighting, cutaway (wall-mounted items hide with their wall: `isWallMounted` + `hostWall`), gestures |
| `web/src/scene/ArtPhoto.tsx` | `ArtPhoto`: a wall-art object's package photo as a textured plane on its front face; disposes texture/object URL |
| `web/src/domain/categories.ts`, `layout.ts` | Categories (`CATEGORIES` incl. built-in `closet`, `isWallHung`, `isWallMounted`); placement (`inwardNormal`, `hostWall`, `wallSpot`, …) |
| `web/src/recognition/` | Gemini photo matching (snapshot of Codex's work): `contract.ts` (`Appearance`, `RecognitionResponse`), `appearance.ts` (`appearanceCommand`), `appearanceAsset.ts`; server side in `web/server/recognition*.ts` |
| `web/src/roomDesigner/contract.ts`, `contract.test.ts` | Strict redacted Gemini room-design boundary: `RoomSummary`, `RoomDesignRequest`, prose-free `RoomDesignIntent`, `RoomDesignResponse` type, `RoomDesignDescription`, catalog-only `ROOM_DESIGN_CATEGORIES`, `roomSummary`, `parseRoomDesignIntent`, `parseRoomDesignResponse`, `describeRoomDesignIntent`; bounded contract regressions |
| `web/src/roomDesigner/proposal.ts`, `proposal.test.ts` | Local design resolver: `RoomDesignProposalInput`, `RoomDesignProposal`, `buildRoomDesignProposal`; seeded layout, catalog-backed add/replace, validated commands, visible skips, derived purchase and budget summary |
| `web/src/recognition/autoMatch.ts` | Auto-match from package photos: `planAutoMatch`, `paddedCrop`, `uprightQuarterTurns`, `runAutoMatch` (sequential, one wait after a 429), `sendToRecognizer`, `abortableSleep`, `reconcileMatches` |
| `web/src/recognition/cropPhoto.ts` | Browser crops for auto-match: `cropPhotoRegion` (padded, upright, ≤1024 px JPEG), `prepareAutoMatch` (status check + plan + crops; sends nothing) |
| `web/src/ui/AutoMatchDialog.tsx` | Post-import offer: exact crops, one consent, progress, applies all matches as one undo step |
| `web/src/ui/` | Interface components |
| `web/src/fixtures/` | Sample catalog and synthetic RoomPlan fixture |
| `web/src/blocks/` | Validated recipe renderer for catalog products, captured furniture, wall art, mirrors, and closet fronts |
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

### Photo recognition and discoveries

| Path | Purpose / public API |
| --- | --- |
| `web/src/recognition/contract.ts` | Validated appearance and recognition request/response contracts |
| `web/src/recognition/appearance.ts`, `appearanceAsset.ts` | `appearanceCommand`, `appearanceAsset`: safe authored visual templates |
| `web/src/recognition/discovery.ts` | `DiscoveryDetails`, `discoveryPrice`, `discoveryObject`: supplied facts and deterministic new-item placement |
| `web/src/recognition/*.test.ts` | Appearance/discovery state, money and placement regressions |
| `web/server/` | Bounded Gemini adapter and local-only Vite middleware with boundary tests |
| `web/server/roomDesigner.ts`, `roomDesigner.test.ts` | `POST /api/design-room`: `createRoomDesignerHandler(deps)`, `RoomDesignerDeps` (lazy `ai` provider), fixed `ROOM_DESIGN_SYSTEM_INSTRUCTION`; loopback/same-origin JSON only, 32 KB body, one in flight + 6/min, sends brief + optional budget + validated `RoomSummary` through the shared `AiContext`, re-validates output with `parseRoomDesignResponse`, fixed errors, no logging |
| `web/server/localAccess.ts` | `isLocalPeerRequest` (loopback Host + peer), `isLocalBrowserRequest` (plus same-origin `Origin`); shared by the recognition and room-design routes |
| `web/server/ai.ts` | `openAi` (reads web/.env.local, opens the shared file ledger) and `createAiContext(settings: AiSettings)`, the single paid-call path: egress allowlist, consent + `GEMINI_PAID_PROJECT` attestation for private input classes (`user-photo`, `room-summary`), worst-case reservation, settle |
| `web/src/ui/AppearanceDialog.tsx` | Local image preparation, disclosure, consent and recognition review |
| `web/src/ui/DiscoveryDetails.tsx` | Dimensions/price form, isolated preview and atomic addition |
| `web/src/recognition/appearanceAsset.ts` | Maps an appearance result to a safe default recipe and material slots; never an asserted product match |
| `web/src/domain/schema.ts`, `designStore.ts`, `commands.ts` | Embedded found-item evidence and appearance command in reversible room snapshots |
| `web/.env.example`, `docs/ux/gemini-appearance.md` | Server-only configuration, privacy and verification limits |

### Single-piece capture and import

| Path | Purpose / public API |
| --- | --- |
| `ios/RoomFlow/Models/PieceSelection.swift` | Explicit target identity: `PieceSelection.select`, `allowsPhoto`, `finalID`; missing final identity requires rescan |
| `ios/RoomFlow/Models/ScannedPiece.swift` | Portable single object, `Dimensions`, `Photo`, `ValidationError`, `validate`, `encoded`, `photo(from:)`, `uprightQuarterTurns`; meter dimensions, bounded upright JPEG, no world pose |
| `ios/RoomFlow/Services/PieceArchiveStore.swift` | Atomic local saved exports: `shared`, `defaultRoot`, `init(root:)`, `save`, `url(for:)`, `list`; hashed names prevent traversal |
| `ios/RoomFlow/Services/RoomScanService.swift` | `Mode.piece`, `pieceSelection`, `piecePhotoCount`, `selectFramedPiece`: opt-in target lock and focused-only photo capture |
| `ios/RoomFlow/Services/RoomEvidenceRecorder.swift` | `completedPhotoCount(for:)` distinguishes encoded photos from pending capture attempts |
| `ios/RoomFlow/Views/PieceScanView.swift` | Circular selection, guided views, processing and review of only the selected final object |
| `ios/RoomFlow/Views/PieceReviewView.swift` | `PieceReviewView`, `SavedPiecesView`: measurement correction, photo sharing choice, save and repeatable share |
| `ios/RoomFlow/Views/HomeView.swift`, `RoomScanView.swift` | Native entry points and reused `RoomCaptureViewContainer` |
| `ios/RoomFlowTests/PieceSelectionTests.swift`, `ScannedPieceTests.swift` | Selection, identity loss, photo bounds/provenance, local persistence and transport tests |
| `web/src/import/piece.ts` | `MAX_PIECE_BYTES`, `PiecePackage`, `parsePiece`, `verifyPiecePhotos`, `pieceAsset`, `pieceObject`: validated transport and deterministic placement |
| `web/src/import/piece.test.ts` | Package bounds, invalid data, fresh placement IDs, isolated previews and reversible financial changes |
| `web/src/ui/PieceImportDialog.tsx` | Revision-bound file loading, duplicate notice, local photo review and owned preview lifecycle |
| `docs/piece-package.md`, `docs/plans/scan-piece.md` | New single-piece transport contract and approved implementation scope |
