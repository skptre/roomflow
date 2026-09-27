# RoomFlow room package v1 (iOS → Designer)

**Status: v1 accepted by the Designer/web side (2026-09-26).** The web app imports it in
`web/src/import/roomflowPackage.ts` (zip reader: `web/src/import/zip.ts`), alongside the raw
`<capture-id>.roomplan.json` (`docs/contracts/room-import.md`). Checksum mismatches are rejected.
This package is an additional, evidence-aware format; nothing here changes the raw file.
Owner (iOS): `ios/RoomFlow/Services/RoomPackageExport.swift`, `ios/RoomFlow/Models/RoomPackageManifest.swift`.

## File

One zip named `<capture-id>.roomflow.zip` containing a single top-level folder `<capture-id>.roomflow/`:

| Path (inside the folder) | Required | Meaning |
| --- | --- | --- |
| `manifest.json` | yes | Versions, identities, file inventory with SHA-256, photo calibration, object↔photo regions |
| `capture.roomplan.json` | yes | The original `JSONEncoder().encode(CapturedRoom)` bytes, byte-identical to the raw export |
| `editable.roomflow.json` | yes | RoomFlow's native editor model (`docs/room-json.md`). Different frame; never a substitute for the raw scan |
| `appearance.json` | no | Approximate sampled colors and user-supplied names |
| `photos/<photo-id>.jpg` | no | Only photos the user chose to share (Review room), max 12 / 20 MiB |
| `wallArt.json` | no | Confirmed wall art still in the room's saved list, RoomPlan native world pose |
| `art/<art-id>.jpg` | no | Straight-on reference photo for a `wallArt.json` item (optional per item) |

No other paths appear. Consumers should still reject anything else, `..`, absolute paths, symlinks and duplicates.

## Identity and units

- `captureId` = RoomPlan's `CapturedRoom.identifier`. **The raw RoomPlan JSON has no top-level
  `identifier` key** (verified on a real iOS 27 export), so take the capture ID from the manifest or file name.
- Object IDs everywhere are RoomPlan object `identifier` UUIDs (`sourceId`).
- Meters. `coordinateSpace: "roomplan-native-v1"` = RoomPlan/ARKit world frame: right-handed, Y-up,
  origin where the scan started. No recentering or rotation is applied on iOS.

## manifest.json

```json
{
  "schemaVersion": 1,
  "packageId": "5B1C9C2E-0000-4000-8000-000000000001",
  "captureId": "AE251557-0000-4000-8000-000000000000",
  "capturedAt": "2026-09-26T21:02:00Z",
  "units": "meters",
  "coordinateSpace": "roomplan-native-v1",
  "selectionRevision": 3,
  "omittedPhotoCount": 0,
  "files": [
    { "path": "capture.roomplan.json", "mediaType": "application/json", "byteCount": 46804, "sha256": "…" },
    { "path": "editable.roomflow.json", "mediaType": "application/json", "byteCount": 14662, "sha256": "…" },
    { "path": "appearance.json", "mediaType": "application/json", "byteCount": 912, "sha256": "…" },
    { "path": "photos/8F0D…E1.jpg", "mediaType": "image/jpeg", "byteCount": 214530, "sha256": "…" }
  ],
  "photos": [
    {
      "photoId": "8F0D…E1", "path": "photos/8F0D…E1.jpg", "sessionId": "…",
      "timestamp": 1234.56, "pixelWidth": 1280, "pixelHeight": 960,
      "cameraToWorld": [16 numbers, column-major],
      "intrinsics": [9 numbers, column-major],
      "pixelOrientation": "sensor-native",
      "trackingContinuous": true
    }
  ],
  "associations": [
    { "sourceId": "<RoomPlan object UUID>", "photoId": "8F0D…E1", "rect": [0.28, 0.33, 0.21, 0.35], "method": "projected-bounds" }
  ]
}
```

(Synthetic example; `…` marks shortened values.)

## Photo calibration

- Pixels are **sensor-native**: the back camera's landscape orientation, top-left origin, never rotated,
  mirrored or cropped. (Displaying them upright for a portrait-held phone means rotating 90° clockwise.)
- `intrinsics` describe **the exported pixels** (already scaled from the sensor image): column-major
  `[fx, 0, 0, 0, fy, 0, cx, cy, 1]`.
- `cameraToWorld` is ARKit's camera transform (column-major; translation at indices 12–14). ARKit camera space:
  +X right, +Y up, looking down **−Z**.
- Projecting a world point `P`: `p = inverse(cameraToWorld) · P`, `d = −p.z` (must be > 0),
  `u = fx·p.x/d + cx`, `v = cy − fy·p.y/d` (pixels, v downward).
- No location, device make/model, or date metadata is written. (Apple's JPEG writer adds a minimal EXIF
  block containing only the pixel dimensions; verified on a real export.)
- `trackingContinuous: false` means AR tracking was interrupted after the photo was taken; its pose may not
  match the final room, and it has no associations.

## Associations

`rect` = normalized `[x, y, width, height]` (0…1, top-left origin, sensor-native pixels) of the object's
measured 3D box projected into the photo, clipped to the image. `method: "projected-bounds"` is a
**candidate region**: it does not prove the object is visible (something may be in front of it) and it
identifies no product. Boxes crossing the camera's near plane are omitted. An object may appear in several photos.
Verified on device (iPhone 15 Pro): boxes landed on the scanned bin and chair.

## appearance.json

```json
{
  "schemaVersion": 1,
  "captureId": "…",
  "colors": [ { "sourceId": "…", "hex": "#E4DED3", "sampleCount": 40, "provenance": "camera-estimate" } ],
  "floorColor": { "hex": "#4A4B50", "sampleCount": 120 },
  "annotations": [ { "sourceId": "…", "label": "trash can", "provenance": "user-supplied" } ]
}
```

- `camera-estimate` colors are lighting-dependent medians of camera pixels, not material or product colors.
- `annotations` are the user's names for RoomPlan objects. They sit beside RoomPlan's own `category`
  (still in `capture.roomplan.json`) and never replace it or change any measurement.
- A user can't add an object without RoomPlan geometry in v1, so no fabricated IDs or dimensions exist.

## wallArt.json

**Approved by the Designer side 2026-09-27** (`.superpowers/sdd/wall-art-package/format.md` is the binding
copy of this section; keep them in sync). Present only when at least one confirmed piece of wall art both
survived Review room (the user didn't mark it "Not wall art") and has a resolved world pose — items saved
before `WallArtItem.worldCenter`/`worldNormal` existed are left out, never exported with fabricated coordinates.

```json
{
  "schemaVersion": 1,
  "captureId": "AE251557-0000-4000-8000-000000000000",
  "items": [
    {
      "artId": "5B1C9C2E-0000-4000-8000-000000000002",
      "wallSourceId": "UUID of a RoomPlan wall in capture.roomplan.json (may be absent from the web room; then place anyway)",
      "center": [1.0, 1.4, -3.0],
      "normal": [0.0, 0.0, 1.0],
      "width": 0.38,
      "height": 0.95,
      "standoff": 0.0,
      "sightingCount": 7,
      "photoPath": "art/5B1C9C2E-0000-4000-8000-000000000002.jpg",
      "method": "rectangle-lidar-v1",
      "provenance": "measured-estimate"
    }
  ]
}
```

- `center`/`normal`: RoomPlan native world coordinates and frame, meters — same as `capture.roomplan.json`
  and `manifest.json`'s `photos[].cameraToWorld`. `normal` is a unit vector pointing from the wall into the
  room (the art's front); a consumer should still normalize it defensively.
- `width`/`height`/`standoff`: meters, measured estimates (never claimed exact); `standoff` is how far the
  panel sits in front of the wall plane.
- `photoPath`: `art/<artId>.jpg`, or `null` when no photo was captured, the file went missing, or it didn't
  fit the package's photo byte budget (art photos share `RoomPackageExport.maxPhotoBytes` with `photos/`).
- `provenance` is always `"measured-estimate"` in v1 — every wall-art item comes from the same camera+LiDAR
  detection pipeline (`WallArtTracker`), never a merchant listing or user entry.
- Malformed or out-of-range items should be dropped by the consumer with one warning; a malformed file drops
  wall art entirely with a warning, never fails the whole package import (see `format.md`'s validation rule).

## Limits and failure behavior (iOS side)

- At most 12 photos, 20 MiB of photo bytes; extra selected photos are dropped and counted in `omittedPhotoCount`.
  Art photos (`art/<artId>.jpg`) share the same 20 MiB budget, filled after regular photos; one that doesn't
  fit is dropped (`photoPath` becomes `null`, the item itself still exports) and also counted in
  `omittedPhotoCount` — see `docs/DECISIONS.md` for why art photos yield to regular photos rather than the
  reverse.
- Packages are rebuilt from the latest selection each time; excluded photos can't appear in a new package.
- Packaging failures never affect the saved room or the separate raw RoomPlan export.

## Open questions for the Designer side

1. Accept this layout (single top-level folder) and these field names, or propose changes before v1 is frozen.
2. Should the consumer verify SHA-256 and reject mismatches (recommended), or only warn?
3. Is `projected-bounds` enough for recognition, or is a per-object crop preferred later?
4. Where should uploaded packages go once direct upload exists (endpoint, auth, size limit)? Until then, file sharing only.
