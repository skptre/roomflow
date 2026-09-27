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

/** Categories in committed catalog inventory eligible for model add/replace requests. Captured structural categories remain in room summaries for ID-based targeting but are never new catalog requests. */
export const ROOM_DESIGN_CATEGORIES = [
  'bed', 'bench', 'bookshelf', 'cabinet', 'coffee-table', 'console', 'curtain',
  'decor-object', 'desk', 'dining-chair', 'dining-table', 'dresser',
  'floor-lamp', 'lounge-chair', 'mirror', 'nightstand', 'ottoman', 'pillow',
  'plant', 'planter', 'rug', 'sectional', 'side-table', 'sofa', 'table-lamp',
  'throw', 'vase', 'wall-art',
] as const
const Category = z.enum(ROOM_DESIGN_CATEGORIES)
const PaletteMode = z.enum(['preserve', 'darken', 'lighten', 'set'])
const Count = z.number().int().min(1).max(12)

/**
 * Model-facing intent shape sent to Gemini as `responseJsonSchema`. Deliberately flat and free of
 * keywords Gemini does not enforce (oneOf/anyOf/allOf/not/const/pattern/minLength/maxLength); ID length,
 * hex syntax, palette/color pairing and cross-list rules are checked by `parseRoomDesignIntent`.
 */
export const RoomDesignIntentWire = z.strictObject({
  palette: z.strictObject({
    mode: PaletteMode.describe('preserve = keep current finishes; darken / lighten = shift existing wall, floor and accent colors; set = paint walls and accents one color'),
    color: z.string().describe('Only with mode "set"; 6-digit hex like "#000000"').optional(),
  }).optional(),
  rearrange: z.enum(['none', 'gentle', 'full']),
  removeObjectIds: z.array(z.string().describe('Exact roomSummary.objects[].id')).max(100),
  replace: z.array(z.strictObject({ objectId: z.string().describe('Exact roomSummary.objects[].id'), category: Category, count: Count })).max(12),
  add: z.array(z.strictObject({ category: Category, count: Count })).max(12),
})

const Palette = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('preserve') }),
  z.strictObject({ mode: z.literal('darken') }),
  z.strictObject({ mode: z.literal('lighten') }),
  z.strictObject({ mode: z.literal('set'), color: z.string().regex(/^#[0-9a-f]{6}$/) }),
])
const PlannedItem = z.strictObject({ category: Category, count: Count })

/** Normalized, validated model intent. It contains no coordinates, dimensions, prices, URLs, room fields, or executable commands; deterministic browser code resolves all edits. */
export const RoomDesignIntent = z.strictObject({
  palette: Palette.optional(),
  rearrange: z.enum(['none', 'gentle', 'full']),
  removeObjectIds: z.array(Id).max(100),
  replace: z.array(z.strictObject({ objectId: Id, category: Category, count: Count })).max(12),
  add: z.array(PlannedItem).max(12),
}).superRefine((intent, ctx) => {
  const total = [...intent.replace, ...intent.add].reduce((sum, item) => sum + item.count, 0)
  if (total > 12) ctx.addIssue({ code: 'custom', message: 'At most 12 planned additions and replacements', path: ['add'] })
})
export type RoomDesignIntent = z.infer<typeof RoomDesignIntent>

/** Browser-authored neutral copy derived from validated intent and allowlisted local category labels, never model prose or offer facts. */
export type RoomDesignDescription = { summary: string; notes: string[] }

const CapturedCategories = new Set<string>([
  ...ROOM_DESIGN_CATEGORIES, 'bathtub', 'chair', 'closet', 'dishwasher',
  'fireplace', 'oven', 'refrigerator', 'sink', 'stairs', 'storage', 'stove',
  'table', 'television', 'toilet', 'washer-dryer',
])

function pluralLabel(category: string, count: number): string {
  const label = category.replaceAll('-', ' ')
  if (count === 1) return label
  if (label.endsWith('ch') || label.endsWith('sh')) return `${label}es`
  if (label.endsWith('y')) return `${label.slice(0, -1)}ies`
  return `${label}s`
}

function joinedTopics(topics: string[]): string {
  if (topics.length < 2) return topics[0] ?? ''
  if (topics.length === 2) return topics.join(' and ')
  return `${topics.slice(0, -1).join(', ')}, and ${topics.at(-1)}`
}

/** Describes requests, not applied changes. Revalidates intent and uses only fixed labels, so hostile local names/categories cannot become displayed claims. */
export function describeRoomDesignIntent(value: RoomDesignIntent, room: Room): RoomDesignDescription {
  const intent = parseRoomDesignIntent(value, room)
  const topics: string[] = []
  const notes: string[] = []
  if (intent.palette && intent.palette.mode !== 'preserve') {
    topics.push('palette')
    if (intent.palette.mode === 'set') notes.push(`Color preference: ${intent.palette.color}.`)
    else notes.push(`${intent.palette.mode === 'darken' ? 'Darker' : 'Lighter'} palette requested.`)
  }
  if (intent.rearrange !== 'none') {
    topics.push('layout')
    notes.push(`${intent.rearrange === 'full' ? 'Full' : 'Gentle'} rearrangement requested.`)
  }
  if (intent.removeObjectIds.length || intent.replace.length || intent.add.length) topics.push('furniture changes')
  if (intent.removeObjectIds.length) {
    const categories = intent.removeObjectIds.map((id) => room.objects.find((object) => object.id === id)?.category)
    const category = categories.every((item) => item === categories[0]) && categories[0] && CapturedCategories.has(categories[0]) ? categories[0] : 'existing item'
    notes.push(`Removal requests: ${intent.removeObjectIds.length} ${pluralLabel(category, intent.removeObjectIds.length)}.`)
  }
  if (intent.replace.length) {
    const replacements = intent.replace.map((item) => `${item.count} ${pluralLabel(item.category, item.count)}`).join(', ')
    notes.push(`Replacement requests for ${intent.replace.length} existing ${intent.replace.length === 1 ? 'item' : 'items'}: ${replacements}.`)
  }
  if (intent.add.length) {
    const additions = intent.add.map((item) => `${item.count} ${pluralLabel(item.category, item.count)}`).join(', ')
    notes.push(`Addition requests: ${additions}.`)
  }
  return { summary: topics.length ? `Requested room design with ${joinedTopics(topics)}.` : 'No room changes requested.', notes }
}

/** Minimal validated server response; all user-visible proposal facts are computed locally from current-room intent. */
export type RoomDesignResponse = { intent: RoomDesignIntent }

/** Parses a response envelope and validates its intent against the current room and 24 KB model limit. */
export function parseRoomDesignResponse(value: unknown, room: { objects: readonly { id: string }[] }): RoomDesignResponse {
  const envelope = z.strictObject({ intent: z.unknown() }).parse(value)
  return { intent: parseRoomDesignIntent(envelope.intent, room) }
}

/** Lowercases a model hex color and expands `#rgb` to `#rrggbb`; returns null for anything else. */
function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  if (short) return `#${short.slice(1).map((digit) => digit + digit).join('')}`.toLowerCase()
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null
}

/**
 * Validates bounded model JSON against the current room; throws for stale identities, duplicates, fabricated fields,
 * or oversized output. Harmless model variations are normalized deterministically: a color with a non-`set` palette
 * mode is dropped, colors are lowercased and `#rgb` expanded (`set` without a valid color throws), and an ID listed
 * in both `removeObjectIds` and `replace` keeps only the replacement.
 */
export function parseRoomDesignIntent(value: unknown, room: { objects: readonly { id: string }[] }): RoomDesignIntent {
  const json = JSON.stringify(value)
  if (!json || new TextEncoder().encode(json).byteLength > 24 * 1024) throw new Error('Room design intent exceeds 24 KB')
  const wire = RoomDesignIntentWire.parse(value)
  let palette: RoomDesignIntent['palette']
  if (wire.palette?.mode === 'set') {
    const color = normalizeHex(wire.palette.color)
    if (!color) throw new Error('Room design palette "set" needs a 6-digit hex color')
    palette = { mode: 'set', color }
  } else if (wire.palette) palette = { mode: wire.palette.mode }
  const replaced = new Set(wire.replace.map((item) => item.objectId))
  const intent = RoomDesignIntent.parse({
    ...(palette ? { palette } : {}),
    rearrange: wire.rearrange,
    removeObjectIds: wire.removeObjectIds.filter((id) => !replaced.has(id)),
    replace: wire.replace,
    add: wire.add,
  })
  const known = new Set(room.objects.map((object) => object.id))
  const referenced = [...intent.removeObjectIds, ...intent.replace.map((item) => item.objectId)]
  if (referenced.some((id) => !known.has(id))) throw new Error('Room design intent references an unknown object')
  if (new Set(referenced).size !== referenced.length) throw new Error('Room design intent references an object twice')
  return intent
}
