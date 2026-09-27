import { z } from 'zod'
import type { Room } from '../domain/schema'

const ShortText = z.string().max(300)
const Id = z.string().min(1).max(300)
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const Vec2 = z.strictObject({ x: z.number(), z: z.number() })
const Vec3 = z.strictObject({ x: z.number(), y: z.number(), z: z.number() })
const Dimensions = z.strictObject({ width: z.number().positive(), height: z.number().positive(), depth: z.number().positive(), source: z.enum(['captured', 'merchant', 'user', 'estimated', 'unknown']) })
const Pose = z.strictObject({ position: Vec3, yaw: z.number() })
const Wall = z.strictObject({ id: Id, start: Vec2, end: Vec2, height: z.number().positive(), thickness: z.number().nonnegative(), exterior: z.boolean() })
const Opening = z.strictObject({ id: Id, kind: z.enum(['door', 'window', 'opening']), wallId: Id, offsetAlongWall: z.number(), bottom: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive() })
const Finishes = z.strictObject({ wall: HexColor, floor: HexColor, accent: HexColor.optional(), floorTexture: z.enum(['woodgrain', 'plain']).optional() })
const ObjectSummary = z.strictObject({ id: Id, category: ShortText.min(1), dimensions: Dimensions, pose: Pose, keep: z.boolean(), lockPlacement: z.boolean(), colors: z.array(HexColor).max(12) })

/** Redacted structural room data only; no raw capture, photos, catalog IDs, offers, names, or prices cross the model boundary. Coordinates are meters in the app's right-handed Y-up frame. */
export const RoomSummary = z.strictObject({
  id: Id,
  floorPolygon: z.array(Vec2).min(3),
  floorBounds: z.strictObject({ minX: z.number(), maxX: z.number(), minZ: z.number(), maxZ: z.number() }),
  walls: z.array(Wall),
  openings: z.array(Opening),
  finishes: Finishes,
  objects: z.array(ObjectSummary),
})
export type RoomSummary = z.infer<typeof RoomSummary>

/** Builds the only room projection allowed in a design request. Never spread a Room into this object: it contains private source evidence and purchase facts. */
export function roomSummary(room: Room): RoomSummary {
  const xs = room.floorPolygon.map((point) => point.x)
  const zs = room.floorPolygon.map((point) => point.z)
  return {
    id: room.id,
    floorPolygon: room.floorPolygon.map(({ x, z }) => ({ x, z })),
    floorBounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
    walls: room.walls.map(({ id, start, end, height, thickness, exterior }) => ({ id, start: { x: start.x, z: start.z }, end: { x: end.x, z: end.z }, height, thickness, exterior })),
    openings: room.openings.map(({ id, kind, wallId, offsetAlongWall, bottom, width, height }) => ({ id, kind, wallId, offsetAlongWall, bottom, width, height })),
    finishes: { wall: room.finishes.wall, floor: room.finishes.floor, ...(room.finishes.accent ? { accent: room.finishes.accent } : {}), ...(room.finishes.floorTexture ? { floorTexture: room.finishes.floorTexture } : {}) },
    objects: room.objects.map((object) => ({
      id: object.id,
      category: object.category,
      dimensions: { width: object.dimensions.width, height: object.dimensions.height, depth: object.dimensions.depth, source: object.dimensions.source },
      pose: { position: { x: object.pose.position.x, y: object.pose.position.y, z: object.pose.position.z }, yaw: object.pose.yaw },
      keep: object.keep,
      lockPlacement: object.lockPlacement,
      colors: [...new Set([
        ...(object.asset.kind === 'recipe' ? Object.values(object.asset.colors ?? {}) : []),
        ...(object.appearance ? [object.appearance.description.color, object.appearance.description.backColor] : []),
      ])].slice(0, 12),
    })),
  }
}

/** Consented, text-only planning input. Budget is integer minor units with explicit ISO currency; baseRevision binds the eventual proposal to the committed room. */
export const RoomDesignRequest = z.strictObject({
  brief: z.string().trim().min(1).max(600),
  consent: z.literal(true),
  budget: z.strictObject({ amountMinor: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) }).optional(),
  baseRevision: z.number().int().nonnegative(),
  roomSummary: RoomSummary,
})
export type RoomDesignRequest = z.infer<typeof RoomDesignRequest>

/** Categories eligible for catalog resolution. The model cannot invent a product identity or an unsupported category. */
export const ROOM_DESIGN_CATEGORIES = [
  'bathtub', 'bed', 'bench', 'bookshelf', 'cabinet', 'chair', 'closet',
  'coffee-table', 'console', 'curtain', 'decor-object', 'desk', 'desk-chair',
  'dining-chair', 'dining-table', 'dishwasher', 'dresser', 'fireplace',
  'floor-lamp', 'lounge-chair', 'mirror', 'nightstand', 'ottoman', 'oven',
  'pillow', 'plant', 'planter', 'refrigerator', 'rug', 'sectional', 'side-table',
  'sink', 'sofa', 'stairs', 'storage', 'stove', 'table', 'table-lamp',
  'television', 'throw', 'toilet', 'vase', 'wall-art', 'washer-dryer',
] as const
const Category = z.enum(ROOM_DESIGN_CATEGORIES)
const Palette = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('preserve') }),
  z.strictObject({ mode: z.literal('darken') }),
  z.strictObject({ mode: z.literal('lighten') }),
  z.strictObject({ mode: z.literal('set'), color: HexColor }),
])
const PlannedItem = z.strictObject({ category: Category, count: z.number().int().min(1).max(12) })

/** Model output is intent only. It contains no coordinates, dimensions, prices, URLs, room fields, or executable commands; deterministic browser code resolves all edits. */
export const RoomDesignIntent = z.strictObject({
  summary: ShortText.min(1),
  palette: Palette.optional(),
  rearrange: z.enum(['none', 'gentle', 'full']),
  removeObjectIds: z.array(Id).max(100),
  replace: z.array(z.strictObject({ objectId: Id, category: Category, count: z.number().int().min(1).max(12) })).max(12),
  add: z.array(PlannedItem).max(12),
  notes: z.array(ShortText.min(1)).max(12),
}).superRefine((intent, ctx) => {
  const total = [...intent.replace, ...intent.add].reduce((sum, item) => sum + item.count, 0)
  if (total > 12) ctx.addIssue({ code: 'custom', message: 'At most 12 planned additions and replacements', path: ['add'] })
})
export type RoomDesignIntent = z.infer<typeof RoomDesignIntent>

/** Minimal server response; all user-visible proposal facts are computed locally from validated intent. */
export const RoomDesignResponse = z.strictObject({ intent: RoomDesignIntent })
export type RoomDesignResponse = z.infer<typeof RoomDesignResponse>

/** Validates bounded model JSON against the current room; throws for stale identities, duplicates, fabricated fields, or oversized output. */
export function parseRoomDesignIntent(value: unknown, room: Room): RoomDesignIntent {
  const json = JSON.stringify(value)
  if (!json || new TextEncoder().encode(json).byteLength > 24 * 1024) throw new Error('Room design intent exceeds 24 KB')
  const intent = RoomDesignIntent.parse(value)
  const known = new Set(room.objects.map((object) => object.id))
  const referenced = [...intent.removeObjectIds, ...intent.replace.map((item) => item.objectId)]
  if (referenced.some((id) => !known.has(id))) throw new Error('Room design intent references an unknown object')
  if (new Set(referenced).size !== referenced.length) throw new Error('Room design intent references an object twice')
  return intent
}
