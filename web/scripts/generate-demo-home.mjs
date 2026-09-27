// Generates src/fixtures/demo-home.roomplan.json: the app's sample room (synthetic, not a real scan).
// Usage (from web/): node scripts/generate-demo-home.mjs src/fixtures/demo-home.roomplan.json
//
// The original sample bedroom (synthetic-bedroom.roomplan.json), a little bigger: 4.4 × 3.8 m with
// the bed's head on the north wall, a dresser on the south wall, and the desk moved off the
// window wall to the west wall so nothing stands under the curtains. Shaped like RoomPlan
// CapturedRoom JSON so it goes through the same importer as a real scan. Laid out in "design"
// coords (floor y = 0, x west→east, z south→north, meters), then shifted by a native offset so
// the importer's recentering is exercised. The few decor pieces a scan can't detect are added
// after import: src/fixtures/demoRoom.ts.
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
const W = 4.4
const D = 3.8

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
  // South wall, standing open (as in the original room).
  surface({ door: { isOpen: true } }, 'DOOR-ENTRY', [0.9, 2.05, 0], 0, [1.75, 2.05 / 2, 0], 'WALL-SOUTH'),
]

const windows = [
  // East wall (as in the original room); nothing stands under it.
  surface({ window: {} }, 'WINDOW-EAST', [1.2, 1.2, 0], -Math.PI / 2, [W, 0.9 + 0.6, 1.9], 'WALL-EAST'),
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
const FACE_SOUTH = Math.PI // front → −z
const FACE_WEST = -Math.PI / 2 // front → −x

const objects = [
  // The bed's head on the north wall.
  obj('OBJ-BED', 'bed', [1.6, 1.05, 2.1], FACE_SOUTH, 1.55, D - 1.05),
  // West wall: desk and its chair.
  obj('OBJ-DESK', 'table', [1.2, 0.75, 0.6], FACE_EAST, 0.3, 1.05),
  obj('OBJ-DESK-CHAIR', 'chair', [0.56, 0.86, 0.56], FACE_WEST, 0.95, 1.05),
  // South wall: the dresser.
  obj('OBJ-DRESSER', 'storage', [1.0, 0.82, 0.46], FACE_NORTH, 3.0, 0.23),
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
