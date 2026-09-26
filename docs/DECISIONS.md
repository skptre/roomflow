# Decisions

Non-obvious tradeoffs, each with the alternative that was rejected. Routine "only way to do it" changes don't belong here.

## iOS exports the RoomPlan capture untouched
`RoomPlanFileExport` writes exactly `JSONEncoder().encode(CapturedRoom)`, encoded once and saved as frozen bytes.
Rejected: sending the iOS `RoomModel` or a normalized file to the web. The web importer normalizes itself
(`docs/contracts/room-import.md`); transforming on both sides would double-convert and lose the original evidence.

## The iOS RoomModel uses its own frame
Rotated so the longest wall lies on +X, walls start at (0,0), floor at y=0 — convenient for a top-down plan.
The web centers the room and doesn't rotate. Rejected: forcing one shared frame; the raw file is the shared
truth, and `RoomModel` is only the phone's editor model (`CaptureAlignment` records how to map back).

## Colors are estimates with evidence counts
Median of camera pixels, occlusion-checked with LiDAR depth, stored as `EstimatedColor(hex, sampleCount)`;
`sampleCount 0` = illustrative (sample room). Rejected: presenting colors as material/product colors.

## Metal API Validation is off in the shared scheme
RoomPlan's RealityKit preview binds a texture Metal's debug validator rejects, crashing debug runs on the first wall.
It's an Apple framework issue, not app code; release builds are unaffected. Rejected: code workarounds.

## Photos stay in sensor orientation
Stored landscape as captured, intrinsics rescaled to the exported pixels; rotated only for display.
Rejected: rotating files, which would silently invalidate the calibration and every projected region.

## Photo capture is opt-in and bounded
Off by default; ≤12 JPEGs, long edge ≤1280 px, ≤20 MiB, one encode at a time, frames dropped while busy.
Rejected: continuous capture or video, which costs scan smoothness, storage and privacy.

## Object↔photo matches are projected bounds, not identities
Box corners projected with the photo's pose; near-plane crossings rejected; photos before a tracking
interruption skipped. Rejected: claiming visibility or product identity from a rectangle.

## Saved rooms publish atomically
Assembled in `staging/` and moved into `rooms/<id>/` with one rename; edits and selections are single atomic
writes. Rejected: writing files in place, which can leave half-saved rooms after a crash or full disk.

## Package zipping uses iOS's built-in archiver
`NSFileCoordinator` `.forUploading` behind `RoomPackageArchiver`; the zip holds one `<id>.roomflow/` folder.
Rejected: a third-party ZIP library (dependency + license review) for a hackathon.

## The package contract is proposed, not frozen
`docs/ios-room-package.md` stays "proposed" until the Designer side agrees. The raw `.roomplan.json` share stays
independent so the working handoff never depends on it.

## Xcode project uses synchronized folders
New files join targets automatically, so `project.pbxproj` rarely changes and merges stay clean.
Rejected: a project generator (XcodeGen), an extra tool for everyone.

## Native move/rotate/delete not built on iOS
The web app already edits furniture (keep/lock/undo). iOS focuses on accurate capture and evidence.
`RoomEditorState` keeps selection only; `RoomArchiveStore.saveEdits` exists for when editing is added.

## Floor outline: wall loop, then RoomPlan's floor, then a wall-aligned rectangle
A closed wall loop stays first (unchanged, tested behavior). When walls don't close (open-ended rooms), RoomPlan's own
`floors[].polygonCorners` are used — verified on two real scans to land exactly on wall ends. Rejected: the world-axis
bounding box, which turned a 45 m² room at 52.5° into a ~136 m² diamond; and preferring the floor polygon even when
walls close, which would change results Yash's tests already pin down.

## Package checksums are enforced, not advisory
A file whose SHA-256 or size doesn't match the manifest rejects the whole package. Rejected: warning and continuing,
which would let a damaged or edited raw scan through as if it were the phone's original.

## Web zip reading has no dependency
A ~150-line reader on the platform `DecompressionStream`, limited to what packages contain (stored/deflate, no ZIP64,
no encryption), with CRC and size checks. Rejected: JSZip/fflate — a new dependency for a narrow, well-specified format.

## User names become display names, never categories
An annotation sets the object's `name`; `category`, dimensions and provenance stay as scanned, so ranking and
furniture templates keep using RoomPlan's classification. Rejected: overwriting `category` from free text.
