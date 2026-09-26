import { describe, expect, it } from 'vitest'
import { sampleRoom } from '../test/rooms'
import { footprintsOverlap, insideRoom } from './geometry'
import { blocksDoorway, freeSpot, hostWall } from './layout'

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
