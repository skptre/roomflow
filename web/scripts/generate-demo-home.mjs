// Generates src/fixtures/demo-home.roomplan.json: the app's sample room (synthetic, not a real scan).
// Usage (from web/): node scripts/generate-demo-home.mjs src/fixtures/demo-home.roomplan.json
//
// One small bedroom, 4.6 × 4.0 m, with a few pieces: a bed and nightstand, a desk and chair under
// the window, an armchair in the corner. Shaped like RoomPlan CapturedRoom JSON so it goes through
// the same importer as a real scan. Laid out in "design" coords (floor y = 0, x west→east, z
// south→north, meters), then shifted by a native offset so the importer's recentering is
// exercised. The default camera looks in from the north-east, so the south and west walls are
// the ones it sees; the bed's headboard and the desk are on them.
// Finishes and the few decor pieces a scan can't detect are added after import: src/fixtures/demoRoom.ts.
import { writeFileSync } from 'node:fs'

const O = { x: -0.8, y: -1.3, z: 1.1 }
const r = (n) => Math.round(n * 1e6) / 1e6

/** Column-major transform for a yaw about +Y and a center (design coords). Local +Z (front) → (sin yaw, cos yaw); local +X → (cos yaw, −sin yaw). */
function transform(yaw, cx, cy, cz) {
  const c = r(Math.cos(yaw)) + 0
  const s = r(Math.sin(yaw)) + 0
  return [c, 0, -s + 0, 0, 0, 1, 0, 0, s, 0, c, 0, r(cx + O.x), r(cy + O.y), r(cz + O.z), 1]
}

const conf = { high: {} }
const H = 2.6
/** The bedroom: x 0..W, z 0..D. */
const W = 4.6
const D = 4.0

const surface = (category, identifier, dimensions, yaw, center, parentIdentifier = null) => ({
  category,
  identifier,
  confidence: conf,
  dimensions,
  transform: transform(yaw, center[0], center[1], center[2]),
  parentIdentifier,
  completedEdges: [],
  polygonCorners: [],
})

// A wall's local +X runs along it: yaw 0 → +x, π/2 → −z, π → −x, −π/2 → +z.
const wall = (id, yaw, cx, cz, length) => surface({ wall: {} }, id, [length, H, 0], yaw, [cx, H / 2, cz])
const walls = [
  wall('WALL-SOUTH', 0, W / 2, 0, W),
  wall('WALL-EAST', -Math.PI / 2, W, D / 2, D),
  wall('WALL-NORTH', Math.PI, W / 2, D, W),
  wall('WALL-WEST', Math.PI / 2, 0, D / 2, D),
]

const doors = [
  // Entry: north wall, standing open.
  surface({ door: { isOpen: true } }, 'DOOR-ENTRY', [0.9, 2.05, 0], Math.PI, [3.5, 2.05 / 2, D], 'WALL-NORTH'),
]

const windows = [
  // Over the desk (west wall).
  surface({ window: {} }, 'WINDOW-DESK', [1.3, 1.3, 0], Math.PI / 2, [0, 0.85 + 0.65, 1.9], 'WALL-WEST'),
]

/** An object standing on the floor; dims [width, height, depth]; front faces local +Z. */
const obj = (id, cat, dims, yaw, x, z) => ({
  category: { [cat]: {} },
  identifier: id,
  confidence: conf,
  dimensions: dims,
  transform: transform(yaw, x, dims[1] / 2, z),
  parentIdentifier: null,
})

const FACE_NORTH = 0 // front → +z
const FACE_EAST = Math.PI / 2 // front → +x
const FACE_WEST = -Math.PI / 2 // front → −x

const objects = [
  // South wall: the bed's head on the wall, a nightstand beside it.
  obj('OBJ-BED', 'bed', [1.6, 1.05, 2.1], FACE_NORTH, 2.3, 1.05),
  obj('OBJ-NIGHTSTAND', 'storage', [0.5, 0.56, 0.42], FACE_NORTH, 3.4, 0.21),
  // West wall: desk under the window, its chair.
  obj('OBJ-DESK', 'table', [1.2, 0.75, 0.6], FACE_EAST, 0.3, 1.9),
  obj('OBJ-DESK-CHAIR', 'chair', [0.56, 0.86, 0.56], FACE_WEST, 0.95, 1.9),
  // South-east corner: an armchair turned toward the room.
  obj('OBJ-ARMCHAIR', 'chair', [0.8, 0.8, 0.8], -0.75, 4.0, 1.05),
]

const room = {
  _synthetic: true,
  _note: 'Synthetic fixture shaped like RoomPlan CapturedRoom JSON. Not a real scan.',
  identifier: 'DEMO-HOME',
  version: 2,
  walls,
  doors,
  windows,
  openings: [],
  objects,
  floors: [],
  sections: [],
}

writeFileSync(process.argv[2], JSON.stringify(room, null, 2) + '\n')
