/**
 * The app's sample room: a synthetic two-room scan (demo-home.roomplan.json, from
 * scripts/generate-demo-home.mjs; a bedroom and a bathroom joined by a door) run through the
 * real RoomPlan importer, then furnished as someone's own home. Every piece is already theirs
 * (captured or owned), so the purchase subtotal starts at $0 and the demo shows swapping in
 * real products.
 *
 * Furnishing after import: names the scanned pieces the way a person would (RoomPlan only
 * knows "storage", "table", "chair"), draws them with the chunky sample-room recipes below,
 * gives the bathroom its own zone (white tile, white walls; the bedroom keeps the room's
 * finishes, so looks restyle it), and adds the decor a scan can't detect. Positions are in the
 * generator's design frame (floor corner at the origin, x east, z north, meters), moved into
 * the app frame with the room's own floor bounds.
 */
import demoScan from './demo-home.roomplan.json?raw'
import { registerRecipes } from '../blocks/registry'
import type { Recipe } from '../blocks/recipe'
import { windowSpot } from '../domain/layout'
import type { Room, RoomObject, Vec2 } from '../domain/schema'
import { parseRoomPlanJson, type ImportOptions, type ImportResult } from '../import/roomplan'

/** The palette: sage walls and sand carpet, oak and cream furniture, terracotta and ochre accents. */
const OAK = '#bf8f62'
const WALNUT = '#7a5439'
const OATMEAL = '#d9ccb6'
const LINEN = '#f4efe6'
const PILLOW = '#e8ddcb'
const CREAM = '#efe7da'
const TERRACOTTA = '#c2704f'
const SAGE = '#98a887'
const OCHRE = '#d9a45b'
const BRASS = '#b99058'
const CERAMIC = '#efe9df'
const PORCELAIN = '#f7f6f2'

/** Bedroom (the room's own finishes): soft sage walls, sand carpet. */
const BEDROOM = { wall: '#cfd6c4', floor: '#d8c6ab', floorTexture: 'plain' } as const
/** Bathroom zone: white walls, white tile. */
const BATHROOM = { wall: '#f6f4ef', floor: '#f1efe9', floorTexture: 'tile' } as const
/** The bathroom's floor in design coords (x 4.8..7.4, z 0..3.2; see the generator). */
const BATHROOM_FLOOR: readonly [number, number][] = [
  [4.8, 0],
  [7.4, 0],
  [7.4, 3.2],
  [4.8, 3.2],
]

const recipe = (id: string, family: string, blocks: Record<string, string>, params: Record<string, number>, defaultColors: Record<string, string>): Recipe => ({
  schemaVersion: 1,
  id: `demo:${id}`,
  family,
  blocks,
  params,
  defaultColors,
  tier: 'default',
})

const CHUNKY = { proportion: 'chunky' }

/** Recipes for the sample room's pieces: chunky proportions, one coordinated palette. */
export const DEMO_RECIPES: readonly Recipe[] = [
  recipe('bed', 'bed', { headboard: 'rounded', frame: 'upholstered', pillows: '4', throw: 'folded', ...CHUNKY }, { frameHeight: 0.3, mattressThickness: 0.26 }, { frame: OATMEAL, headboard: OATMEAL, bedding: LINEN, pillows: PILLOW, throw: TERRACOTTA }),
  recipe('nightstand', 'storage', { layout: 'drawers', handles: 'knob', base: 'legs', legStyle: 'tapered', ...CHUNKY }, { rows: 2, cols: 1, baseHeight: 0.12, topThickness: 0.04 }, { body: OAK, fronts: CREAM, base: OAK, handles: BRASS }),
  recipe('dresser', 'storage', { layout: 'drawers', handles: 'knob', base: 'legs', legStyle: 'tapered', ...CHUNKY }, { rows: 3, cols: 2, baseHeight: 0.1, topThickness: 0.045 }, { body: OAK, fronts: CREAM, base: OAK, handles: BRASS }),
  recipe('desk', 'table', { drawer: '1', legStyle: 'tapered', ...CHUNKY }, { topThickness: 0.045, legInset: 0.03 }, { top: OAK, base: OAK }),
  recipe('desk-chair', 'dining-chair', { seat: 'upholstered', back: 'upholstered', legStyle: 'tapered', ...CHUNKY }, {}, { seat: OATMEAL, frame: OAK }),
  recipe('armchair', 'chair', { shell: 'barrel', back: 'pillow', base: 'tapered-legs', ...CHUNKY }, { legHeight: 0.1 }, { upholstery: SAGE, legs: WALNUT }),
  recipe('bench', 'chair', { form: 'bench', base: 'tapered-legs', ...CHUNKY }, { cushionThickness: 0.2, legHeight: 0.2 }, { upholstery: OCHRE, legs: WALNUT }),
  recipe('vanity', 'sink', { base: 'vanity' }, {}, { cabinet: OAK, counter: PORCELAIN }),
  recipe('table-lamp', 'lamp', { shade: 'drum', stem: 'stacked', base: 'round' }, {}, { shade: LINEN, stem: BRASS, base: TERRACOTTA }),
  recipe('floor-lamp', 'lamp', { shade: 'drum', stem: 'straight', base: 'disc' }, {}, { shade: LINEN, stem: BRASS, base: WALNUT }),
  recipe('art-arches', 'art', { frame: 'thin', motif: 'arches' }, {}, { frame: OAK, canvas: CREAM, accent: TERRACOTTA, accent2: OCHRE }),
  recipe('art-sun', 'art', { frame: 'thin', motif: 'sun' }, {}, { frame: WALNUT, canvas: '#f3e6d2', accent: TERRACOTTA, accent2: SAGE }),
  recipe('mirror', 'mirror', { shape: 'round', frame: 'thin' }, {}, { frame: BRASS }),
  recipe('rug', 'rug', { shape: 'rect', edge: 'fringe' }, {}, { top: '#d4a184', fringe: CREAM }),
  recipe('bath-mat', 'rug', { shape: 'rect', edge: 'none' }, {}, { top: SAGE }),
  recipe('plant-fiddle', 'planter', { pot: 'taper', plant: 'fiddle' }, {}, { pot: CERAMIC }),
  recipe('plant-bush', 'planter', { pot: 'bowl', plant: 'bush' }, {}, { pot: TERRACOTTA }),
  recipe('plant-trailing', 'planter', { pot: 'cylinder', plant: 'trailing' }, {}, { pot: CERAMIC }),
  recipe('plant-snake', 'planter', { pot: 'cylinder', plant: 'snake' }, {}, { pot: TERRACOTTA }),
  recipe('vase', 'vase', { profile: 'amphora' }, {}, { body: TERRACOTTA }),
  recipe('curtain', 'curtain', { rod: 'wood', draw: 'open' }, {}, { fabric: '#efe8dc', rod: WALNUT }),
]

registerRecipes(DEMO_RECIPES)

/** How a scanned piece is named and drawn in the sample room. */
const LABELS: Readonly<Record<string, { name: string; category: string; recipe: string }>> = {
  'OBJ-BED': { name: 'Bed', category: 'bed', recipe: 'bed' },
  'OBJ-NIGHTSTAND-L': { name: 'Nightstand', category: 'nightstand', recipe: 'nightstand' },
  'OBJ-NIGHTSTAND-R': { name: 'Nightstand', category: 'nightstand', recipe: 'nightstand' },
  'OBJ-DESK': { name: 'Desk', category: 'desk', recipe: 'desk' },
  'OBJ-DESK-CHAIR': { name: 'Desk chair', category: 'desk-chair', recipe: 'desk-chair' },
  'OBJ-DRESSER': { name: 'Dresser', category: 'dresser', recipe: 'dresser' },
  'OBJ-ARMCHAIR': { name: 'Armchair', category: 'lounge-chair', recipe: 'armchair' },
  'OBJ-VANITY': { name: 'Vanity', category: 'sink', recipe: 'vanity' },
}

type Decor = {
  id: string
  name: string
  category: string
  recipe: string
  /** [width, height, depth] in meters. */
  size: [number, number, number]
  /** Design-frame position of the bottom center, and its height above the floor. */
  at: [number, number]
  y?: number
  /** Front direction: local +Z turns to (sin yaw, cos yaw). */
  yaw?: number
}

const EAST = Math.PI / 2

/** Surface heights of the pieces decor stands on (their scanned heights). */
const NIGHTSTAND_TOP = 0.56
const DESK_TOP = 0.75
const DRESSER_TOP = 0.82
/** Gap between a hung piece's back and the wall surface (as wallSpot in domain/layout.ts). */
const HANG_GAP = 0.002

const DECOR: readonly Decor[] = [
  // Bedroom, south wall.
  { id: 'DECOR-LAMP-L', name: 'Table lamp', category: 'table-lamp', recipe: 'table-lamp', size: [0.32, 0.5, 0.32], at: [0.85, 0.21], y: NIGHTSTAND_TOP },
  { id: 'DECOR-LAMP-R', name: 'Table lamp', category: 'table-lamp', recipe: 'table-lamp', size: [0.32, 0.5, 0.32], at: [3.55, 0.21], y: NIGHTSTAND_TOP },
  { id: 'DECOR-ART-BED', name: 'Painting', category: 'wall-art', recipe: 'art-arches', size: [1.0, 0.72, 0.035], at: [2.2, 0.035 / 2 + HANG_GAP], y: 1.28 },
  { id: 'DECOR-RUG', name: 'Rug', category: 'rug', recipe: 'rug', size: [2.4, 0.012, 1.7], at: [2.2, 1.95] },
  { id: 'DECOR-BENCH', name: 'Bench', category: 'bench', recipe: 'bench', size: [1.2, 0.46, 0.4], at: [2.2, 2.36] },
  { id: 'DECOR-PLANT-CORNER', name: 'Fiddle-leaf fig', category: 'plant', recipe: 'plant-fiddle', size: [0.5, 1.55, 0.5], at: [0.3, 0.3] },
  { id: 'DECOR-FLOOR-LAMP', name: 'Floor lamp', category: 'floor-lamp', recipe: 'floor-lamp', size: [0.42, 1.58, 0.42], at: [4.5, 0.3] },
  // Bedroom, west wall.
  { id: 'DECOR-PLANT-DESK', name: 'Trailing plant', category: 'plant', recipe: 'plant-trailing', size: [0.2, 0.26, 0.2], at: [0.22, 1.86], y: DESK_TOP },
  { id: 'DECOR-VASE', name: 'Vase', category: 'vase', recipe: 'vase', size: [0.16, 0.3, 0.16], at: [0.23, 2.78], y: DRESSER_TOP },
  { id: 'DECOR-ART-DRESSER', name: 'Print', category: 'wall-art', recipe: 'art-sun', size: [0.55, 0.72, 0.03], at: [0.03 / 2 + HANG_GAP, 3.1], y: 1.22, yaw: EAST },
  { id: 'DECOR-PLANT-FRONT', name: 'Plant', category: 'plant', recipe: 'plant-bush', size: [0.5, 0.85, 0.5], at: [0.35, 3.9] },
  // Bathroom.
  { id: 'DECOR-MIRROR', name: 'Round mirror', category: 'mirror', recipe: 'mirror', size: [0.55, 0.55, 0.03], at: [7.0, 0.03 / 2 + HANG_GAP], y: 1.15 },
  { id: 'DECOR-BATH-MAT', name: 'Bath mat', category: 'rug', recipe: 'bath-mat', size: [0.8, 0.012, 0.5], at: [5.76, 1.1] },
  { id: 'DECOR-PLANT-BATH', name: 'Snake plant', category: 'plant', recipe: 'plant-snake', size: [0.3, 0.65, 0.3], at: [7.15, 2.95] },
]

/** Open the sample room: import the synthetic scan, then name, finish and furnish it. */
export function demoRoom(options: ImportOptions = {}): ImportResult {
  const result = parseRoomPlanJson(demoScan, { name: 'Sample home', ...options })
  if (!result.ok) return result
  return { ...result, room: furnish(result.room) }
}

/** Name the scanned pieces, draw them with the sample recipes, finish both rooms, and add the decor. */
export function furnish(room: Room): Room {
  const minX = Math.min(...room.floorPolygon.map((p) => p.x))
  const minZ = Math.min(...room.floorPolygon.map((p) => p.z))
  const toApp = ([x, z]: readonly [number, number]): Vec2 => ({ x: minX + x, z: minZ + z })
  const scanned = room.objects.map((object): RoomObject => {
    const label = Object.hasOwn(LABELS, object.id) ? LABELS[object.id]! : null
    return label ? { ...object, name: label.name, category: label.category, asset: { kind: 'recipe', recipeId: `demo:${label.recipe}` } } : object
  })
  const decor = DECOR.map(
    (item): RoomObject => ({
      id: item.id,
      name: item.name,
      category: item.category,
      sourceKind: 'owned',
      dimensions: { width: item.size[0], height: item.size[1], depth: item.size[2], source: 'estimated' },
      pose: { position: { ...toApp(item.at), y: item.y ?? 0 }, yaw: item.yaw ?? 0 },
      asset: { kind: 'recipe', recipeId: `demo:${item.recipe}` },
      fidelity: 'approximate',
      quantity: 1,
      keep: false,
      lockPlacement: false,
    }),
  )
  const furnished: Room = {
    ...room,
    objects: [...scanned, ...decor],
    finishes: { ...room.finishes, ...BEDROOM },
    zones: [{ id: 'zone-bathroom', name: 'Bathroom', polygon: BATHROOM_FLOOR.map(toApp), finishes: { ...BATHROOM } }],
  }
  // Curtains hang where the layout rules put them: centered on the desk window, rod above it.
  const curtain = windowSpot(furnished, {
    id: 'DECOR-CURTAIN',
    name: 'Curtains',
    category: 'curtain',
    sourceKind: 'owned',
    dimensions: { width: 1.9, height: 2.28, depth: 0.08, source: 'estimated' },
    pose: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
    asset: { kind: 'recipe', recipeId: 'demo:curtain' },
    fidelity: 'approximate',
    quantity: 1,
    keep: false,
    lockPlacement: false,
  })
  return curtain ? { ...furnished, objects: [...furnished.objects, curtain] } : furnished
}
