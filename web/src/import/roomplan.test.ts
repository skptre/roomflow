import { describe, expect, it } from 'vitest'
import { isWallHung, isWallMounted } from '../domain/categories'
import { footprintBounds } from '../domain/geometry'
import { hostWall } from '../domain/layout'
import { Room } from '../domain/schema'
import fixtureText from '../fixtures/synthetic-bedroom.roomplan.json?raw'
import { MAX_IMPORT_BYTES, MAX_IMPORT_OBJECTS, MAX_IMPORT_WALLS, parseRoomPlanJson } from './roomplan'

const NOW = '2026-09-26T12:00:00.000Z'

// Test-only shape for editing the parsed fixture.
type RawScan = Record<string, any>

function load(text = fixtureText) {
  const result = parseRoomPlanJson(text, { now: NOW })
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`)
  return result
}

function mutate(edit: (raw: RawScan) => void): string {
  const raw = JSON.parse(fixtureText) as RawScan
  edit(raw)
  return JSON.stringify(raw)
}

function wallLength(wall: { start: { x: number; z: number }; end: { x: number; z: number } }) {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z)
}

describe('parseRoomPlanJson — synthetic bedroom', () => {
  it('produces a schema-valid room', () => {
    const { room } = load()
    expect(Room.safeParse(room).success).toBe(true)
  })

  it('reads four walls with the scanned lengths', () => {
    const { room } = load()
    expect(room.walls).toHaveLength(4)
    const lengths = room.walls.map(wallLength).sort()
    expect(lengths[0]).toBeCloseTo(3.5, 3)
    expect(lengths[1]).toBeCloseTo(3.5, 3)
    expect(lengths[2]).toBeCloseTo(4.0, 3)
    expect(lengths[3]).toBeCloseTo(4.0, 3)
  })

  it('attaches the door to its parent wall at the right offset, on the floor', () => {
    const { room } = load()
    const door = room.openings.find((o) => o.id === 'DOOR-1')!
    expect(door.kind).toBe('door')
    expect(door.wallId).toBe('WALL-A-SOUTH')
    expect(door.offsetAlongWall).toBeCloseTo(0.9, 3)
    expect(door.bottom).toBeCloseTo(0, 3)
    expect(door.width).toBeCloseTo(0.9, 3)
    expect(door.height).toBeCloseTo(2.05, 3)
  })

  it('attaches a window without parentIdentifier to the one wall it lies on', () => {
    const { room } = load()
    const window = room.openings.find((o) => o.id === 'WINDOW-1')!
    expect(window.kind).toBe('window')
    expect(window.wallId).toBe('WALL-B-EAST')
    expect(window.offsetAlongWall).toBeCloseTo(1.8, 3)
    expect(window.bottom).toBeCloseTo(0.9, 3)
  })

  it('recenters the floor on the origin with the floor at y = 0', () => {
    const { room } = load()
    const bounds = footprintBounds(room.floorPolygon)
    expect(bounds.minX).toBeCloseTo(-2, 3)
    expect(bounds.maxX).toBeCloseTo(2, 3)
    expect(bounds.minZ).toBeCloseTo(-1.75, 3)
    expect(bounds.maxZ).toBeCloseTo(1.75, 3)
    const offset = room.source.nativeToApp!
    expect(offset.x).toBeCloseTo(-3.2, 6)
    expect(offset.y).toBeCloseTo(1.4, 6)
    expect(offset.z).toBeCloseTo(-2.45, 6)
  })

  it('places every object with its base on the floor and keeps its pose', () => {
    const { room } = load()
    for (const object of room.objects) expect(object.pose.position.y).toBeCloseTo(0, 3)
    const bed = room.objects.find((o) => o.id === 'OBJ-BED')!
    expect(bed.pose.position.x).toBeCloseTo(-0.6, 3)
    expect(bed.pose.position.z).toBeCloseTo(0.7, 3)
    expect(bed.pose.yaw).toBeCloseTo(Math.PI)
    const desk = room.objects.find((o) => o.id === 'OBJ-DESK')!
    expect(desk.pose.yaw).toBeCloseTo(-Math.PI / 2)
    expect(desk.dimensions).toMatchObject({ width: 1.2, height: 0.75, depth: 0.6 })
  })

  it('keeps the original payload untouched as source.raw', () => {
    const { room } = load()
    expect(room.source.raw).toEqual(JSON.parse(fixtureText))
    expect(room.source.kind).toBe('synthetic')
    expect(room.source.importedAt).toBe(NOW)
  })

  it('marks the outer walls exterior', () => {
    const { room } = load()
    expect(room.walls.every((wall) => wall.exterior)).toBe(true)
  })

  it('marks captured furniture as existing, measured, approximate, and kept', () => {
    const { room } = load()
    const bed = room.objects.find((o) => o.id === 'OBJ-BED')!
    expect(bed).toMatchObject({
      category: 'bed',
      sourceKind: 'captured',
      fidelity: 'approximate',
      keep: true,
      lockPlacement: false,
      quantity: 1,
      asset: { kind: 'recipe', recipeId: 'default:bed' },
    })
    expect(bed.dimensions.source).toBe('captured')
  })
})

describe('parseRoomPlanJson — interpretation', () => {
  it('marks an interior partition wall as not exterior', () => {
    const text = mutate((raw) => {
      // Partition from the west wall to the middle of the room at design z = 1.75 (native z = 2.45).
      raw.walls.push({
        category: { wall: {} },
        identifier: 'WALL-PARTITION',
        dimensions: [2, 2.6, 0],
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.2, -0.1, 2.45, 1],
      })
    })
    const { room } = load(text)
    expect(room.walls.find((w) => w.id === 'WALL-PARTITION')!.exterior).toBe(false)
    expect(room.walls.filter((w) => w.exterior)).toHaveLength(4)
  })

  it('maps an unknown category to "unknown" with a placeholder and a warning', () => {
    const text = mutate((raw) => {
      raw.objects[0].category = { hologram: {} }
    })
    const { room, warnings } = load(text)
    const object = room.objects.find((o) => o.id === 'OBJ-BED')!
    expect(object.category).toBe('unknown')
    expect(object.asset).toEqual({ kind: 'placeholder' })
    expect(warnings.join(' ')).toMatch(/unrecognized/i)
  })

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'treats the inherited key %s as an unknown category instead of crashing',
    (name) => {
      const text = mutate((raw) => {
        raw.objects[0].category = name
      })
      const { room, warnings } = load(text)
      const object = room.objects.find((o) => o.id === 'OBJ-BED')!
      expect(object.category).toBe('unknown')
      expect(object.asset).toEqual({ kind: 'placeholder' })
      expect(warnings.join(' ')).toMatch(/unrecognized/i)
    },
  )

  it('accepts nested 4×4 (column) transforms the same as flat ones', () => {
    const text = mutate((raw) => {
      for (const list of [raw.walls, raw.doors, raw.windows, raw.objects]) {
        for (const surface of list) {
          const m = surface.transform as number[]
          surface.transform = [m.slice(0, 4), m.slice(4, 8), m.slice(8, 12), m.slice(12, 16)]
        }
      }
    })
    const flat = load().room
    const nested = load(text).room
    expect({ ...nested, source: null }).toEqual({ ...flat, source: null })
  })

  it('drops an opening that matches no wall, with a warning', () => {
    const text = mutate((raw) => {
      raw.windows[0].transform[12] = 30 // far away from every wall
    })
    const { room, warnings } = load(text)
    expect(room.openings.find((o) => o.id === 'WINDOW-1')).toBeUndefined()
    expect(warnings.join(' ')).toMatch(/window/i)
  })

  it('falls back to geometry when parentIdentifier names a missing wall', () => {
    const text = mutate((raw) => {
      raw.doors[0].parentIdentifier = 'NOT-A-WALL'
    })
    const { room } = load(text)
    expect(room.openings.find((o) => o.id === 'DOOR-1')!.wallId).toBe('WALL-A-SOUTH')
  })

  it('labels a file without the synthetic marker as a roomplan capture', () => {
    const text = mutate((raw) => {
      delete raw._synthetic
    })
    expect(load(text).room.source.kind).toBe('roomplan')
  })
})

describe('parseRoomPlanJson — hostile input', () => {
  function expectFailure(text: string, pattern: RegExp) {
    const result = parseRoomPlanJson(text, { now: NOW })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(pattern)
  }

  it('rejects text that is not JSON', () => {
    expectFailure('not json {', /valid JSON/i)
  })

  it('rejects JSON that is not a RoomPlan room', () => {
    expectFailure('[1, 2, 3]', /RoomPlan/i)
    expectFailure('{"hello": "world"}', /walls/i)
  })

  it('rejects non-finite numbers in a transform', () => {
    // JSON cannot spell NaN; 1e999 parses to Infinity, and a "NaN" string is what a lenient encoder writes.
    const infinite = fixtureText.replace('"transform": [\n        1,', '"transform": [\n        1e999,')
    expect(infinite).not.toBe(fixtureText)
    expectFailure(infinite, /walls\[0\]\.transform/)
    expectFailure(
      mutate((raw) => {
        raw.objects[1].transform[13] = 'NaN'
      }),
      /objects\[1\]\.transform/,
    )
  })

  it('rejects files over the size limit', () => {
    const huge = `{"walls": [], "pad": "${'x'.repeat(MAX_IMPORT_BYTES)}"}`
    expectFailure(huge, /too large/i)
  })

  it('rejects scans with too many objects', () => {
    const text = mutate((raw) => {
      const template = raw.objects[0]
      raw.objects = Array.from({ length: MAX_IMPORT_OBJECTS + 1 }, (_, i) => ({ ...template, identifier: `O-${i}` }))
    })
    expectFailure(text, /too many objects/i)
  })

  it('rejects scans with more walls than a room plausibly has', () => {
    const text = mutate((raw) => {
      const template = raw.walls[0]
      raw.walls = Array.from({ length: MAX_IMPORT_WALLS + 1 }, (_, i) => ({ ...template, identifier: `W-${i}` }))
    })
    expectFailure(text, /too many walls/i)
  })

  it('rejects a surface whose local X axis is not horizontal', () => {
    // Column 0 = (0, 1, 0): the wall's length axis points straight up.
    const text = mutate((raw) => {
      const m = raw.walls[1].transform as number[]
      raw.walls[1].transform = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, m[12], m[13], m[14], 1]
    })
    expectFailure(text, /walls\[1\]/)
  })

  it('rejects an object that is not upright', () => {
    const text = mutate((raw) => {
      const m = raw.objects[0].transform as number[]
      raw.objects[0].transform = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, m[12], m[13], m[14], 1]
    })
    expectFailure(text, /objects\[0\]/)
  })

  it('rejects a scan whose walls enclose no floor area', () => {
    expectFailure(
      mutate((raw) => {
        raw.walls = [raw.walls[0]]
      }),
      /floor/i,
    )
    expectFailure(
      mutate((raw) => {
        // Two parallel walls on the same line: still no area.
        raw.walls = [raw.walls[0], { ...raw.walls[0], identifier: 'W-COPY' }]
      }),
      /floor/i,
    )
  })

  it('rejects a scan with no walls', () => {
    expectFailure(
      mutate((raw) => {
        raw.walls = []
      }),
      /no walls/i,
    )
  })
})


// --- Floor outline when the walls don't close (e.g. an open-ended room) ---

const areaOf = (points: ReadonlyArray<{ x: number; z: number }>) =>
  Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!
    return sum + p.x * q.z - q.x * p.z
  }, 0)) / 2

/** Rotates every surface of a scan about the vertical axis (column-major transforms). */
function rotateScan(raw: RawScan, degrees: number) {
  const a = (degrees * Math.PI) / 180
  const c = Math.cos(a), s = Math.sin(a)
  const rotate = (x: number, z: number) => [c * x + s * z, -s * x + c * z] as const
  for (const key of ['walls', 'doors', 'windows', 'openings', 'objects', 'floors']) {
    for (const surface of (raw[key] ?? []) as RawScan[]) {
      const m = surface.transform as number[]
      for (const col of [0, 4, 8, 12]) {
        const [x, z] = rotate(m[col]!, m[col + 2]!)
        m[col] = x
        m[col + 2] = z
      }
    }
  }
}

/** RoomPlan-style floor surface whose local (x, y) are the native (x, z) of the given corners. */
function floorSurface(corners: ReadonlyArray<{ x: number; z: number }>, floorY: number) {
  return {
    identifier: 'floor-1',
    transform: [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, floorY, 0, 1],
    polygonCorners: corners.map((p) => [p.x, p.z, 0]),
  }
}

describe('parseRoomPlanJson — floor outline without a closed wall loop', () => {
  const closed = load()
  const offset = closed.room.source.nativeToApp
  if (!offset) throw new Error('the fixture import should record nativeToApp')
  const nativeFloor = closed.room.floorPolygon.map((p) => ({ x: p.x - offset.x, z: p.z - offset.z }))

  it("uses RoomPlan's floor polygon when a wall is missing", () => {
    const result = load(
      mutate((raw) => {
        raw.walls.splice(0, 1)
        raw.floors = [floorSurface(nativeFloor, -offset.y)]
      }),
    )
    expect(areaOf(result.room.floorPolygon)).toBeCloseTo(areaOf(closed.room.floorPolygon), 3)
    expect(result.warnings.join(' ')).not.toMatch(/closed outline/)
  })

  it('falls back to a rectangle aligned with the walls, not the world axes', () => {
    const result = load(
      mutate((raw) => {
        rotateScan(raw, 30)
        raw.walls.splice(0, 1)
      }),
    )
    // An axis-aligned box around a 30°-turned 4 × 3.5 m room would be ~26 m²; the aligned one stays ~14 m².
    expect(areaOf(result.room.floorPolygon)).toBeCloseTo(areaOf(closed.room.floorPolygon), 1)
    expect(result.warnings.join(' ')).toMatch(/closed outline/)
  })

  it('ignores a malformed floor list with a warning instead of failing', () => {
    const result = load(
      mutate((raw) => {
        raw.walls.splice(0, 1)
        raw.floors = [{ identifier: 'f', transform: [1, 2], polygonCorners: 'nope' }]
      }),
    )
    expect(result.warnings.join(' ')).toMatch(/floor outline/i)
    expect(areaOf(result.room.floorPolygon)).toBeGreaterThan(0.5)
  })

  it('keeps using the closed wall loop when the walls do close', () => {
    const result = load(
      mutate((raw) => {
        raw.floors = [floorSurface([{ x: 0, z: 0 }, { x: 9, z: 0 }, { x: 9, z: 9 }], -offset.y)]
      }),
    )
    expect(areaOf(result.room.floorPolygon)).toBeCloseTo(areaOf(closed.room.floorPolygon), 3)
  })
})

describe('parseRoomPlanJson — built-in closets', () => {
  const WEST = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0] // local X along the west wall, local Z into the room
  /** The fixture plus a closet front on the west wall (RoomPlan: tall storage, no depth) and its door. */
  function withCloset(depth = 0.004) {
    return mutate((raw) => {
      raw.objects.push({ identifier: 'OBJ-CLOSET', category: { storage: {} }, confidence: { high: {} }, dimensions: [1.3, 2.2, depth], transform: [...WEST, 1.2, -0.3, 2.5, 1] })
      raw.doors.push(
        { identifier: 'DOOR-CLOSET', category: { door: { isOpen: false } }, dimensions: [1.1, 2.05, 0], transform: [...WEST, 1.2, -0.375, 2.45, 1], parentIdentifier: 'WALL-D-WEST' },
        // Only 5 cm of this door's 80 cm lies within the closet: a real passage.
        { identifier: 'DOOR-PASSAGE', category: { door: { isOpen: false } }, dimensions: [0.8, 2.05, 0], transform: [...WEST, 1.2, -0.375, 3.5, 1], parentIdentifier: 'WALL-D-WEST' },
      )
    })
  }

  it('turns a tall, depthless storage into closet doors flush on the inside of its wall', () => {
    const { room, warnings } = load(withCloset())
    const closets = room.objects.filter((o) => o.category === 'closet')
    expect(closets).toHaveLength(1)
    const closet = closets[0]!
    expect(closet).toMatchObject({ id: 'OBJ-CLOSET', name: 'Closet', keep: true, lockPlacement: true, asset: { kind: 'recipe', recipeId: 'default:closet' } })
    expect(closet.dimensions).toMatchObject({ width: 1.3, height: 2.2, depth: 0.04, source: 'captured' })
    // West wall is at app x = -2; the back touches it and the front faces +x (into the room).
    expect(closet.pose.position.x).toBeCloseTo(-2 + 0.02 + 0.002, 4)
    expect(closet.pose.position.y).toBe(0)
    expect(closet.pose.position.z).toBeCloseTo(0.05, 4)
    expect(closet.pose.yaw).toBeCloseTo(Math.PI / 2, 6)
    expect(hostWall(room, closet)).toBe('WALL-D-WEST')
    expect(warnings).toContain('Built-in closet shown as closet doors.')
  })

  it('removes the closet door so the wall stays solid, and keeps doors that are real passages', () => {
    const ids = load(withCloset()).room.openings.map((o) => o.id)
    expect(ids).not.toContain('DOOR-CLOSET')
    expect(ids).toEqual(expect.arrayContaining(['DOOR-1', 'DOOR-PASSAGE', 'WINDOW-1']))
  })

  it('accepts a closet front with exactly zero depth', () => {
    expect(load(withCloset(0)).room.objects.some((o) => o.id === 'OBJ-CLOSET' && o.category === 'closet')).toBe(true)
  })

  it('keeps ordinary storage (low, or tall and deep) as storage furniture', () => {
    const text = mutate((raw) => {
      raw.objects.push({ identifier: 'OBJ-WARDROBE', category: { storage: {} }, dimensions: [1.0, 2.0, 0.6], transform: [...WEST, 1.6, -0.4, 2.5, 1] })
    })
    const { room, warnings } = load(text)
    for (const id of ['OBJ-STORAGE', 'OBJ-WARDROBE']) {
      const object = room.objects.find((o) => o.id === id)!
      expect(object.category).toBe('storage')
      expect(object.asset).toEqual({ kind: 'recipe', recipeId: 'default:storage' })
      expect(object.lockPlacement).toBe(false)
    }
    expect(warnings.join(' ')).not.toMatch(/closet/)
  })

  it('goes with its wall in the cutaway, but still counts as floor-standing for dragging rules', () => {
    const closet = load(withCloset()).room.objects.find((o) => o.category === 'closet')!
    expect(isWallMounted(closet)).toBe(true)
    expect(isWallHung(closet)).toBe(false)
    expect(isWallMounted({ category: 'bed' })).toBe(false)
  })
})
