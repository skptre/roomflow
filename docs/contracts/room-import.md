# Room import contract (iOS capture → web)

Status: draft for the first merge of the capture app and the web workspace. Owner of the web side: `web/src/import/roomplan.ts`.

## File the web app expects

- The **raw** JSON of an Apple RoomPlan `CapturedRoom`, produced on the phone with `JSONEncoder().encode(capturedRoom)`. No phone-side conversion, recentering, or unit changes.
- Suggested name: `<anything>.roomplan.json`. Real scans for tests go in `fixtures/scans/`, ideally with one tape-measured wall noted in a sidecar (`<name>.measured.json`, e.g. `{ "wallIdentifier": "…", "lengthMeters": 3.42 }`).
- The synthetic sample (`web/src/fixtures/synthetic-bedroom.roomplan.json`) carries `"_synthetic": true`; the app labels rooms from it as synthetic. Real exports must not set that key.

## Fields read

Top level: `walls`, `doors`, `windows`, `openings`, `objects` (arrays; only `walls` is required), `identifier` (optional).

Each surface/object:

| Field | Expected form | Use |
| --- | --- | --- |
| `identifier` | non-empty string (UUID) | becomes the wall/opening/object id |
| `dimensions` | `[x, y, z]` meters, finite | walls/openings: `[length, height, thickness≈0]`; objects: `[width, height, depth]` |
| `transform` | 16 numbers, column-major; or 4 arrays of 4 (the columns) | translation = geometric **center**; column 0 = local +X |
| `category` | `{ "bed": {} }`-style keyed object, or a plain string | objects: mapped to app categories; unknown → `unknown` + warning |
| `parentIdentifier` | wall identifier or null | door/window → wall link |
| `confidence` | `{ "high": {} }`-style or string | low-confidence count is reported as a warning |

Also read: `floors[]` with `transform` and `polygonCorners` (local frame: native = transform · corner), used when the walls don't close.

Ignored for now: `sections`, `completedEdges`, `curve`, `story`, object `attributes`.

A RoomFlow package (`<capture-id>.roomflow.zip`, `docs/ios-room-package.md`) is also accepted: its `capture.roomplan.json` goes through this same importer; its evidence never changes geometry.

## Normalization applied (web side only)

1. RoomPlan's frame is already meters, right-handed, Y-up, so **no rotation or scaling** is applied.
2. Floor height = lowest wall base (`center.y − height/2`) in native coordinates.
3. Floor outline, in order: the largest closed loop of wall segments chained end-to-end (corners within 15 cm are joined); else RoomPlan's largest valid floor polygon (`floors[].polygonCorners`, ≥ 0.5 m²); else a rectangle aligned with the longest wall that contains every wall, with a warning. (The old world-axis bounding box grew a turned, open-ended room into a much larger diamond.) A malformed `floors` list is ignored with a warning. Import warnings are shown to the user.
4. Everything is translated so the outline's bounding box is centered at x = z = 0 and the floor is at y = 0. The translation is stored as `room.source.nativeToApp` (`app = native + nativeToApp`).
5. Objects: origin moves from center to bottom-center (`y − height/2`); yaw = `atan2(m[8], m[0])`, radians about +Y, counter-clockwise seen from above. Only yaw is kept — RoomPlan objects are assumed upright.
6. Openings: attached to `parentIdentifier` when that wall exists; otherwise to the **single** wall they are parallel to (within ~6°), within 20 cm of, and inside the length of. No match or several matches → opening dropped with a warning. `offsetAlongWall` = distance from wall start to the opening center; `bottom` = sill height above the floor.
7. Walls are `exterior` when the floor lies on at most one side of them (used for cutaway).
8. Captured objects: `sourceKind: captured`, dimensions `source: captured`, `fidelity: approximate`, `keep: true`, `lockPlacement: false`. Visual = closest parametric template by category (bed, table→desk, chair→desk chair, sofa, storage→dresser), else a sized placeholder.
9. The parsed input is kept untouched as `room.source.raw`.

## Limits and rejection

Rejected with a readable message; the currently open room is left untouched:

- file larger than 20 MB, not JSON, not an object, or without a `walls` array;
- more than 200 walls, more than 500 objects, or more than 1000 entries in any other surface list;
- a surface whose local X axis is not (roughly) horizontal — walls, openings and objects must be upright;
- any non-finite number (`NaN`, `Infinity`, strings such as `"NaN"`) in `dimensions` or `transform`, or a transform that is not 16 numbers / 4×4;
- no usable walls, or walls that enclose less than 0.5 m² of floor.

Zero-size walls, openings, or objects are skipped with a warning.

## Open questions for the iOS side

1. Confirm how `simd_float4x4` is encoded in your export (flat 16 vs. 4 nested columns). Both are accepted.
2. Confirm the category encoding (`{ "door": { "isOpen": false } }` vs. string).
3. Do you export `floors[].polygonCorners` (iOS 17+)? A future version could prefer it over the wall loop for irregular rooms.
4. Multi-room captures (`CapturedStructure`): out of scope for now — export one `CapturedRoom` per file.
5. Please include one tape-measured wall per real test scan so scale can be checked (±3 cm).
6. Photos/depth for appearance: separate files later; this contract covers structure only.
