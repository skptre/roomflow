import { describe, expect, it } from 'vitest'
import { sampleRoom } from '../test/rooms'
import { collisions } from './commands'
import { footprintsOverlap, insideRoom } from './geometry'
import { blocksDoorway, freeSpot, hostWall, windowSpot } from './layout'

describe('freeSpot', () => {
  it('finds a spot inside the room that overlaps nothing', () => {
    const room = sampleRoom()
    const size = { width: 0.5, depth: 0.5 }
    const pose = freeSpot(room, size)
    expect(pose).not.toBeNull()
    const placed = { pose: pose!, dimensions: size }
    expect(insideRoom(placed, room.floorPolygon)).toBe(true)
    for (const object of room.objects) expect(footprintsOverlap(placed, object)).toBe(false)
  })

  it('prefers spots near a requested point', () => {
    const room = sampleRoom()
    const near = { x: -1.5, z: -1.4 }
    const pose = freeSpot(room, { width: 0.3, depth: 0.3 }, { near })!
    expect(Math.hypot(pose.position.x - near.x, pose.position.z - near.z)).toBeLessThan(0.5)
  })

  it('may turn an item 90° to make it fit', () => {
    const room = { ...sampleRoom(), objects: [] }
    // 3.8 m deep does not fit the 3.5 m depth of the room at yaw 0; turned 90° it runs along the 4 m side.
    const pose = freeSpot(room, { width: 0.4, depth: 3.8 })
    expect(pose).not.toBeNull()
    expect(Math.abs(Math.sin(pose!.yaw))).toBeCloseTo(1)
  })

  it('returns null when nothing fits', () => {
    expect(freeSpot(sampleRoom(), { width: 5, depth: 5 })).toBeNull()
  })

  it('ignores the object being replaced or moved', () => {
    const room = sampleRoom()
    const bed = room.objects.find((o) => o.id === 'OBJ-BED')!
    const pose = freeSpot(room, { width: 1.6, depth: 2.1 }, { near: { x: bed.pose.position.x, z: bed.pose.position.z }, ignoreId: 'OBJ-BED', yaws: [bed.pose.yaw] })
    expect(pose).not.toBeNull()
    expect(Math.hypot(pose!.position.x - bed.pose.position.x, pose!.position.z - bed.pose.position.z)).toBeLessThan(0.11)
  })
})

describe('door clearance', () => {
  it('never places a new floor item in front of a door', () => {
    const room = sampleRoom()
    const door = room.openings.find((o) => o.kind === 'door')!
    const wall = room.walls.find((w) => w.id === door.wallId)!
    // Search right next to the door: the nearest free spot must be outside the entry zone.
    const t = door.offsetAlongWall / Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z)
    const doorPoint = { x: wall.start.x + (wall.end.x - wall.start.x) * t, z: wall.start.z + (wall.end.z - wall.start.z) * t + 0.3 }
    const pose = freeSpot(room, { width: 0.4, depth: 0.4 }, { near: doorPoint })!
    const candidate = { ...room.objects[0]!, id: 'x', dimensions: { width: 0.4, height: 1, depth: 0.4, source: 'merchant' as const }, pose }
    expect(blocksDoorway(room, candidate)).toBe(false)
    expect(blocksDoorway(room, { ...candidate, pose: { ...pose, position: { x: doorPoint.x, y: 0, z: doorPoint.z } } })).toBe(true)
  })
})

describe('hostWall', () => {
  it('finds the wall a hung item is on, and none for free-standing items', () => {
    const room = sampleRoom()
    const south = room.walls.find((w) => w.id === 'WALL-A-SOUTH')!
    const art = {
      ...room.objects[0]!,
      id: 'art',
      category: 'wall-art',
      dimensions: { width: 0.6, height: 0.8, depth: 0.04, source: 'merchant' as const },
      pose: { position: { x: 0.6, y: 1.2, z: south.start.z + 0.022 }, yaw: 0 },
    }
    expect(hostWall(room, art)).toBe('WALL-A-SOUTH')
    expect(hostWall(room, room.objects.find((o) => o.id === 'OBJ-CHAIR')!)).toBeNull()
  })
})

describe('windowSpot', () => {
  const curtain = (height: number) => ({
    ...sampleRoom().objects[0]!,
    id: 'curtain',
    category: 'curtain',
    sourceKind: 'product' as const,
    dimensions: { width: 1.27, height, depth: 0.05, source: 'merchant' as const },
  })

  it('hangs a curtain centered on the window, rod above it, in front of the wall and facing in', () => {
    const room = sampleRoom()
    const window = room.openings.find((o) => o.kind === 'window')!
    const wall = room.walls.find((w) => w.id === window.wallId)!
    const placed = windowSpot(room, curtain(2.13))!
    expect(placed).not.toBeNull()
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z)
    const along = ((placed.pose.position.x - wall.start.x) * (wall.end.x - wall.start.x) + (placed.pose.position.z - wall.start.z) * (wall.end.z - wall.start.z)) / length
    expect(along).toBeCloseTo(window.offsetAlongWall, 6)
    const rod = Math.min(window.bottom + window.height + 0.15, wall.height - 0.02)
    expect(placed.pose.position.y + 2.13).toBeCloseTo(Math.max(rod, 2.13), 6)
    expect(hostWall(room, placed)).toBeNull() // hangs clear of the wall, over the frame
    expect(insideRoom(placed, room.floorPolygon)).toBe(true)
  })

  it('rests a curtain longer than the rod height on the floor, and skips a window that already has one', () => {
    const room = sampleRoom()
    const long = windowSpot(room, curtain(2.7))
    if (long) expect(long.pose.position.y).toBe(0)
    const once = windowSpot(room, curtain(2.13))!
    expect(windowSpot({ ...room, objects: [...room.objects, once] }, { ...curtain(2.13), id: 'second' })).toBeNull()
  })

  it('falls behind the desk under the window, but two curtains in one spot still collide', () => {
    const room = sampleRoom()
    const placed = windowSpot(room, curtain(2.13))!
    expect(collisions(room, placed)).toEqual([])
    const withOne = { ...room, objects: [...room.objects, placed] }
    expect(collisions(withOne, { ...placed, id: 'second' }).map((o) => o.id)).toEqual(['curtain'])
  })

  it('finds nothing in a room without windows', () => {
    const room = sampleRoom()
    expect(windowSpot({ ...room, openings: room.openings.filter((o) => o.kind !== 'window') }, curtain(2.13))).toBeNull()
  })
})
