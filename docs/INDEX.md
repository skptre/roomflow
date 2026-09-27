# Index

Quick lookup: where to find something without opening files to check. Read this first.
Keep it current (see `.claude/documentation.md`). One line per row; this is a lookup table, not a description.

| Looking for… | Go to |
| --- | --- |
| What every file does, with key types/functions | `docs/ARCHITECTURE.md` |
| What changed and when | `docs/CHANGELOG.md` |
| Gemini room-designer design and safety contract | `docs/superpowers/specs/2026-09-27-gemini-room-designer-design.md` |
| Why a past tradeoff was made | `docs/DECISIONS.md` |
| When to update which document | `.claude/documentation.md` |
| Product behavior and scope | `spec.md` |
| Engineering rules (coordinates, money, evidence, verification) | `CLAUDE.md` |
| **iOS** — scan flow (RoomPlan session, camera permission, sampling loop) | `ios/RoomFlow/Services/RoomScanService.swift`, `Views/RoomScanView.swift` |
| iOS — raw `.roomplan.json` export (untouched `CapturedRoom`) | `ios/RoomFlow/Services/RoomPlanFileExport.swift` |
| iOS — saved rooms on the phone (storage layout, atomic save) | `ios/RoomFlow/Services/RoomArchiveStore.swift`, `Models/SavedRoomRecord.swift` |
| iOS — native room model and its coordinate frame | `ios/RoomFlow/Models/RoomModel.swift`, `RoomObject.swift`, `docs/room-json.md` |
| iOS — CapturedRoom → RoomModel conversion | `ios/RoomFlow/Services/RoomPlanConverter.swift`, `RoomNormalizer.swift` |
| iOS — camera-estimated colors | `ios/RoomFlow/Services/RoomColorSampler.swift`, `ColorFrame.swift` |
| iOS — reference photos (capture, limits, sessions) | `ios/RoomFlow/Services/RoomEvidenceRecorder.swift`, `Models/RoomPhotoEvidence.swift` |
| iOS — furniture-aware photos (live objects, focus hint, coverage) | `ios/RoomFlow/Services/LiveRoomObserver.swift`, `ObjectFocusTracker.swift`, `ios/RoomFlow/Views/ScanFocusHintView.swift`, `ios/RoomFlow/Models/PhotoCoverage.swift` |
| iOS — matching photos to scanned objects | `ios/RoomFlow/Services/RoomEvidenceProjector.swift`, `Models/RoomAppearanceEvidence.swift` |
| iOS — wall art detection (judge rectangles, group/confirm/attach to final walls, scan wiring + reference photo crop, save/reopen/review) | `ios/RoomFlow/Services/WallArtDetector.swift`, `WallArtTracker.swift`, `WallArtScanner.swift`, `Models/WallArtItem.swift`, `Services/RoomArchiveStore.swift`, `Views/RoomEvidenceReviewView.swift`, `Views/ScanSummaryView.swift`, `docs/superpowers/plans/2026-09-26-wall-art-detection.md` |
| iOS — Review room (labels, photo selection) | `ios/RoomFlow/Views/RoomEvidenceReviewView.swift`, `Models/RoomEvidenceSelection.swift` |
| iOS — `.roomflow.zip` package (incl. `wallArt.json`/`art/`) | `ios/RoomFlow/Services/RoomPackageExport.swift`, `Models/RoomPackageManifest.swift`, `docs/ios-room-package.md` |
| iOS — top-down plan drawing and tap selection | `ios/RoomFlow/Views/RoomEditorView.swift`, `Services/FloorPlanGeometry.swift` |
| iOS — screens and navigation | `ios/RoomFlow/Views/HomeView.swift` (entry), `SavedRoomsView.swift`, `ScanSummaryView.swift` |
| iOS — colors, button style, plan palette | `ios/RoomFlow/Views/Theme.swift` |
| iOS — tests (Swift Testing) | `ios/RoomFlowTests/` |
| iOS — what's verified on a real phone | `docs/ios-room-evidence-verification.md` |
| iOS — build/test commands, simulator/device gotchas | `docs/ARCHITECTURE.md` › iOS › Commands |
| **Web** (Yash) — RoomPlan import on the web side | `web/src/import/roomplan.ts`, `docs/contracts/room-import.md` |
| Web — `.roomflow.zip` import (manifest, checksums, evidence) | `web/src/import/roomflowPackage.ts`, `web/src/import/zip.ts` |
| Web — package evidence at runtime (photos/regions per object) | `web/src/ui/evidenceStore.ts` |
| Web — wall art from the package, built-in closets (import rules, rendering) | `web/src/import/roomflowPackage.ts` (`readWallArt`), `web/src/import/roomplan.ts` (`closetOnWall`), `web/src/scene/ArtPhoto.tsx` |
| Web — floor outline rules for imported scans | `web/src/import/roomplan.ts` (`outlineFromFloors`, `alignedBoundsOutline`) |
| Web — photo matching (Gemini) and auto-match from scan photos | `web/src/recognition/`, `web/src/ui/AutoMatchDialog.tsx`, `web/server/recognition.ts` |
| Web — domain logic (geometry, money, commands, themes) | `web/src/domain/` |
| Web — 3D scene / UI | `web/src/scene/`, `web/src/ui/` |
| Web — demo sample room (layout, decor, chunky recipes) | `web/scripts/generate-demo-home.mjs`, `web/src/fixtures/demoRoom.ts` |
| Web — room zones (per-area floor and wall paint) | `web/src/domain/schema.ts` (`Zone`), `web/src/scene/zonePaint.ts` |
| Web — moving hung pieces along their wall | `web/src/domain/layout.ts` (`slideOnWall`), `web/src/scene/FurnitureObject.tsx`, `web/src/ui/editorActions.ts` (`nudgeOnWall`) |
| Web — run/test commands | `web/README.md`, `AGENTS.md` |
| Plans (web) | `.claude/plans/` |
| Plans (iOS, local, untracked) | `docs/superpowers/plans/` |
| PR template and CI | `.github/` |

| Web — Gemini photos and furniture discoveries | `docs/ux/gemini-appearance.md`, `web/src/recognition/`, `web/server/` |
| Web — Gemini room-designer request and intent boundary | `web/src/roomDesigner/contract.ts` |
| Web — deterministic room-designer proposal resolution | `web/src/roomDesigner/proposal.ts` |
| Web — Gemini room-design endpoint (`/api/design-room`) and local-only request checks | `web/server/roomDesigner.ts`, `web/server/localAccess.ts`, `web/server/ai.ts` |
| Web — “Design with Gemini” composer, owned preview and apply | `web/src/ui/RoomDesignerDialog.tsx`, `web/src/ui/roomDesignerActions.ts` |

| iOS — Scan a piece, local saved pieces and selected-object export | `ios/RoomFlow/Views/PieceScanView.swift`, `PieceReviewView.swift`, `ios/RoomFlow/Models/ScannedPiece.swift`, `ios/RoomFlow/Services/PieceArchiveStore.swift` |
| Web — import one piece into an existing room | `web/src/import/piece.ts`, `web/src/ui/PieceImportDialog.tsx`, `docs/piece-package.md` |
