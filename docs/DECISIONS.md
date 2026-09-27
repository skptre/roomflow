# Decisions

Non-obvious tradeoffs, each with the alternative that was rejected. Routine "only way to do it" changes don't belong here.

## Wall art is measured in room orientation, not the camera's
ARKit's captured image and camera pose stay in the sensor's fixed landscape frame while the app is portrait-only,
so an image rectangle's "top-left" is usually not the room's. `WallArtDetector` reorders the measured corners
(and the paired image quad) using world up and the viewer's right across the wall, then measures width along the
wall and height vertically; the TV check, tracker boxes and the upright reference crop all use that order.
Rejected: rotating by the device's orientation — the sensor frame is fixed and the phone can be held any way
(including tilted mid-scan), whereas world up from ARKit's gravity-aligned tracking is always available.

## TV-shaped rectangles are skipped
`WallArtDetector` rejects a wall rectangle whose aspect ratio is 1.70…1.85 (16:9-ish) and whose width is ≥0.55 m,
even if it otherwise measures as plausible art. Rejected: trusting the TV-overlap check alone — RoomPlan
sometimes fails to detect a real television as an object, so there is nothing for the wall rectangle to overlap.
A shape/size heuristic catches that case at the cost of also skipping an unusually TV-shaped painting, which is
the rarer case.

## Panels measured on their own plane
When LiDAR shows a rectangle standing consistently in front of the wall plane (up to 30 cm, ≤6 cm spread across
five samples), `WallArtDetector` re-casts the corner rays onto that measured plane — not the wall plane — to get
`corners`/`width`/`height`. Rejected: always measuring on the wall plane, which overstates a standoff panel's
size (a panel 20 cm off the wall projects larger on the farther wall plane) and reports its corners floating in
front of where the surface actually is.

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

## Wall art's empty state uses reference photos as the "photos were on" signal
`RoomEvidenceReviewView` shows a "Wall art" section — including its "no wall art found" empty state — only
when `wallArt` isn't empty or reference `photos` isn't empty, since art detection is fully gated on the
same `capturePhotos` flag as reference photos and there is no separate stored flag for "photo capture was
on for this scan" once a room is reloaded from disk (`RoomArchive.wallArtDirectory` is always a real path,
by design — see below). Rejected: adding a dedicated flag; the same imprecision already exists for
`SavedRoomRecord.evidenceStatus`, which is likewise derived from `photos.isEmpty`. The rare case this
misses — photo capture on, wall art found, but zero reference photos survived selection — would only hide
the harmless empty-state text, never real items.

## `RoomArchive.wallArtDirectory` is a plain path, not an optional
`load(id:)` always returns `rooms/<id>/art` for `wallArtDirectory`, whether or not that folder exists or
the room has any wall art. Rejected: making it `Optional<URL>` like `appearance`, which would need a
"do older/photos-off rooms count as nil" rule with no reliable signal to base it on (see above); a plain
path is cheap to compute and only ever dereferenced for an item whose `photoFileName` isn't nil.

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

### 2026-09-27 — Photographed furniture uses templates and supplied dimensions

Use opt-in Gemini to select an authored approximate shape and colors. Reject single-photo metric inference and claims of exact 3D reconstruction: neither is established by this input. Require user-supplied assembled dimensions (or explicit estimates). Embed found-item purchase facts in room snapshots instead of a mutable external registry so one undo reverses both placement and cost. Photos are transient and not persisted in room JSON. Local-only middleware is development infrastructure; authenticated deployment and cross-device room persistence remain separate work before actual in-store remote use.
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

## Auto-match asks once, then sends items one at a time and reconciles at the end
One consent screen shows every crop that will be sent; requests go sequentially because the local server analyzes one
photo at a time and allows 6 a minute (a 429 is a local refusal, so that item is sent once more after 61 s; a second
refusal stops). All matches apply as one change so one undo reverts them; items removed or restyled while matching are
left as the person set them. Rejected: silently matching on import (sends private photos without consent), one consent
per item (defeats "automatic"), and raising the server rate limit (it is the local spending guard).

## Scan photo crops are turned upright from the camera pose
Phone photos are stored in sensor orientation, so the crop is rotated by quarter turns until world up points up,
computed from `cameraToWorld`. Rejected: sending sideways crops (worse recognition) and reading EXIF (the phone strips it).

## Built-in closets become closet doors set in the wall
RoomPlan reports a built-in closet as a `storage` with only its front (depth ≈ 0) and often a door on the same wall.
The web turns a `storage` thinner than 10 cm and at least 1.2 m tall into a locked `closet` drawn as a 4 cm door
front flush on the wall's inside face, and drops doors on that wall with ≥ 50 % of their width inside the closet.
Depth 0.04 m is a visual stand-in: the true depth behind the doors was never seen, yet dimensions keep
`source: 'captured'` because width and height are captured (the depth caveat lives here and in the importer).
Rejected: keeping the zero-depth dresser (a floating slab), inventing a deep wardrobe (an unmeasured volume that
would block floor space), or keeping the door as an opening (a framed hole into nothing, left standing in the cutaway).
A door only partly over the closet (< 50 %) is kept, since it is more likely a real passage beside it.

## Wall-mounted items hide with their wall regardless of height
`isWallMounted` (any `mount: 'wall'`) decides cutaway hiding; `isWallHung` (wall + raised) still decides dragging.
Rejected: changing `isWallHung` to include floor-standing wall items, which would also block dragging floor mirrors.

## Steadiness stands in for photo sharpness
`ObjectFocusTracker` infers "phone is steady enough for a sharp shot" from linear/angular speed between
successive ARKit poses (free every tick from `PhotoFrameSnapshot`). Rejected: measuring blur on the image
itself (e.g. Laplacian variance), which needs a full image read every ~250 ms and is much more expensive on
device. Also chose a 0.6 s dwell before signalling a shot, rejected shooting immediately on first detection:
the live-object spike showed detection often happens while the camera is already resting on the item, but its
box is still refining, so an immediate shot would frequently frame a stale, inaccurate box.

## Art grouped by position, attached to final walls
`WallArtTracker` groups sightings by running-mean world position/normal during the scan (not by live wall
ID), then attaches each confirmed group to the *final* room's walls only once, in `finalize`. Rejected:
grouping by live wall ID directly — Task 1's spike-era notes show live wall IDs can be replaced mid-scan
(one object split into two groups), so position/normal is the stable key. Rejected: attaching per-sighting
against whatever wall is live at that moment — the live wall set changes shape as RoomPlan refines the room,
so attaching a group once at the end, against the wall list the finished room actually uses, is the only
version worth turning into saved data. Confirmation requires camera spread (≥0.2 m between two sightings),
not just a sighting count — three sightings from one stationary frame are correlated, not independent
evidence the rectangle is real and where the tracker thinks it is.

## Live-object feed forwards to the session's existing delegate
`RoomCaptureSession.delegate` is a single weak slot that `RoomCaptureView` may use for its own preview.
`LiveRoomObserver` stores the previous delegate and forwards every callback unchanged. Rejected: plainly
replacing the delegate (could silently break Apple's live preview), and polling visibility of known objects
every few frames (fallback if forwarding proves unreliable on device).

Correction (same day, task 3): the slot was `nil` on iOS 27 in both device scans run so far — `RoomCaptureView`
does not itself occupy it. Forwarding is kept anyway because it costs nothing and protects against a future
`RoomCaptureView` (or another wrapper) that does use the slot.

## Wall art's reference photo is a straight-on `CIPerspectiveCorrection` crop, not the raw frame
`WallArtScanner` warps each candidate's best-scoring sighting to a straight-on rectangle with
`CIFilter.perspectiveCorrection()` before saving it, rather than saving the raw camera frame (cropped or not)
and letting a viewer imagine the rectangle from an angled photo. Rejected: saving the untouched frame — the
camera is rarely square-on to a wall during a scan, so a raw crop shows the art skewed by whatever angle it
happened to be seen from, which reads as a worse-quality photo of the same information the corrected crop
already captures. The corrected crop is still a measured estimate (camera + LiDAR), not a merchant photo;
`WallArtItem.method` continues to record that provenance. Cost accepted: the perspective warp can introduce
minor resampling softness versus the source frame, judged worth it for a photo that actually reads as "the
art," and the crop is capped at a 1024 px long edge to bound its size regardless.

## Art photos yield to regular photos in the package's byte budget
`RoomPackageExport` fills the existing 20 MiB photo budget with the user's selected Review-room photos first,
then adds `art/<artId>.jpg` reference photos afterward from whatever budget remains; an art photo that doesn't
fit is dropped (`photoPath: null`, the `wallArt.json` item itself still exports) rather than displacing an
already-selected photo. Rejected: giving art photos priority over regular photos, or a separate budget for
them. The user explicitly chose which regular photos to share in Review room — that's a deliberate decision
this feature shouldn't silently override — while wall-art photos are an automatic, best-effort extra a
consumer can live without (the geometry item still carries full pose/size/photo-provenance data). Rejected: a
dedicated size budget for `art/`, which would need its own limit to tune and defend, for a case (many
high-sighting-count art pieces in one scan) that hasn't shown up as a real problem yet. Dropped art photos are
counted in the existing `omittedPhotoCount` rather than a new field, since it already means "a photo we would
have liked to include didn't make it," and a second counter would fragment that one user-facing number for no
real benefit.

### 2026-09-27 — A piece is separate from its room

Use existing RoomPlan measurements and explicit live object selection for the first native piece mode. Export only that object's dimensions and opted-in upright photos. Rejected: exporting a one-object room and passing it through loadRoom, which would replace the user's design; exporting raw surroundings; claiming full 3D reconstruction from reference views. A missing final RoomPlan ID requires rescan instead of silently choosing the nearest item. The separate piece format has no pose: the Designer places it in free space and records an approximate category shape. File import is local; Gemini remains an explicit photo action rather than an automatic upload. Durable native piece files make canceled sharing retryable without a new scan.

### 2026-09-27 — Chunky sample-room models are an opt-in block, not a new default

The demo room's plump look (fat rounded legs, soft edges, big knobs, thick padded headboard) is a `proportion: 'chunky'` block that only the `demo:*` recipes set; every family defaults to `classic`, so the 2,246 catalog models draw exactly as before. Rejected: raising the shared edge and leg sizes for everything, which would silently restyle the catalog lineup another session had just tuned and can't be judged without re-checking it; and hand-built one-off demo meshes, which wouldn't match anything swapped in from the shop. The block, like the bed's `throw` and art's `motif`, is left out of the Gemini prompt: it's styling, not a product feature, and adding it would change the prompt text and invalidate the paid answer cache. Making chunky the default later is one line per family plus a lineup review.

### 2026-09-27 — Two rooms as zones of one room, not two rooms

The sample home's bedroom and bathroom are one `Room` (one floor outline, one wall list) with an optional `zones` list that gives an area its own floor and wall paint. Rejected: a multi-room model, which would touch import, persistence, commands, layout and the camera for a demo need. Everything outside a zone uses `room.finishes`, so looks still restyle the main room while the bathroom keeps its tile. Each wall face takes the paint of the room it looks into (a partition is sage on one side, white on the other); an exterior wall's outside matches its inside. RoomPlan doesn't report rooms, so real scans have no zones yet; the sample adds its own. Partitions that face the camera are now cut like exterior walls (either side), since in a two-room plan the wall between them otherwise hides one room.
