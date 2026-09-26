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

## Per-object photos are kept ahead of ambient ones
`PhotoCandidatePolicy.thin` and `selectFinal` now protect focused (per-object) photos, thinning or spreading
ambient photos first and only touching a focused photo when no ambient one is left or an object hogs every
slot. Rejected: keeping the old even spread over capture time for everything — it could drop the only photo
of a small or briefly-seen item just because it arrived between two evenly-spaced ambient frames. Focus IDs
never enter the package manifest or leave the device archive; the association a saved room actually uses
always comes from `RoomEvidenceProjector.associate(room:photos:)` against the final processed room, never a
live focus ID, so this stays a capture-time convenience rather than a second source of truth.

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

## Steadiness stands in for photo sharpness
`ObjectFocusTracker` infers "phone is steady enough for a sharp shot" from linear/angular speed between
successive ARKit poses (free every tick from `PhotoFrameSnapshot`). Rejected: measuring blur on the image
itself (e.g. Laplacian variance), which needs a full image read every ~250 ms and is much more expensive on
device. Also chose a 0.6 s dwell before signalling a shot, rejected shooting immediately on first detection:
the live-object spike showed detection often happens while the camera is already resting on the item, but its
box is still refining, so an immediate shot would frequently frame a stale, inaccurate box.

## Live object spike forwards to the session's existing delegate
`RoomCaptureSession.delegate` is a single weak slot that `RoomCaptureView` may use for its own preview.
`LiveRoomObserver` stores the previous delegate and forwards every callback unchanged. Rejected: plainly
replacing the delegate (could silently break Apple's live preview), and polling visibility of known objects
every few frames (fallback if forwarding proves unreliable on device).

Correction (same day, task 3): the slot was `nil` on iOS 27 in both device scans run so far — `RoomCaptureView`
does not itself occupy it. Forwarding is kept anyway because it costs nothing and protects against a future
`RoomCaptureView` (or another wrapper) that does use the slot.
