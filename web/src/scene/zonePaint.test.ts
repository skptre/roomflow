import { describe, expect, it } from 'vitest'
import type { Room, Vec2, Zone } from '../domain/schema'
import { wallFaceColors, zoneAt } from './zonePaint'

// An L: bedroom x 0..4, z 0..3; bathroom x 4..6, z 0..2.
const floorPolygon: Vec2[] = [
  { x: 0, z: 0 },
  { x: 6, z: 0 },
  { x: 6, z: 2 },
  { x: 4, z: 2 },
  { x: 4, z: 3 },
  { x: 0, z: 3 },
]
const bath: Zone = {
  id: 'bath',
  name: 'Bathroom',
  polygon: [
    { x: 4, z: 0 },
    { x: 6, z: 0 },
    { x: 6, z: 2 },
    { x: 4, z: 2 },
  ],
  finishes: { wall: '#ffffff', floor: '#eeeeee', floorTexture: 'tile' },
}
const room: Pick<Room, 'floorPolygon' | 'zones' | 'finishes'> = { floorPolygon, zones: [bath], finishes: { wall: '#cfd6c4', floor: '#d4c1a6' } }

describe('zoneAt', () => {
  it('finds the zone a point is in, or none', () => {
    expect(zoneAt(room, { x: 5, z: 1 })?.id).toBe('bath')
    expect(zoneAt(room, { x: 2, z: 1 })).toBeNull()
    expect(zoneAt({}, { x: 5, z: 1 })).toBeNull()
  })
})

describe('wallFaceColors', () => {
  it('paints each face of a partition for the room it looks into', () => {
    // Start → end runs +z: left is −x (bedroom), right is +x (bathroom).
    expect(wallFaceColors(room, { start: { x: 4, z: 0 }, end: { x: 4, z: 2 } })).toEqual({ left: '#cfd6c4', right: '#ffffff' })
    expect(wallFaceColors(room, { start: { x: 4, z: 2 }, end: { x: 4, z: 0 } })).toEqual({ left: '#ffffff', right: '#cfd6c4' })
  })

  it('gives an exterior wall the same color outside as inside', () => {
    expect(wallFaceColors(room, { start: { x: 4, z: 0 }, end: { x: 6, z: 0 } })).toEqual({ left: '#ffffff', right: '#ffffff' })
    expect(wallFaceColors(room, { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } })).toEqual({ left: '#cfd6c4', right: '#cfd6c4' })
  })

  it('uses the room color throughout when there are no zones', () => {
    expect(wallFaceColors({ ...room, zones: undefined }, { start: { x: 4, z: 0 }, end: { x: 4, z: 2 } })).toEqual({ left: '#cfd6c4', right: '#cfd6c4' })
  })
})
