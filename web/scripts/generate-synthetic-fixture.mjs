// Generates src/fixtures/synthetic-bedroom.roomplan.json (synthetic, not a real scan).
// Usage: node scripts/generate-synthetic-fixture.mjs src/fixtures/synthetic-bedroom.roomplan.json
// Room laid out in "design" coords (floor y=0, x 0..4, z 0..3.5), then shifted
// by a native offset so the importer's recentering is exercised.
import { writeFileSync } from 'node:fs'

const O = { x: 1.2, y: -1.4, z: 0.7 }
const r = (n) => Math.round(n * 1e6) / 1e6

// Column-major transform for a yaw about +Y and a center (design coords).
function transform(yaw, cx, cy, cz) {
  const c = r(Math.cos(yaw)) + 0
  const s = r(Math.sin(yaw)) + 0
  return [c, 0, -s + 0, 0, 0, 1, 0, 0, s, 0, c, 0, r(cx + O.x), r(cy + O.y), r(cz + O.z), 1]
}

const conf = { high: {} }
const H = 2.6
const walls = [
  { identifier: 'WALL-A-SOUTH', yaw: 0, c: [2, 0], len: 4 },
  { identifier: 'WALL-B-EAST', yaw: -Math.PI / 2, c: [4, 1.75], len: 3.5 },
  { identifier: 'WALL-C-NORTH', yaw: Math.PI, c: [2, 3.5], len: 4 },
  { identifier: 'WALL-D-WEST', yaw: Math.PI / 2, c: [0, 1.75], len: 3.5 },
].map((w) => ({
  category: { wall: {} },
  identifier: w.identifier,
  confidence: conf,
  dimensions: [w.len, H, 0],
  transform: transform(w.yaw, w.c[0], H / 2, w.c[1]),
  parentIdentifier: null,
  completedEdges: [],
  polygonCorners: [],
}))

const doors = [
  {
    category: { door: { isOpen: true } },
    identifier: 'DOOR-1',
    confidence: conf,
    dimensions: [0.9, 2.05, 0],
    transform: transform(0, 0.9, 2.05 / 2, 0),
    parentIdentifier: 'WALL-A-SOUTH',
    completedEdges: [],
    polygonCorners: [],
  },
]

const windows = [
  {
    category: { window: {} },
    identifier: 'WINDOW-1',
    confidence: conf,
    dimensions: [1.2, 1.2, 0],
    transform: transform(-Math.PI / 2, 4, 0.9 + 0.6, 1.8),
    parentIdentifier: null,
    completedEdges: [],
    polygonCorners: [],
  },
]

const obj = (id, cat, dims, yaw, x, z) => ({
  category: { [cat]: {} },
  identifier: id,
  confidence: conf,
  dimensions: dims,
  transform: transform(yaw, x, dims[1] / 2, z),
  parentIdentifier: null,
})

const objects = [
  // Fronts face local +Z: the bed's head (local -Z) is against the north wall,
  // the desk's back against the east wall, and the chair faces the desk.
  obj('OBJ-BED', 'bed', [1.6, 0.95, 2.1], Math.PI, 1.4, 2.45),
  obj('OBJ-DESK', 'table', [1.2, 0.75, 0.6], -Math.PI / 2, 3.7, 1.8),
  obj('OBJ-CHAIR', 'chair', [0.5, 0.9, 0.5], Math.PI / 2, 3.15, 1.8),
  obj('OBJ-STORAGE', 'storage', [1.0, 0.8, 0.45], 0, 2.6, 0.25),
]

const room = {
  _synthetic: true,
  _note: 'Synthetic fixture shaped like RoomPlan CapturedRoom JSON. Not a real scan.',
  identifier: 'SYNTHETIC-BEDROOM',
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
