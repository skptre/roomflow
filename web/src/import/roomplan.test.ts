import { describe, expect, it } from 'vitest'
import { footprintBounds } from '../domain/geometry'
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
      asset: { kind: 'parametric', assemblyId: 'bed' },
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
