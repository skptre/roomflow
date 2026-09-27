/**
 * The app's sample room: a small synthetic bedroom scan (demo-home.roomplan.json, from
 * scripts/generate-demo-home.mjs) run through the real RoomPlan importer, then furnished as
 * someone's own room. Every piece is already theirs (captured or owned), so the purchase
 * subtotal starts at $0 and the demo shows swapping in real products.
 *
 * Kept deliberately sparse so each piece is easy to pick and move: five scanned pieces, and one
 * of each kind of decor. Furnishing after import names the scanned pieces the way a person would
 * (RoomPlan only knows "storage", "table", "chair"), draws them with the chunky sample-room
 * recipes below, sets the room's finishes, and adds the decor. Positions are in the generator's
 * design frame (floor corner at the origin, x east, z north, meters), moved into the app frame
 * with the room's own floor bounds.
 */
import demoScan from './demo-home.roomplan.json?raw'
import { registerRecipes } from '../blocks/registry'
import type { Recipe } from '../blocks/recipe'
import { windowSpot } from '../domain/layout'
import type { Room, RoomObject, Vec2 } from '../domain/schema'
import { parseRoomPlanJson, type ImportOptions, type ImportResult } from '../import/roomplan'

/** The palette: sage walls and sand carpet, oak and cream furniture, terracotta accents. */
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

/** Soft sage walls, sand carpet. */
const FINISHES = { wall: '#cfd6c4', floor: '#d8c6ab', floorTexture: 'plain' } as const

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
  recipe('desk', 'table', { drawer: '1', legStyle: 'tapered', ...CHUNKY }, { topThickness: 0.045, legInset: 0.03 }, { top: OAK, base: OAK }),
  recipe('desk-chair', 'dining-chair', { seat: 'upholstered', back: 'upholstered', legStyle: 'tapered', ...CHUNKY }, {}, { seat: OATMEAL, frame: OAK }),
  recipe('armchair', 'chair', { shell: 'barrel', back: 'pillow', base: 'tapered-legs', ...CHUNKY }, { legHeight: 0.1 }, { upholstery: SAGE, legs: WALNUT }),
  recipe('table-lamp', 'lamp', { shade: 'drum', stem: 'stacked', base: 'round' }, {}, { shade: LINEN, stem: BRASS, base: TERRACOTTA }),
  recipe('art', 'art', { frame: 'thin', motif: 'arches' }, {}, { frame: OAK, canvas: CREAM, accent: TERRACOTTA, accent2: OCHRE }),
  recipe('rug', 'rug', { shape: 'rect', edge: 'fringe' }, {}, { top: '#d4a184', fringe: CREAM }),
  recipe('plant', 'planter', { pot: 'taper', plant: 'fiddle' }, {}, { pot: CERAMIC }),
  recipe('curtain', 'curtain', { rod: 'wood', draw: 'open' }, {}, { fabric: '#efe8dc', rod: WALNUT }),
]

registerRecipes(DEMO_RECIPES)

/** How a scanned piece is named and drawn in the sample room. */
const LABELS: Readonly<Record<string, { name: string; category: string; recipe: string }>> = {
  'OBJ-BED': { name: 'Bed', category: 'bed', recipe: 'bed' },
  'OBJ-NIGHTSTAND': { name: 'Nightstand', category: 'nightstand', recipe: 'nightstand' },
  'OBJ-DESK': { name: 'Desk', category: 'desk', recipe: 'desk' },
  'OBJ-DESK-CHAIR': { name: 'Desk chair', category: 'desk-chair', recipe: 'desk-chair' },
  'OBJ-ARMCHAIR': { name: 'Armchair', category: 'lounge-chair', recipe: 'armchair' },
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

/** The nightstand's scanned height: the lamp stands on it. */
const NIGHTSTAND_TOP = 0.56
/** Gap between a hung piece's back and the wall surface (as wallSpot in domain/layout.ts). */
const HANG_GAP = 0.002

/** One of each: a lamp, a painting, a rug, a plant (curtains are hung by the layout rules below). */
const DECOR: readonly Decor[] = [
  { id: 'DECOR-LAMP', name: 'Table lamp', category: 'table-lamp', recipe: 'table-lamp', size: [0.32, 0.5, 0.32], at: [3.4, 0.21], y: NIGHTSTAND_TOP },
  { id: 'DECOR-ART', name: 'Painting', category: 'wall-art', recipe: 'art', size: [1.0, 0.72, 0.035], at: [2.3, 0.035 / 2 + HANG_GAP], y: 1.28 },
  { id: 'DECOR-RUG', name: 'Rug', category: 'rug', recipe: 'rug', size: [2.4, 0.012, 1.7], at: [2.3, 2.05] },
  { id: 'DECOR-PLANT', name: 'Fiddle-leaf fig', category: 'plant', recipe: 'plant', size: [0.5, 1.55, 0.5], at: [0.35, 0.35] },
]

/** Open the sample room: import the synthetic scan, then name, finish and furnish it. */
export function demoRoom(options: ImportOptions = {}): ImportResult {
  const result = parseRoomPlanJson(demoScan, { name: 'Sample bedroom', ...options })
  if (!result.ok) return result
  return { ...result, room: furnish(result.room) }
}

/** Name the scanned pieces, draw them with the sample recipes, set the finishes, and add the decor. */
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
  const furnished: Room = { ...room, objects: [...scanned, ...decor], finishes: { ...room.finishes, ...FINISHES } }
  // Curtains hang where the layout rules put them: centered on the window, rod above it.
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
