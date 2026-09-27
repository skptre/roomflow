/**
 * RoomPlan import boundary. The only place native capture coordinates are
 * converted into the application frame (see src/domain/units.ts and
 * docs/contracts/room-import.md).
 *
 * Input: the raw JSON of an Apple RoomPlan `CapturedRoom` (JSONEncoder output).
 * Output: a validated Room, recentered so the floor outline's bounding box is
 * centered on the origin and the floor sits at y = 0. RoomPlan already uses
 * meters and a right-handed, Y-up frame, so only a translation is applied.
 */
import { z } from 'zod'
import { recipeAsset } from '../blocks/registry'
import { pointInPolygon } from '../domain/geometry'
import { inwardNormal } from '../domain/layout'
import { Room, type AssetRef, type Opening, type RoomObject, type Vec2, type Wall } from '../domain/schema'
import { poseFromColumnMajor, type Vec3 } from '../domain/units'

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024
export const MAX_IMPORT_OBJECTS = 500
/** Rooms have tens of walls; the cap also bounds the outline search (cubic in wall count). */
export const MAX_IMPORT_WALLS = 200
const MAX_SURFACES_PER_LIST = 1000

/** Wall endpoints closer than this are treated as the same corner. */
const CORNER_TOLERANCE = 0.15
/** An opening without a parent must lie within this distance of a wall's line. */
const OPENING_WALL_DISTANCE = 0.2
/** Max |sin| between opening and wall directions to count as parallel (~6°). */
const PARALLEL_TOLERANCE = 0.1
/** Min horizontal length of a transform's local X axis; below this the surface isn't upright. */
const MIN_HORIZONTAL_AXIS = 0.5
/** Smallest floor area (m²) accepted as a room. */
const MIN_FLOOR_AREA = 0.5
/** Upper bound on corners per RoomPlan floor polygon; real floors have a handful. */
const MAX_FLOOR_CORNERS = 1000

/** A `storage` thinner than this and at least CLOSET_MIN_HEIGHT tall is a built-in closet seen only from its doors. */
const CLOSET_MAX_DEPTH = 0.1
const CLOSET_MIN_HEIGHT = 1.2
/** Visual depth for closet doors (RoomPlan reports ~0; the true depth behind the doors is unknown). */
const CLOSET_DEPTH = 0.04
/** A door on the closet's wall is a closet door when at least this fraction of its width lies within the closet. */
const CLOSET_DOOR_OVERLAP = 0.5
/** Closet bottoms within this of the floor are snapped onto it (they stand on the floor). */
const CLOSET_FLOOR_SNAP = 0.1
/** Gap between a closet's back and the wall surface, as for hung items (see wallSpot in domain/layout.ts). */
const CLOSET_WALL_GAP = 0.002
/** Half the drawn thickness of a zero-depth interior partition (scene/wallGeometry.ts DEFAULT_WALL_THICKNESS / 2). */
const PARTITION_HALF_THICKNESS = 0.06

const DEFAULT_FINISHES = { wall: '#f4efe8', floor: '#c9a882' } as const

export type ImportOptions = {
  /** ISO timestamp recorded as importedAt (defaults to the current time). */
  now?: string
  id?: string
  name?: string
}

export type ImportResult = { ok: true; room: Room; warnings: string[] } | { ok: false; error: string }

/** RoomPlan's object categories (CapturedRoom.Object.Category) mapped to app categories. */
const OBJECT_CATEGORIES: Record<string, string> = {
  bathtub: 'bathtub',
  bed: 'bed',
  chair: 'chair',
  dishwasher: 'dishwasher',
  fireplace: 'fireplace',
  oven: 'oven',
  refrigerator: 'refrigerator',
  sink: 'sink',
  sofa: 'sofa',
  stairs: 'stairs',
  storage: 'storage',
  stove: 'stove',
  table: 'table',
  television: 'television',
  toilet: 'toilet',
  washerDryer: 'washer-dryer',
}

/** Lookup that ignores inherited keys: scan text like "constructor" must never match Object.prototype. */
function own(table: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined
}

const Finite = z.number() // Zod 4 rejects NaN and ±Infinity.
const Transform = z.union([z.array(Finite).length(16), z.array(z.array(Finite).length(4)).length(4)])
const Category = z.union([z.string(), z.record(z.string(), z.unknown())])

const RawSurface = z
  .object({
    identifier: z.string().min(1),
    dimensions: z.array(Finite).length(3),
    transform: Transform,
    category: Category.optional(),
    parentIdentifier: z.string().nullish(),
    confidence: z.unknown().optional(),
  })
  .superRefine((surface, ctx) => {
    const m = flatten(surface.transform)
    if (Math.hypot(m[0]!, m[2]!) < MIN_HORIZONTAL_AXIS) {
      ctx.addIssue({ code: 'custom', path: ['transform'], message: 'surface is not upright' })
    }
  })
type RawSurface = z.infer<typeof RawSurface>

const SurfaceList = z.array(RawSurface).max(MAX_SURFACES_PER_LIST)

/**
 * RoomPlan floor surface (iOS 17+). `polygonCorners` are in the surface's local frame:
 * native = transform · (x, y, z, 1). Verified against real scans: corners land on wall ends.
 */
const RawFloor = z.object({
  transform: Transform,
  polygonCorners: z.array(z.array(Finite).length(3)).min(3).max(MAX_FLOOR_CORNERS),
})
const FloorList = z.array(RawFloor).max(MAX_SURFACES_PER_LIST)

const RawScan = z.object({
  identifier: z.string().optional(),
  _synthetic: z.boolean().optional(),
  walls: SurfaceList,
  doors: SurfaceList.default([]),
  windows: SurfaceList.default([]),
  openings: SurfaceList.default([]),
  objects: z.array(RawSurface).default([]),
})

function fail(error: string): ImportResult {
  return { ok: false, error }
}

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .map((part, index) => (typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${String(part)}`))
    .join('')
}

/** Byte size of the text as UTF-8, computed exactly only when it could matter. */
function exceedsByteLimit(text: string): boolean {
  if (text.length > MAX_IMPORT_BYTES) return true
  // A UTF-16 code unit encodes to at most 3 UTF-8 bytes.
  if (text.length * 3 <= MAX_IMPORT_BYTES) return false
  return new TextEncoder().encode(text).length > MAX_IMPORT_BYTES
}

function flatten(transform: z.infer<typeof Transform>): number[] {
  // Nested form lists the four columns, so concatenating keeps column-major order.
  return Array.isArray(transform[0]) ? (transform as number[][]).flat() : (transform as number[])
}

function categoryName(category: RawSurface['category']): string | undefined {
  if (category === undefined) return undefined
  if (typeof category === 'string') return category
  return Object.keys(category)[0]
}

/** RoomPlan's door category carries whether the door was open: { "door": { "isOpen": true } }. */
function doorIsOpen(category: RawSurface['category']): boolean {
  if (typeof category !== 'object' || category === null || !Object.hasOwn(category, 'door')) return false
  const door = (category as Record<string, unknown>).door
  return typeof door === 'object' && door !== null && (door as { isOpen?: unknown }).isOpen === true
}

function isLowConfidence(confidence: unknown): boolean {
  return (
    confidence === 'low' ||
    (typeof confidence === 'object' && confidence !== null && Object.keys(confidence)[0] === 'low')
  )
}

type Segment = { id: string; start: Vec2; end: Vec2; bottom: number; height: number; thickness: number }

/** A surface's floor-plan segment in native coordinates (local +X runs along the surface). */
function segmentOf(surface: RawSurface): Segment {
  const m = flatten(surface.transform)
  const [width, height, depth] = surface.dimensions as [number, number, number]
  // Upright transforms are enforced by RawSurface, so this length is well above zero.
  const length = Math.hypot(m[0]!, m[2]!)
  const dir = { x: m[0]! / length, z: m[2]! / length }
  const center = { x: m[12]!, z: m[14]! }
  const half = width / 2
  return {
    id: surface.identifier,
    start: { x: center.x - dir.x * half, z: center.z - dir.z * half },
    end: { x: center.x + dir.x * half, z: center.z + dir.z * half },
    bottom: m[13]! - height / 2,
    height,
    thickness: depth,
  }
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z)
const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 })

function polygonArea(points: readonly Vec2[]): number {
  let area = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j]!.x * points[i]!.z - points[i]!.x * points[j]!.z
  }
  return Math.abs(area) / 2
}

/**
 * Chain wall segments end-to-end into closed loops and return the largest one's
 * corners. Interior partitions that do not close a loop are ignored.
 */
function outlineFromWalls(segments: readonly Segment[]): Vec2[] | null {
  let best: Vec2[] | null = null
  let bestArea = 0

  for (let first = 0; first < segments.length; first++) {
    const used = new Set([first])
    const ordered: Array<{ start: Vec2; end: Vec2 }> = [segments[first]!]
    let closed = false

    while (ordered.length <= segments.length) {
      const tail = ordered[ordered.length - 1]!.end
      if (ordered.length >= 3 && distance(tail, ordered[0]!.start) <= CORNER_TOLERANCE) {
        closed = true
        break
      }
      let nextIndex = -1
      let nextReversed = false
      let nearest = CORNER_TOLERANCE
      segments.forEach((segment, index) => {
        if (used.has(index)) return
        const toStart = distance(tail, segment.start)
        const toEnd = distance(tail, segment.end)
        if (toStart <= nearest) {
          nearest = toStart
          nextIndex = index
          nextReversed = false
        }
        if (toEnd <= nearest) {
          nearest = toEnd
          nextIndex = index
          nextReversed = true
        }
      })
      if (nextIndex < 0) break
      used.add(nextIndex)
      const segment = segments[nextIndex]!
      ordered.push(nextReversed ? { start: segment.end, end: segment.start } : segment)
    }

    if (!closed) continue
    // Each corner is where one wall ends and the next begins (averaged if they miss slightly).
    const corners = ordered.map((segment, i) => midpoint(ordered[(i + ordered.length - 1) % ordered.length]!.end, segment.start))
    const area = polygonArea(corners)
    if (area > bestArea) {
      best = corners
      bestArea = area
    }
  }
  return best
}

/**
 * RoomPlan's own floor outline in native coordinates: the largest valid floor polygon, or null.
 * Floors are optional evidence, so a malformed list is reported and ignored rather than failing the import.
 */
function outlineFromFloors(floors: unknown, warnings: string[]): Vec2[] | null {
  if (floors === undefined) return null
  const parsed = FloorList.safeParse(floors)
  if (!parsed.success) {
    warnings.push("The scan's floor outline couldn't be read, so it was ignored.")
    return null
  }
  let best: Vec2[] | null = null
  let bestArea = MIN_FLOOR_AREA
  for (const floor of parsed.data) {
    const m = flatten(floor.transform)
    const corners = floor.polygonCorners.map(([x, y, z]) => ({
      x: m[0]! * x! + m[4]! * y! + m[8]! * z! + m[12]!,
      z: m[2]! * x! + m[6]! * y! + m[10]! * z! + m[14]!,
    }))
    const area = polygonArea(corners)
    if (area >= bestArea) {
      best = corners
      bestArea = area
    }
  }
  return best
}

/**
 * Last-resort floor: the smallest rectangle aligned with the longest wall that contains every wall.
 * Aligning to the walls (not the world axes) keeps a turned room from growing a much larger floor.
 */
function alignedBoundsOutline(segments: readonly Segment[]): Vec2[] {
  const longest = segments.reduce((a, b) => (distance(b.start, b.end) > distance(a.start, a.end) ? b : a))
  const length = distance(longest.start, longest.end) || 1
  const u = { x: (longest.end.x - longest.start.x) / length, z: (longest.end.z - longest.start.z) / length }
  const v = { x: -u.z, z: u.x }
  const points = segments.flatMap((s) => [s.start, s.end])
  const along = points.map((p) => p.x * u.x + p.z * u.z)
  const across = points.map((p) => p.x * v.x + p.z * v.z)
  const [a0, a1, b0, b1] = [Math.min(...along), Math.max(...along), Math.min(...across), Math.max(...across)]
  const corner = (a: number, b: number): Vec2 => ({ x: u.x * a + v.x * b, z: u.z * a + v.z * b })
  return [corner(a0, b0), corner(a1, b0), corner(a1, b1), corner(a0, b1)]
}

/** Find the single wall an opening lies in, by position and direction. */
function matchWall(opening: Segment, walls: readonly Segment[]): Segment | null {
  const center = midpoint(opening.start, opening.end)
  const openingLength = distance(opening.start, opening.end) || 1
  const openingDir = { x: (opening.end.x - opening.start.x) / openingLength, z: (opening.end.z - opening.start.z) / openingLength }
  const matches = walls.filter((wall) => {
    const length = distance(wall.start, wall.end)
    if (length === 0) return false
    const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length }
    if (Math.abs(dir.x * openingDir.z - dir.z * openingDir.x) > PARALLEL_TOLERANCE) return false
    const rel = { x: center.x - wall.start.x, z: center.z - wall.start.z }
    const along = rel.x * dir.x + rel.z * dir.z
    const across = Math.abs(rel.x * dir.z - rel.z * dir.x)
    return across <= OPENING_WALL_DISTANCE && along >= 0 && along <= length
  })
  return matches.length === 1 ? matches[0]! : null
}

/** RoomPlan reports a built-in closet as a tall `storage` with (almost) no depth: only its doors were seen. */
function isBuiltInCloset(category: string | undefined, [width, height, depth]: readonly number[]): boolean {
  return category === 'storage' && width! > 0 && height! >= CLOSET_MIN_HEIGHT && depth! >= 0 && depth! < CLOSET_MAX_DEPTH
}

/** Where a built-in closet sits on its wall: the wall id and the closet's span along it (app meters from wall.start). */
type ClosetSpan = { wallId: string; from: number; to: number }

/**
 * A built-in closet as closet doors set flush on the inside face of the wall it lies in, facing into the room
 * (back on the wall line, like wallSpot). Returns null when it can't be matched to a single wall.
 */
function closetOnWall(
  surface: RawSurface,
  walls: readonly Segment[],
  appWalls: readonly Wall[],
  floorPolygon: readonly Vec2[],
  toApp: (p: Vec2) => Vec2,
  floorY: number,
): { object: RoomObject; span: ClosetSpan } | null {
  const segment = segmentOf(surface)
  const native = matchWall(segment, walls)
  const wall = native ? appWalls.find((w) => w.id === native.id) : undefined
  if (!wall) return null
  const [width, height] = surface.dimensions as [number, number, number]
  const length = distance(wall.start, wall.end)
  const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length }
  const center = toApp(midpoint(segment.start, segment.end))
  const along = (center.x - wall.start.x) * dir.x + (center.z - wall.start.z) * dir.z
  let normal = inwardNormal({ floorPolygon: [...floorPolygon] }, wall)
  let inset = 0
  if (!wall.exterior) {
    // A partition has floor on both sides: face the way the scanned doors face, and clear the drawn wall.
    const m = flatten(surface.transform)
    if (m[8]! * normal.x + m[10]! * normal.z < 0) normal = { x: -normal.x, z: -normal.z }
    inset = wall.thickness >= 0.02 ? wall.thickness / 2 : PARTITION_HALF_THICKNESS
  }
  const out = inset + CLOSET_DEPTH / 2 + CLOSET_WALL_GAP
  const bottom = segment.bottom - floorY
  return {
    span: { wallId: wall.id, from: along - width / 2, to: along + width / 2 },
    object: {
      id: surface.identifier,
      name: 'Closet',
      category: 'closet',
      sourceKind: 'captured',
      // Width and height as captured; the depth is a visual stand-in (see docs/DECISIONS.md).
      dimensions: { width, height, depth: CLOSET_DEPTH, source: 'captured' },
      pose: {
        position: {
          x: wall.start.x + dir.x * along + normal.x * out,
          y: Math.abs(bottom) < CLOSET_FLOOR_SNAP ? 0 : bottom,
          z: wall.start.z + dir.z * along + normal.z * out,
        },
        // Local +Z (the front) turns to (sin yaw, cos yaw): face along the inward normal.
        yaw: Math.atan2(normal.x, normal.z),
      },
      // RoomPlan sees only the closet door plane: drawn as door leaves in a trim frame at that size.
      asset: recipeAsset('closet'),
      fidelity: 'approximate',
      quantity: 1,
      keep: true,
      lockPlacement: true,
    },
  }
}

/** True when at least half the door's width lies within a closet on the same wall: it's the closet's door, not a passage. */
function isClosetDoor(opening: Opening, closets: readonly ClosetSpan[]): boolean {
  if (opening.kind !== 'door') return false
  const from = opening.offsetAlongWall - opening.width / 2
  const to = opening.offsetAlongWall + opening.width / 2
  return closets.some(
    (closet) => closet.wallId === opening.wallId && Math.min(to, closet.to) - Math.max(from, closet.from) >= CLOSET_DOOR_OVERLAP * opening.width,
  )
}

export function parseRoomPlanJson(text: string, options: ImportOptions = {}): ImportResult {
  if (exceedsByteLimit(text)) {
    return fail(`This file is too large to import (limit ${MAX_IMPORT_BYTES / (1024 * 1024)} MB).`)
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return fail("This file isn't valid JSON, so it can't be a RoomPlan scan.")
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return fail("This file isn't a RoomPlan scan.")
  }
  const record = json as Record<string, unknown>
  if (!Array.isArray(record.walls)) {
    return fail("This file isn't a RoomPlan scan: it has no walls list.")
  }
  if (record.walls.length > MAX_IMPORT_WALLS) {
    return fail(`This scan has too many walls (${record.walls.length}; the limit is ${MAX_IMPORT_WALLS}).`)
  }
  if (Array.isArray(record.objects) && record.objects.length > MAX_IMPORT_OBJECTS) {
    return fail(`This scan has too many objects (${record.objects.length}; the limit is ${MAX_IMPORT_OBJECTS}).`)
  }

  const parsed = RawScan.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    const where = formatPath(issue.path)
    return fail(`This scan has an invalid value${where ? ` at ${where}` : ''}. Try exporting it again.`)
  }
  const scan = parsed.data
  const warnings: string[] = []

  const wallSurfaces = scan.walls.filter((wall) => {
    const [width, height] = wall.dimensions as [number, number, number]
    if (width > 0 && height > 0) return true
    warnings.push(`Skipped a wall with no size (${wall.identifier}).`)
    return false
  })
  if (wallSurfaces.length === 0) {
    return fail("This scan has no walls, so the room outline can't be built.")
  }
  const walls = wallSurfaces.map(segmentOf)

  // Native floor height: the lowest wall base. Native outline, in order of trust:
  // closed wall loop → RoomPlan's floor polygon → rectangle aligned with the walls (estimated).
  const floorY = Math.min(...walls.map((wall) => wall.bottom))
  let outline = outlineFromWalls(walls) ?? outlineFromFloors(record.floors, warnings)
  if (!outline) {
    warnings.push("The walls don't form a closed outline; the floor was estimated from their extents.")
    outline = alignedBoundsOutline(walls)
  }
  if (polygonArea(outline) < MIN_FLOOR_AREA) {
    return fail("The walls in this scan don't enclose a floor area, so the room can't be built.")
  }
  const xs = outline.map((p) => p.x)
  const zs = outline.map((p) => p.z)
  const offset: Vec3 = {
    x: -(Math.min(...xs) + Math.max(...xs)) / 2,
    y: -floorY,
    z: -(Math.min(...zs) + Math.max(...zs)) / 2,
  }
  const toApp = (p: Vec2): Vec2 => ({ x: p.x + offset.x, z: p.z + offset.z })
  const floorPolygon = outline.map(toApp)

  const appWalls: Wall[] = walls.map((wall) => {
    const start = toApp(wall.start)
    const end = toApp(wall.end)
    const length = distance(start, end)
    const normal = { x: -(end.z - start.z) / length, z: (end.x - start.x) / length }
    const mid = midpoint(start, end)
    const probe = Math.max(wall.thickness / 2, 0) + 0.05
    const sideA = pointInPolygon({ x: mid.x + normal.x * probe, z: mid.z + normal.z * probe }, floorPolygon)
    const sideB = pointInPolygon({ x: mid.x - normal.x * probe, z: mid.z - normal.z * probe }, floorPolygon)
    return {
      id: wall.id,
      start,
      end,
      height: wall.height,
      thickness: wall.thickness,
      exterior: !(sideA && sideB),
    }
  })
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]))

  const openings: Opening[] = []
  const openingLists = [
    ['door', scan.doors],
    ['window', scan.windows],
    ['opening', scan.openings],
  ] as const
  for (const [kind, list] of openingLists) {
    for (const surface of list) {
      const [width, height] = surface.dimensions as [number, number, number]
      if (!(width > 0 && height > 0)) {
        warnings.push(`Skipped a ${kind} with no size (${surface.identifier}).`)
        continue
      }
      const segment = segmentOf(surface)
      const parent = surface.parentIdentifier ? wallsById.get(surface.parentIdentifier) : undefined
      const wall = parent ?? matchWall(segment, walls)
      if (!wall) {
        warnings.push(`Skipped a ${kind} that couldn't be matched to a single wall (${surface.identifier}).`)
        continue
      }
      const center = midpoint(segment.start, segment.end)
      const wallLength = distance(wall.start, wall.end)
      const along =
        ((center.x - wall.start.x) * (wall.end.x - wall.start.x) + (center.z - wall.start.z) * (wall.end.z - wall.start.z)) /
        wallLength
      openings.push({
        id: surface.identifier,
        kind,
        wallId: wall.id,
        offsetAlongWall: along,
        bottom: Math.max(0, segment.bottom - floorY),
        width,
        height,
        ...(kind === 'door' && doorIsOpen(surface.category) ? { open: true } : {}),
      })
    }
  }

  const objects: RoomObject[] = []
  const closets: ClosetSpan[] = []
  let lowConfidence = 0
  const unrecognized = new Set<string>()
  for (const surface of scan.objects) {
    const [width, height, depth] = surface.dimensions as [number, number, number]
    const raw = categoryName(surface.category)
    if (isBuiltInCloset(raw, surface.dimensions)) {
      const closet = closetOnWall(surface, walls, appWalls, floorPolygon, toApp, floorY)
      if (closet) {
        objects.push(closet.object)
        closets.push(closet.span)
        continue
      }
    }
    if (!(width > 0 && height > 0 && depth > 0)) {
      warnings.push(`Skipped an object with no size (${surface.identifier}).`)
      continue
    }
    const category = raw ? own(OBJECT_CATEGORIES, raw) : undefined
    if (!category) unrecognized.add(raw ?? 'missing')
    if (isLowConfidence(surface.confidence)) lowConfidence += 1

    const pose = poseFromColumnMajor(flatten(surface.transform), height)
    // Captured furniture is drawn with its category's default block recipe; anything else stays a sized box.
    const asset: AssetRef = category ? recipeAsset(category) : { kind: 'placeholder' }
    const appCategory = category ?? 'unknown'
    objects.push({
      id: surface.identifier,
      name: appCategory === 'unknown' ? 'Unknown object' : titleCase(appCategory),
      category: appCategory,
      sourceKind: 'captured',
      dimensions: { width, height, depth, source: 'captured' },
      pose: {
        position: { x: pose.position.x + offset.x, y: pose.position.y + offset.y, z: pose.position.z + offset.z },
        yaw: pose.yaw,
      },
      asset,
      fidelity: 'approximate',
      quantity: 1,
      keep: true,
      lockPlacement: false,
    })
  }
  // Doors mostly within a closet are its doors, not passages: keep that stretch of wall solid behind the closet.
  const passages = openings.filter((opening) => !isClosetDoor(opening, closets))
  if (closets.length > 0) {
    warnings.push(closets.length === 1 ? 'Built-in closet shown as closet doors.' : `${closets.length} built-in closets shown as closet doors.`)
  }
  if (unrecognized.size > 0) {
    warnings.push(`Some objects had unrecognized categories (${[...unrecognized].join(', ')}) and are shown as boxes.`)
  }
  if (lowConfidence > 0) {
    warnings.push(`${lowConfidence} object${lowConfidence === 1 ? ' was' : 's were'} scanned with low confidence.`)
  }

  const synthetic = scan._synthetic === true
  const candidate = {
    id: options.id ?? `room-${scan.identifier ?? 'import'}`,
    name: options.name ?? (synthetic ? 'Sample bedroom' : 'Scanned room'),
    floorPolygon,
    walls: appWalls,
    openings: passages,
    objects,
    finishes: { ...DEFAULT_FINISHES },
    source: {
      kind: synthetic ? 'synthetic' : 'roomplan',
      importedAt: options.now ?? new Date().toISOString(),
      raw: json,
      nativeToApp: offset,
    },
  }
  const validated = Room.safeParse(candidate)
  if (!validated.success) {
    const issue = validated.error.issues[0]!
    return fail(`This scan couldn't be converted (${issue.message}).`)
  }
  return { ok: true, room: validated.data, warnings }
}

function titleCase(category: string): string {
  const words = category.split('-').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
