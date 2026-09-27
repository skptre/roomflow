# Changelog

### 2026-09-27 — web: add the Gemini room designer composer and isolated preview

Added `web/src/ui/RoomDesignerDialog.tsx` (`RoomDesignerDialog`) and `web/src/ui/roomDesignerActions.ts` with `roomDesignerActions.test.ts`. The room panel gains a “Design with Gemini” action (`RoomPanel` prop `onDesign`, wired in `web/src/App.tsx`, which passes catalog entries, catalog status, and `SummarySources`). The dialog collects a brief, an optional budget parsed by `parseBudgetInput` into integer minor units with explicit currency, and explicit consent under a no-photo disclosure; `requestRoomDesign` sends one text-only `RoomDesignRequest` to `/api/design-room` and re-validates the intent, mapping every failure to a message that the room is unchanged. `prepareRoomDesign` resolves the intent with `buildRoomDesignProposal`, `describeRoomDesignIntent`, and `designerCostReport` (new and removed purchases, unknown prices, “Budget unknown” rather than $0 or a mixed-currency sum). `beginRoomDesignerPreview`, `cancelRoomDesignerPreview`, and `applyRoomDesignerPreview` own only the exact preview object they started (`actor: 'auto'`, `baseRevision`), never cancel another tool's preview, refuse stale proposals (cancelling their own preview), and apply all commands as one undoable revision; `ownedRoomDesignerPreview` exposes that ownership to the UI. A response that arrives after the room changed is discarded. Escape, close, and Discard cancel only the designer's preview. Added `.designer-*` styles in `web/src/index.css`, reusing the docked/bottom-sheet discovery dialog layout.

### 2026-09-27 — web: add the consented local Gemini room-design endpoint

Added `web/server/roomDesigner.ts` and `roomDesigner.test.ts`: `createRoomDesignerHandler(deps)` / `RoomDesignerDeps` serve `POST /api/design-room`, mounted in `web/server/api.ts` with the existing CSP middleware. It accepts only loopback, same-origin JSON requests with `consent: true`, bounds the body to 32 KB, allows one request in flight and 6 per minute, and validates `RoomDesignRequest` before any provider work. Gemini receives the fixed `ROOM_DESIGN_SYSTEM_INSTRUCTION` plus only the brief, optional budget, and schema-validated `RoomSummary` (no photos, raw capture, offers, URLs, or `baseRevision`); its answer is re-validated with `parseRoomDesignResponse` and every failure maps to a fixed message. Nothing about the request, prompt, or answer is logged. New `web/server/localAccess.ts` (`isLocalPeerRequest`, `isLocalBrowserRequest`) replaces the inline checks in `recognitionPlugin.ts` with identical behavior. `web/server/ai.ts` now exposes `createAiContext(settings: AiSettings)` (the paid-call path `openAi` already used, now injectable) and refuses any private input class without consent or without `GEMINI_PAID_PROJECT=true` (`refused: 'unpaid-project'`). `InputClass` in `web/src/ai/ledger.ts` gains `'room-summary'`; `parseRoomDesignIntent` / `parseRoomDesignResponse` in `web/src/roomDesigner/contract.ts` now accept any `{ objects: { id }[] }` (a `RoomSummary` or `Room`), since the server has only the redacted summary. Tests cover every pre-provider refusal, the real shared ledger (daily/per-call cap and unpaid-project refusals before any generation request, settle on success), prompt contents, hostile model output, fixed errors, and no console output.

### 2026-09-27 — web: preserve existing purchase prices when stock changes

Updated `web/src/roomDesigner/proposal.ts` and `proposal.test.ts`. `buildRoomDesignProposal` now reads known offer prices and merchant details from all valid supplied catalog entries for existing placed products, while requiring `available: true` only when selecting new or replacement products. A sold-out or unreported-stock offer no longer turns an existing purchase subtotal into an unknown value.

### 2026-09-27 — web: require confirmed stock and known budget prices in room proposals

Updated `web/src/roomDesigner/proposal.ts` and `proposal.test.ts`. `buildRoomDesignProposal` now selects only offers with `available: true`; when a budget is supplied, additions and replacements require a known price in the budget currency. Full rearrangement validates the exact final position and yaw, including doorway clearance, before keeping its move/rotate command sequence. Added regressions for unreported stock, null prices under budget, and an alternate-yaw doorway placement.

### 2026-09-27 — web: resolve room-design intent locally

Added `web/src/roomDesigner/proposal.ts` and `proposal.test.ts`. `RoomDesignProposalInput`, `RoomDesignProposal`, and `buildRoomDesignProposal` turn validated intent into seeded, deterministic room commands using matching catalog entries and local placement checks. Each accepted command applies with the automated actor and no overlap warning; skipped changes carry a reason. The proposal includes a purchase summary with explicit currency and unknown-price budget status. Tests cover palette, layout, catalog identity, budget, keep/lock constraints, capacity, and auto application.

### 2026-09-27 — web: author room-design copy locally

Updated `web/src/roomDesigner/contract.ts` and `contract.test.ts` to remove model-generated `summary` and `notes` from `RoomDesignIntent`; strict parsing rejects either field. New `RoomDesignDescription` and `describeRoomDesignIntent` produce neutral browser copy from validated structured intent and allowlisted local category labels, avoiding unbounded prose claims. Updated the Gemini room-designer design spec to match the boundary.

### 2026-09-27 — web: close room-designer intent bypasses

Updated `web/src/roomDesigner/contract.ts` and `contract.test.ts` so model summary/notes reject price, URL, measurement, coordinate, and command claims; `ROOM_DESIGN_CATEGORIES` now allows only committed catalog categories for additions and replacements. `RoomDesignResponse` is now a type with the new `parseRoomDesignResponse(value, room)` factory, which validates the envelope through the size- and current-room-bound `parseRoomDesignIntent`. This prevents consumers from accepting independently parsed responses that bypass identity checks.

### 2026-09-27 — web: bounded Gemini room-designer contract

Added `web/src/roomDesigner/contract.ts` and `contract.test.ts` to define the redacted, consented text request and strict intent-only model response. Public schemas/types are `RoomSummary`, `RoomDesignRequest`, `RoomDesignIntent`, and `RoomDesignResponse`; `ROOM_DESIGN_CATEGORIES`, `roomSummary`, and `parseRoomDesignIntent` bound categories, output size, planned count, identities, and duplicate references. This keeps scan evidence and purchase facts out of Gemini while leaving coordinate, catalog, and budget decisions to deterministic browser code.

### 2026-09-27 — integration: real catalog renderer with room capture

Merged the demo-ready real-catalog branch into the Designer and native piece-import work. Existing RoomPlan furniture, wall art, Gemini appearance previews, and scanned pieces now use the validated recipe renderer (`web/src/blocks/`) alongside the real catalog. Built-in closet fronts remain measured placeholders because RoomPlan supplies only their thin door plane; an invalid recipe now also falls back to a visible size placeholder instead of blanking the canvas. The Vite server mounts both the price-refresh API and the local-only Gemini recognition endpoint. No scan evidence, prices, or preview-isolation rules changed.

### 2026-09-27 — iOS/web: scan and import a single furniture piece

Added `PieceSelection` (`select`, `allowsPhoto`, `finalID`) and `RoomScanService.Mode.piece` with `selectFramedPiece`, `piecePhotoCount`, `pieceSelection`. Focused shots are recorded only for the chosen object; `RoomEvidenceRecorder.completedPhotoCount` drives saved-view progress. New `PieceScanView` reuses `RoomCaptureViewContainer`; `HomeView` exposes Scan a Piece and Saved Pieces. `ScannedPiece` (`Dimensions`, `Photo`, `validate`, `encoded`, `photo`, `uprightQuarterTurns`) creates bounded, metadata-stripped upright photo exports. `PieceArchiveStore` (`shared`, `defaultRoot`, `init`, `save`, `url(for:)`, `list`) retains files through canceled sharing. `PieceReviewView` and `SavedPiecesView` review/correct dimensions and choose photo inclusion.

The new `web/src/import/piece.ts` exports `MAX_PIECE_BYTES`, `PiecePackage`, `parsePiece`, `verifyPiecePhotos`, `pieceAsset`, `pieceObject`. `PieceImportDialog`, `RoomPanel` and `Workspace` add a piece into the current room without replacing it, retain source measurement provenance, warn about duplicates, and keep preview/undo financially isolated. Unknown categories are placeholders and unknown price remains unknown. Contract: `docs/piece-package.md`. Existing room package contracts are unchanged. Physical-device capture remains a required validation step; this is approximate modeling, not object reconstruction.

### 2026-09-27 — integration: one combined local app

Merged photo discovery, package import, automatic appearance matching, measured floors, closet/wall-art rendering and the existing iOS capture branch. Preserved preview-ownership fixes from main. Local preview now runs from the primary checkout on port 5173. No new native implementation changes.

### 2026-09-27 — web: Gemini appearance and photographed discoveries

Added opt-in Gemini appearance recognition and a camera/upload flow for new furniture in the current room. `AppearanceDialog` now handles existing-item matching and new-item discovery; `DiscoveryDetails` collects supplied/estimated size, name, optional price/store and ownership. `RoomPanel` / `Workspace` expose the entry point. `discoveryObject` finds free floor/table space; `discoveryPrice` parses supported currencies into integer cents. `RoomObject.foundItem` embeds purchase evidence and `purchaseLine` reads it so preview, commit and undo stay atomic. Photos remain transient; no exact geometry, product identity, dimensions or prices are inferred from photos.

Recognition modules add `Appearance`, `RecognitionRequest`, `RecognitionResponse`, `appearanceCommand`, `appearanceAsset`, `RecognitionConfig`, `DEFAULT_MODEL`, `RATES`, `recognize`, `recognitionPlugin` and `scannedSeating`. `setAppearance` updates appearance without altering measurement or placement evidence. See `docs/ux/gemini-appearance.md` for configuration and limits. Tests cover recognition boundaries, stale revisions, placement, unknown prices and atomic undo. Typecheck, lint, 272 tests and build passed; live Gemini smoke test recognized a bed in a synthetic scene (1,259 input / 72 output tokens; estimated $0.00042275); physical mobile camera and full browser photo-to-add interaction remain unverified. No native files changed.


Newest first. Append an entry after every code change (what changed, why, where); never edit older entries.
Format: `### YYYY-MM-DD — area: summary`, then bullets naming files and new/changed functions.

## 2026-09-27

### iOS: wall art in the room package
- `ios/RoomFlow/Models/WallArtItem.swift`: new optional `worldCenter: [Double]?`/`worldNormal: [Double]?`
  (RoomPlan native world, meters; normal points into the room). Nil for items saved before this existed.
- `ios/RoomFlow/Services/WallArtTracker.swift`: `finalize(walls:)` now fills `worldCenter`/`worldNormal` via
  new private `worldPose(of:)` — median center on the measured plane, normals summed then normalized —
  computed across every sighting from every group merged into the final item.
- `ios/RoomFlow/Models/RoomPackageManifest.swift`: new `WallArtPackage` (`Item`) matching
  `.superpowers/sdd/wall-art-package/format.md`'s `wallArt.json`; `isAllowed(_:)` accepts `wallArt.json` and
  `art/<uuid>.jpg`; new `wallArtPath` constant.
- `ios/RoomFlow/Services/RoomPackageExport.swift`: `export` now writes `wallArt.json` (only when at least one
  item qualifies) and `art/<artId>.jpg` copies, for items still in `archive.wallArt` (Review-room removals
  already drop them there) that have a resolved world pose. Art photos share the existing photo byte budget;
  one that doesn't fit is left out (`photoPath` nil) and counted in the existing `omittedPhotoCount`.
- `docs/ios-room-package.md`: new "wallArt.json" section. Tests: `ios/RoomFlowTests/WallArtTrackerTests.swift`,
  `ios/RoomFlowTests/RoomPackageExportTests.swift`.
- Why: "Add detected wall art to the .roomflow.zip and show it on the web walls" — approved by the Designer
  side 2026-09-27; this is the iOS half (package export). Web rendering is a separate change.

## 2026-09-26


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
### iOS: wall art — review fixes
- `ios/RoomFlow/Services/WallArtDetector.swift` (critical): the sensor image is landscape while the app is
  portrait, so width/height were swapped when the phone was upright (TV check tested the height, tracker
  boxes used swapped sizes, crops came out sideways). `judge` now reorders the measured corners into room
  orientation with new private `roomOrder(_:normal:)` (top-left = max `up − right`, right =
  `cross(−normal, up)`) and applies the same permutation to `quad`; `WallArtSighting.corners`/`quad` are
  documented as room-ordered.
- `ios/RoomFlow/Services/WallArtScanner.swift`: the reference crop uses `sighting.quad` (upright in
  portrait). Crop slots stay ≤16 but, when full, the slot of the group with the fewest sightings is
  evicted for a group seen at least as often (private `slotDecision(for:)`), so a piece confirmed late can
  still get a photo. A `generation` counter bumped by `reset` drops results from a frame queued before it.
  New `discard()` releases the tracker and crops and invalidates in-flight frames.
- `ios/RoomFlow/Services/WallArtTracker.swift`: new `sightingCount(group:)`; the file-scope
  `PlacedBoxLike` protocol (which picked up main-actor isolation and warned) is replaced by a private
  nested `Placed` struct with non-generic `boxesOverlapOrClose`/`union`.
- `ios/RoomFlow/Services/RoomScanService.swift`: `cancel()` and `stopEvidence()` call
  `wallArtScanner.discard()`.
- `ios/RoomFlow/Views/RoomEvidenceReviewView.swift`: a `wallArtEdited` flag stops `loadSavedChoices` from
  restoring an item the user already removed in this view.
- Code comments and `docs/INDEX.md` now point at `docs/superpowers/plans/2026-09-26-wall-art-detection.md`;
  `docs/ARCHITECTURE.md` gains `WallArtDetectorTests`/`WallArtTrackerTests` rows and wall-art cases on the
  `RoomArchiveStoreTests` row; `docs/DECISIONS.md` records "Wall art is measured in room orientation, not
  the camera's".
- Tests: `WallArtDetectorTests` — new `portraitFlushArtIsMeasuredInRoomOrientation` (camera rolled −90° and
  +90°) and `portraitSixteenByNineIsLikelyTV`, written first and confirmed failing before the fix;
  `WallArtTrackerTests.groupsByPositionAndNormal` checks `sightingCount(group:)`.

### iOS: save, reopen and review wall art
- `ios/RoomFlow/Services/RoomArchiveStore.swift`: `saveCapture` gains `wallArt: [WallArtItem] = []` and
  `wallArtDirectory: URL? = nil`; when `wallArt` isn't empty it copies each item's photo from
  `wallArtDirectory` into the staged room's new `art/` folder (clearing that item's `photoFileName`
  instead of failing when the source file is missing) and writes `wallArt.json` — skipped entirely when
  `wallArt` is empty, so rooms saved before this feature, or scanned with photos off, load `[]`. New
  `saveWallArt(id:items:) throws` atomically replaces `wallArt.json` (same one-write pattern as
  `saveEdits`/`saveSelection`); it's used by Review room's "Not wall art" removal and never touches the
  photo files in `art/`. `load(id:)` decodes `wallArt.json` (missing file → `[]`) and always returns
  `wallArtDirectory` as `rooms/<id>/art` (a path, not a guarantee the folder exists — only meaningful for
  items whose `photoFileName` isn't nil).
- `ios/RoomFlow/Models/SavedRoomRecord.swift`: `RoomArchive` gains `wallArt: [WallArtItem] = []` and
  `wallArtDirectory: URL` (defaults to the temp directory; always overwritten by `load(id:)`).
- `ios/RoomFlow/Views/HomeView.swift`: carries `latestWallArt`/`latestWallArtDirectory` from the finished
  scan through `saveCapture`, then — like reference photos — reloads them from the saved archive so the
  editor sees the saved copies, and removes the scan's temporary session folder (which holds both the
  reference photos and the wall art crops) once wall art was involved even when no reference photos were
  kept.
- `ios/RoomFlow/Views/RoomEditorView.swift`, `SavedRoomsView.swift`: thread `wallArt`/`wallArtDirectory`
  through to `ScanSummaryView` for a freshly scanned or reopened room.
- `ios/RoomFlow/Views/ScanSummaryView.swift`: new `wallArt`/`wallArtDirectory` properties; when there is
  wall art, a "Wall art (N)" row (footnote "Sizes are measured estimates.") leads to Review room, next to
  the existing "Review room" row.
- `ios/RoomFlow/Views/RoomEvidenceReviewView.swift`: new `wallArt`/`wallArtDirectory` init parameters and
  a "Wall art (N)" section, shown whenever the scan could have found wall art (reference photos were on),
  so an old scan or one with photos off never shows a spurious "none found" message. Each row shows the
  reference-photo thumbnail (drawn straight, unlike sensor-native reference photos, since the crop is
  already upright), "About W × H cm" (rounded to the nearest whole centimeter), and where it hangs — "On
  wall K" by 1-based index into `room.walls` matched on `wallSourceId`, else "On a wall". A "Not wall art"
  button removes the item locally and persists the remaining list with `saveWallArt`, showing a save-error
  bar with Retry (same pattern as the existing label/photo-selection save error) on failure.
- Why: Task 4 of the wall-art-detection plan makes detected wall art durable across app relaunches and
  gives the user a way to see and correct what was found, matching how reference photos are already
  reviewed and saved.
- Tests: `ios/RoomFlowTests/RoomArchiveStoreTests.swift` — new `wallArtIsSavedWithItsPhotoAndReloaded`,
  `roomWithoutWallArtFileLoadsAnEmptyList`, `missingPhotoFileClearsPhotoFileNameInsteadOfFailing`,
  `saveWallArtReplacesTheStoredList`, `saveWallArtOnAnUnknownRoomThrows` (written first, confirmed to fail
  to compile before implementation). Full suite: 80 tests passing. Device build
  (`CODE_SIGNING_ALLOWED=NO`) succeeded with no new warnings in touched files.

### iOS: detect wall art while scanning
- New `ios/RoomFlow/Services/WallArtScanner.swift`: replaces the DEBUG-only `WallArtSpike` (deleted) with a
  production scanner wired into `RoomScanService`. `nonisolated enum DepthMapReader { static func
  depth(in:u:v:) }` is the single LiDAR-pixel-lookup implementation, moved out of `RoomScanService`'s private
  `depth(in:u:v:)` (which now just forwards to it). `nonisolated final class WallArtScanner: @unchecked
  Sendable` — `init(encoder:)`, `reset(directory:)`, `process(frame:surfaces:objects:)` (`@MainActor`; runs
  `VNDetectRectanglesRequest` — 8 max observations, 0.1 min size, 0.7 min confidence, 0.2 min aspect ratio, 30°
  quadrature tolerance — on a private serial queue, one frame at a time, judges each rectangle with
  `WallArtDetector`, and feeds sightings to a `WallArtTracker`), `confirmedCount`, and `finish(finalRoom:)
  async -> [WallArtItem]` (drains the queue, attaches confirmed groups to the final room's walls, and writes
  each item's best-scoring crop to `<directory>/<item.id>.jpg`). The best sighting of each tracker group (by
  `frontality × width × height`, matching `WallArtTracker`'s own ranking) is cropped straight-on with
  `CIPerspectiveCorrection` (pixel corners, Core Image's bottom-left origin) and scaled to a ≤1024 px long
  edge; at most 16 groups keep a crop. When groups merge into one item at `finish`, the highest-scoring
  group's crop wins; a write failure or a group with no crop leaves `photoFileName` nil — never fails the scan.
- `ios/RoomFlow/Services/RoomScanService.swift`: replaced the `#if DEBUG` `WallArtSpike` wiring with
  `WallArtScanner`, always active while `capturePhotos` is on (not DEBUG-gated). Adds `wallArt: [WallArtItem]`
  and `wallArtDirectory: URL?`; `start()` creates `<evidence root>/<sessionID>/art` and calls
  `wallArtScanner.reset(directory:)` when `capturePhotos`; the sampling loop calls `process(…)` every other
  tick; the `didPresent` photo `Task` also calls `wallArtScanner.finish(finalRoom:)` under the same session
  guard as photos; `cancel()` and the failure path (`stopEvidence()`) clear `wallArt`/`wallArtDirectory`.
- `ios/RoomFlow/Models/ScanCaptureResult.swift`: adds `wallArt: [WallArtItem]` and `wallArtDirectory: URL?`,
  with an explicit `init` defaulting both (`[]`/`nil`) for existing call sites.
- `ios/RoomFlow/Views/RoomScanView.swift`: passes `scanner.wallArt`/`scanner.wallArtDirectory` into the
  `ScanCaptureResult` built on "View Room".
- Deleted `ios/RoomFlow/Services/WallArtSpike.swift`: its judging logic now lives in `WallArtDetector`
  (Task 1) and its grouping/attach logic in `WallArtTracker` (Task 2); this task replaces its scanning
  wiring with `WallArtScanner`.
- Why: Task 3 of the wall-art-detection plan turns the debug-only spike into the real detection path so a
  finished scan actually carries `WallArtItem`s and their reference photos, instead of only a debug log.
- Tests: no new unit tests (Vision/Core Image glue has none per the plan; its logic is covered by Tasks 1–2's
  tests). Verified with a device build (`CODE_SIGNING_ALLOWED=NO`, no new warnings in touched files) and the
  full suite (75 tests passing).

### iOS: group wall-art sightings and attach them to final walls
- New `ios/RoomFlow/Services/WallArtTracker.swift`: pure `WallArtTracker` (`add(_:) -> (group:isNewBest:)`,
  `confirmedCount`, `finalize(walls:) -> [(item:groups:)]`). Groups `WallArtSighting`s by running-mean center
  (≤0.15 m) and normal agreement (dot > 0.9), keeping ≤30 sightings per group; a group is confirmed at ≥3
  sightings with camera positions spanning ≥0.2 m (enough to triangulate, not repeated frames from one spot).
  `finalize` takes median width/height/standoff/center per confirmed group, attaches to the final wall with
  the nearest plane within 0.4 m whose extents (+0.1 m slack) contain the center (unattached groups dropped),
  then merges items on the same wall whose wall-local boxes overlap or sit within 0.10 m into one item.
- New `ios/RoomFlow/Models/WallArtItem.swift`: `WallArtItem` (Codable/Equatable/Identifiable/Sendable) — a
  confirmed piece of wall art in its wall's local frame (`centerX`/`centerY` meters from wall center, +x
  along the wall, +y up), with `width`/`height`/`standoff`/`sightingCount`/`photoFileName`/`method`.
- New `ios/RoomFlowTests/WallArtTrackerTests.swift`: 6 tests covering grouping by position/normal, the
  confirmed threshold (sighting count + camera spread), wall attachment, merging two overlapping confirmed
  panels into one item, dropping a group with no attaching wall, and `WallArtItem` round-tripping JSON.
- Why: Task 2 of the wall-art-detection plan turns Task 1's per-frame `WallArtSighting`s into stable,
  scan-wide items attached to the room's final geometry, so a later task can turn them into saved room data.

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
