// Generates src/fixtures/demo-home.roomplan.json: the app's sample room (synthetic, not a real scan).
// Usage (from web/): node scripts/generate-demo-home.mjs src/fixtures/demo-home.roomplan.json
//
// Two rooms in an L: a 4.8 × 4.2 m bedroom and a 2.6 × 3.2 m bathroom beside it, joined by a
// door in the wall between them. Shaped like RoomPlan CapturedRoom JSON so it goes through the
// same importer as a real scan. Laid out in "design" coords (floor y = 0, x west→east, z
// south→north, meters), then shifted by a native offset so the importer's recentering is
// exercised. The default camera looks in from the north-east, so the south and west walls are
// the ones it sees: the bed's headboard, the desk and dresser, and the bathroom's tub and vanity
// are on them. The wall between the rooms faces the camera, so the cutaway drops it to a stub.
// Finishes per room and the decor a scan can't detect are added after import: src/fixtures/demoRoom.ts.
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
/** Bedroom: x 0..BED_W, z 0..BED_D. Bathroom: x BED_W..BATH_E, z 0..BATH_D. */
const BED_W = 4.8
const BED_D = 4.2
const BATH_E = 7.4
const BATH_D = 3.2

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
  wall('WALL-SOUTH-BED', 0, BED_W / 2, 0, BED_W),
  wall('WALL-SOUTH-BATH', 0, (BED_W + BATH_E) / 2, 0, BATH_E - BED_W),
  wall('WALL-EAST-BATH', -Math.PI / 2, BATH_E, BATH_D / 2, BATH_D),
  wall('WALL-NORTH-BATH', Math.PI, (BED_W + BATH_E) / 2, BATH_D, BATH_E - BED_W),
  wall('WALL-EAST-BED', -Math.PI / 2, BED_W, (BATH_D + BED_D) / 2, BED_D - BATH_D),
  wall('WALL-NORTH-BED', Math.PI, BED_W / 2, BED_D, BED_W),
  wall('WALL-WEST', Math.PI / 2, 0, BED_D / 2, BED_D),
  // Between the rooms (floor on both sides). Runs north → south so its local +Z, where a door
  // on it swings, points east into the bathroom.
  wall('WALL-BETWEEN', Math.PI / 2, BED_W, BATH_D / 2, BATH_D),
]

const doors = [
  // Entry: north wall of the bedroom, standing open.
  surface({ door: { isOpen: true } }, 'DOOR-ENTRY', [0.9, 2.05, 0], Math.PI, [3.6, 2.05 / 2, BED_D], 'WALL-NORTH-BED'),
  // Bedroom ↔ bathroom, near the front, standing open into the bathroom.
  surface({ door: { isOpen: true } }, 'DOOR-BATH', [0.8, 2.0, 0], Math.PI / 2, [BED_W, 1.0, 2.6], 'WALL-BETWEEN'),
]

const windows = [
  // Over the desk (west wall).
  surface({ window: {} }, 'WINDOW-DESK', [1.3, 1.3, 0], Math.PI / 2, [0, 0.85 + 0.65, 1.4], 'WALL-WEST'),
  // Over the tub (bathroom's south wall).
  surface({ window: {} }, 'WINDOW-BATH', [1.0, 0.85, 0], 0, [5.75, 1.25 + 0.425, 0], 'WALL-SOUTH-BATH'),
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
  // Bedroom, south wall: the bed's head on the wall, a nightstand each side.
  obj('OBJ-BED', 'bed', [1.6, 1.05, 2.1], FACE_NORTH, 2.2, 1.05),
  obj('OBJ-NIGHTSTAND-L', 'storage', [0.5, 0.56, 0.42], FACE_NORTH, 0.85, 0.21),
  obj('OBJ-NIGHTSTAND-R', 'storage', [0.5, 0.56, 0.42], FACE_NORTH, 3.55, 0.21),
  // Bedroom, west wall: desk under the window with its chair, then the dresser.
  obj('OBJ-DESK', 'table', [1.2, 0.75, 0.6], FACE_EAST, 0.3, 1.4),
  obj('OBJ-DESK-CHAIR', 'chair', [0.56, 0.86, 0.56], FACE_WEST, 0.95, 1.4),
  obj('OBJ-DRESSER', 'storage', [1.0, 0.82, 0.46], FACE_EAST, 0.23, 3.1),
  // Bedroom, south-east corner: an armchair turned toward the bed.
  obj('OBJ-ARMCHAIR', 'chair', [0.8, 0.8, 0.8], -1.1, 4.15, 1.2),
  // Bathroom: tub along the south wall under its window, vanity in the corner, toilet on the east wall.
  obj('OBJ-TUB', 'bathtub', [1.7, 0.58, 0.76], FACE_NORTH, 5.76, 0.4),
  obj('OBJ-VANITY', 'sink', [0.7, 0.86, 0.48], FACE_NORTH, 7.0, 0.25),
  obj('OBJ-TOILET', 'toilet', [0.4, 0.78, 0.68], FACE_WEST, 7.05, 1.6),
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
