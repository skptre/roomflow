# Index

Quick lookup: where to find something without opening files to check. Read this first.
Keep it current (see `.claude/documentation.md`). One line per row; this is a lookup table, not a description.

| Looking for… | Go to |
| --- | --- |
| What every file does, with key types/functions | `docs/ARCHITECTURE.md` |
| What changed and when | `docs/CHANGELOG.md` |
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
| iOS — matching photos to scanned objects | `ios/RoomFlow/Services/RoomEvidenceProjector.swift`, `Models/RoomAppearanceEvidence.swift` |
| iOS — Review room (labels, photo selection) | `ios/RoomFlow/Views/RoomEvidenceReviewView.swift`, `Models/RoomEvidenceSelection.swift` |
| iOS — `.roomflow.zip` package | `ios/RoomFlow/Services/RoomPackageExport.swift`, `Models/RoomPackageManifest.swift`, `docs/ios-room-package.md` |
| iOS — top-down plan drawing and tap selection | `ios/RoomFlow/Views/RoomEditorView.swift`, `Services/FloorPlanGeometry.swift` |
| iOS — screens and navigation | `ios/RoomFlow/Views/HomeView.swift` (entry), `SavedRoomsView.swift`, `ScanSummaryView.swift` |
| iOS — colors, button style, plan palette | `ios/RoomFlow/Views/Theme.swift` |
| iOS — tests (Swift Testing) | `ios/RoomFlowTests/` |
| iOS — what's verified on a real phone | `docs/ios-room-evidence-verification.md` |
| iOS — build/test commands, simulator/device gotchas | `docs/ARCHITECTURE.md` › iOS › Commands |
| **Web** (Yash) — RoomPlan import on the web side | `web/src/import/roomplan.ts`, `docs/contracts/room-import.md` |
| Web — domain logic (geometry, money, commands, themes) | `web/src/domain/` |
| Web — 3D scene / UI | `web/src/scene/`, `web/src/ui/` |
| Web — run/test commands | `web/README.md`, `AGENTS.md` |
| Plans (web) | `.claude/plans/` |
| Plans (iOS, local, untracked) | `docs/superpowers/plans/` |
| PR template and CI | `.github/` |
