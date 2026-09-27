# Changelog

Newest first. Append an entry after every code change (what changed, why, where); never edit older entries.
Format: `### YYYY-MM-DD — area: summary`, then bullets naming files and new/changed functions.

## 2026-09-27

### Web: built-in closets as closet doors; wall art from the package
- Agreed contract change (user, on Yash's behalf: "Closet doors in the wall; add wall art to the package and show it
  on the web walls — Yash accepts."): `docs/contracts/room-import.md` gains the closet rule and wall art.
- `web/src/import/roomplan.ts`: a `storage` with depth < 0.10 m and height ≥ 1.2 m becomes a `closet` (name 'Closet',
  `lockPlacement: true`, depth 0.04 m visual, flush on the inside face of its wall, facing in); doors on that wall with
  ≥ 50 % of their width inside the closet are dropped from `openings`, so the wall stays solid; warning "Built-in closet
  shown as closet doors." New private helpers `isBuiltInCloset`, `closetOnWall`, `isClosetDoor`. Zero-depth closet fronts
  are no longer skipped as "no size".
- `web/src/domain/categories.ts`: new `closet` category (assembly `closet-front`, mount `wall`, `mountHeight` 0,
  `builtIn`); new `CategoryInfo.builtIn`, new `isWallMounted(object)`. `web/src/ui/CatalogPanel.tsx` hides built-in
  categories from the category filter.
- `web/src/domain/layout.ts`: `inwardNormal` is now exported and takes `Pick<Room, 'floorPolygon'>` (the importer reuses it).
- `web/src/fixtures/assemblies/decor.ts`: new `closetFront` assembly (frame, two doors with inset panels, brass
  handles, dark reveal), registered in `index.ts`.
- `web/src/scene/RoomScene.tsx`: anything wall-mounted (`isWallMounted`, any height) hides with its cut-away wall;
  `isWallHung` (drag/rotate rules) is unchanged. Floor mirrors leaning on a cut wall now hide too.
- `web/src/import/roomflowPackage.ts`: optional `wallArt.json` + `art/<uuid>.jpg` (checksummed); items validated per
  `.superpowers/sdd/wall-art-package/format.md` and added as locked `wall-art` objects (`wallArtObject`, `readWallArt`);
  malformed file or items → warning, import continues. `PackageEvidence.artPhotos` (new).
- `web/src/ui/evidenceStore.ts`: `artPhotoFor(objectId)`. New `web/src/scene/ArtPhoto.tsx` (`ArtPhoto`): the art's
  photo on its front face, drawn by `FurnitureObject.tsx`; texture and object URL released on change/unmount.
- Tests: `roomplan.test.ts` (+5 closet tests), `roomflowPackage.test.ts` (+6 wall-art tests; package builder gains
  `wallArt`/`withArtPhoto`).
- Why: the real scan (5FB2703A…) drew a built-in closet as a zero-depth dresser slab in a framed door opening that
  stood alone in the cutaway; the phone now measures wall art and the web had nowhere to show it.

## 2026-09-26

### Web: imported floor uses the color the phone measured
- `web/src/import/roomflowPackage.ts`: `parseRoomflowPackage` sets `finishes.floor` from the package's `floorColor`
  when it has at least `MIN_FLOOR_SAMPLES` (new, 3) camera samples, with `floorTexture: 'plain'`.
- `web/src/domain/schema.ts`: `Finishes.floorTexture` (optional `'woodgrain' | 'plain'`; absent = wood, as before).
- `web/src/scene/Architecture.tsx`: a plain floor renders matte without the wood-grain texture. Choosing a look still
  replaces all finishes (wood again); undo restores the scanned floor.
- Why: the phone sampled the floor color but the web ignored it and always drew light wood.

### Web: match scanned furniture automatically from the package's photos
- After a `.roomflow.zip` opens, `App.tsx` (`offerAutoMatch`) offers to match every scanned item that has a usable phone
  photo and no appearance yet (≤12). `AutoMatchDialog.tsx` shows the exact crops, one consent for all, progress, and
  applies every match as one undoable change. Nothing is sent before consent.
- New `web/src/recognition/autoMatch.ts`: `planAutoMatch`, `paddedCrop`, `uprightQuarterTurns`, `runAutoMatch`,
  `sendToRecognizer`, `abortableSleep`, `reconcileMatches`, constants `AUTO_MATCH_MAX_ITEMS`, `MIN_REGION_AREA`,
  `RATE_LIMIT_WAIT_MS`; tests in `autoMatch.test.ts` (14).
- New `web/src/recognition/cropPhoto.ts`: `cropPhotoRegion`, `prepareAutoMatch`. Styles `.auto-match-*` in `index.css`.
- Also committed on this branch: a byte-identical snapshot of Codex's uncommitted Gemini work (`codex/gemini-appearance`).
- Why: the manual dialog only took an uploaded file and ignored the photos the phone already took of each item.

### Web: RoomFlow package import, RoomPlan floor outlines, visible import warnings
- New `web/src/import/zip.ts`: `readZip(bytes, limits)`, `crc32(data)`, `ZipError`, `DEFAULT_ZIP_LIMITS` — dependency-free
  reader (stored/deflate via `DecompressionStream`), rejecting unsafe/duplicate names, encryption, ZIP64, CRC or size mismatch.
- New `web/src/import/roomflowPackage.ts`: `parseRoomflowPackage(bytes, options)`, `isZipArchive(bytes)`, `MAX_PACKAGE_BYTES`,
  types `PackageEvidence`, `PackagePhoto`, `PhotoRegion`, `PackageImportResult`. Verifies manifest v1, allowed paths, exact
  inventory, SHA-256; imports `capture.roomplan.json` with `parseRoomPlanJson`; user names become object `name` (category kept).
- `web/src/import/roomplan.ts`: new `outlineFromFloors` (reads `floors[].polygonCorners`) and `alignedBoundsOutline` (replaces the
  world-axis `boundsOutline`); outline order is wall loop → RoomPlan floor → wall-aligned rectangle.
- New `web/src/ui/evidenceStore.ts`: `evidenceStore` (`set(roomId, evidence)`, `regionsFor(objectId)`), in memory only.
- `web/src/App.tsx`: `open(result)`, new `announceImport(result)`; `importFile` detects zips by signature.
  `web/src/ui/StartScreen.tsx` accepts `.zip`. Test helper `web/src/test/zipWriter.ts` (`makeZip`).
- Why: an open-ended real room imported as a ~136 m² tilted diamond instead of its 45 m² floor, warnings weren't shown, and
  phone evidence (photos, regions, names, colors) had no way into the web app. Contracts updated with Yash's agreement.

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
