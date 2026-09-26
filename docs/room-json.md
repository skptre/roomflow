# Room JSON contract (iOS → backend)

Produced by the iOS app from a RoomPlan scan (`ios/RoomFlow/Models/RoomModel.swift`).
`schemaVersion: 1`. Draft — change it together, not one side at a time.

## Coordinate system

- Units: **meters**. Angles: **degrees**.
- Right-handed, **Y-up**. The floor is `y = 0`.
- The room is rotated so its longest wall runs along **X**, then shifted so the walls start at `(x: 0, z: 0)`.
  The room spans `0…width` on X and `0…length` on Z.
- Top-down view: +X = right, +Z = down.
- `yawDegrees`: rotation about the vertical axis, `0 ≤ yaw < 360`, **counterclockwise seen from above**.
  At `0`, an object's `width` runs along +X and its `depth` along +Z.
- Object `position` = center of the object's footprint **at its base** (so furniture on the floor has `y = 0`).

A footprint rectangle for pathfinding: center `(position.x, position.z)`, size `width × depth`, rotated by `yawDegrees`.

## Room

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | int | `1` |
| `id` | UUID string | Stable per scan |
| `revision` | int | Increments on each committed edit. Echo it back in responses. |
| `units` | string | `"meters"` |
| `dimensions` | `{width, length, height}` | Extent on X, extent on Z, tallest wall |
| `walls` | `Wall[]` | Line segments; walls have no thickness |
| `doors`, `windows`, `openings` | `WallOpening[]` | Openings are open doorways with no door |
| `objects` | `RoomObject[]` | Furniture and fixtures |
| `capture` | object | Mapping back to the raw scan; backend can ignore |

**Wall**: `id` (`"wall-1"`), `start {x,z}`, `end {x,z}`, `height`, `sourceId`.

**WallOpening**: `id` (`"door-1"`), `wallId` (may be missing), `start {x,z}`, `end {x,z}`,
`bottomY` (0 for doors, sill height for windows), `height`, `isOpen` (doors only), `sourceId`.

**RoomObject**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `"bed-1"`, `"chair-2"`; stable while editing. Use it to refer to objects. |
| `category` | string | RoomPlan category: `bed sofa chair table storage television` (movable) or `bathtub dishwasher fireplace oven refrigerator sink stairs stove toilet washerDryer` (fixed) |
| `position` | `{x,y,z}` | Base center, meters |
| `dimensions` | `{width,height,depth}` | Meters, in the object's own frame |
| `yawDegrees` | number | See above |
| `movable` | bool | `false` = fixture; never move it |
| `source` | string | `"roomplan"` = measured by the scan |
| `confidence` | string | `high`, `medium`, `low` |
| `sourceId` | UUID string | RoomPlan identifier; backend can ignore |

## Example (trimmed, synthetic 4.2 × 3.8 m room)

```json
{
  "schemaVersion": 1,
  "id": "4FF6A897-2207-4F88-BC65-3DC481BFCF23",
  "revision": 0,
  "units": "meters",
  "dimensions": { "width": 4.2, "length": 3.8, "height": 2.7 },
  "walls": [
    { "id": "wall-1", "start": { "x": 0, "z": 0 }, "end": { "x": 4.2, "z": 0 }, "height": 2.7 }
  ],
  "doors": [
    { "id": "door-1", "wallId": "wall-1", "start": { "x": 3.05, "z": 0 }, "end": { "x": 3.95, "z": 0 },
      "bottomY": 0, "height": 2, "isOpen": true }
  ],
  "windows": [
    { "id": "window-1", "wallId": "wall-3", "start": { "x": 1.4, "z": 3.8 }, "end": { "x": 2.6, "z": 3.8 },
      "bottomY": 1, "height": 1 }
  ],
  "openings": [],
  "objects": [
    { "id": "bed-1", "category": "bed", "position": { "x": 1.2, "y": 0, "z": 1.5 },
      "dimensions": { "width": 1.5, "height": 0.6, "depth": 2 }, "yawDegrees": 90,
      "movable": true, "source": "roomplan", "confidence": "high" }
  ],
  "capture": { "capturedAt": "2026-09-21T14:13:20Z", "alignmentYawDegrees": 30,
               "alignmentOffset": { "x": 2.299, "y": -1.4, "z": -0.982 } }
}
```

## Proposed: `POST /rooms/optimize` (not implemented yet)

Request:

```json
{ "room": { "...": "RoomModel above" }, "prompt": "Give me more walking space but don't move my bed." }
```

Response (proposal):

```json
{
  "baseRevision": 0,
  "objects": [ { "id": "bed-1", "position": { "x": 1.2, "y": 0, "z": 1.5 }, "yawDegrees": 90 } ],
  "explanation": "Moved the desk against the east wall…",
  "metrics": { "walkingSpaceImprovement": 0.27 }
}
```

- Refer to objects by `id`; the app keeps `category` and `dimensions` from its own copy (moving must not resize).
- `baseRevision` = the `revision` you received; the app ignores results for an older revision.
- Omitted objects are unchanged. Do not return `movable: false` objects with new positions.
