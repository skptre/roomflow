import { describe, expect, it } from 'vitest'
import type { Opening, Wall } from '../domain/schema'
import { DEFAULT_WALL_THICKNESS, slabWallProfile, wallProfile, wallShapes, wallThickness, type ProfilePolygon } from './wallGeometry'

const wall: Wall = { id: 'w', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, height: 2.5, thickness: 0, exterior: true }

function opening(partial: Partial<Opening>): Opening {
  return { id: 'o', kind: 'window', wallId: 'w', offsetAlongWall: 2, bottom: 0.9, width: 1, height: 1, ...partial }
}

function ringArea(ring: ReadonlyArray<readonly [number, number]>): number {
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1]
  }
  return Math.abs(area) / 2
}

function solidArea(polygons: readonly ProfilePolygon[]): number {
  return polygons.reduce((sum, [outer, ...holes]) => sum + ringArea(outer!) - holes.reduce((h, ring) => h + ringArea(ring), 0), 0)
}

function insideRing(u: number, v: number, ring: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ui, vi] = ring[i]!
    const [uj, vj] = ring[j]!
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside
  }
  return inside
}

function solidAt(polygons: readonly ProfilePolygon[], u: number, v: number): boolean {
  return polygons.some(([outer, ...holes]) => insideRing(u, v, outer!) && !holes.some((ring) => insideRing(u, v, ring)))
}

describe('wallProfile', () => {
  it('is one solid rectangle without openings', () => {
    const polygons = wallProfile(wall, [])
    expect(polygons).toHaveLength(1)
    expect(polygons[0]).toHaveLength(1)
    expect(solidArea(polygons)).toBeCloseTo(4 * 2.5)
  })

  it('leaves a floor-level door open as a notch, with no solid over the doorway (RF1)', () => {
    const door = opening({ kind: 'door', offsetAlongWall: 1, bottom: 0, width: 0.9, height: 2.05 })
    const polygons = wallProfile(wall, [door])
    expect(polygons).toHaveLength(1)
    expect(polygons[0]).toHaveLength(1) // a notch in the outline, not a hole
    for (const u of [0.6, 1, 1.4]) {
      for (const v of [0.001, 0.5, 1, 2]) expect(solidAt(polygons, u, v)).toBe(false)
    }
    expect(solidAt(polygons, 1, 2.2)).toBe(true) // lintel above the door
    expect(solidArea(polygons)).toBeCloseTo(4 * 2.5 - 0.9 * 2.05)
  })

  it('cuts a window as a hole', () => {
    const polygons = wallProfile(wall, [opening({})])
    expect(polygons).toHaveLength(1)
    expect(polygons[0]).toHaveLength(2)
    expect(solidAt(polygons, 2, 1.4)).toBe(false)
    expect(solidAt(polygons, 2, 0.5)).toBe(true)
  })

  it('clips an opening that runs past the end of the wall', () => {
    const polygons = wallProfile(wall, [opening({ offsetAlongWall: 3.8, width: 1 })])
    // Only 0.7 m of the 1 m window lies within the 4 m wall.
    expect(solidArea(polygons)).toBeCloseTo(4 * 2.5 - 0.7 * 1)
  })

  it('merges overlapping openings', () => {
    const polygons = wallProfile(wall, [opening({ offsetAlongWall: 1.8 }), opening({ id: 'o2', offsetAlongWall: 2.2 })])
    expect(polygons[0]).toHaveLength(2)
    expect(solidArea(polygons)).toBeCloseTo(4 * 2.5 - 1.4 * 1)
  })

  it('ignores openings that belong to other walls', () => {
    expect(solidArea(wallProfile(wall, [opening({ wallId: 'other' })]))).toBeCloseTo(10)
  })

  it('extends the profile past both ends without moving openings relative to the wall', () => {
    const door = opening({ kind: 'door', offsetAlongWall: 1, bottom: 0, width: 0.9, height: 2.05 })
    const polygons = wallProfile(wall, [door], { extend: 0.12 })
    expect(solidAt(polygons, -0.1, 1)).toBe(true)
    expect(solidAt(polygons, 4.1, 1)).toBe(true)
    expect(solidAt(polygons, 1, 1)).toBe(false)
  })

  it('cuts to a low stub when a maximum height is given, keeping the door gap', () => {
    const door = opening({ kind: 'door', offsetAlongWall: 1, bottom: 0, width: 0.9, height: 2.05 })
    const polygons = wallProfile(wall, [door, opening({})], { maxHeight: 0.3 })
    expect(solidAt(polygons, 3, 0.5)).toBe(false)
    expect(solidAt(polygons, 3, 0.2)).toBe(true)
    expect(solidAt(polygons, 1, 0.2)).toBe(false)
    expect(solidArea(polygons)).toBeCloseTo((4 - 0.9) * 0.3)
  })
})

describe('slabWallProfile (the profile actually rendered)', () => {
  const door = opening({ kind: 'door', offsetAlongWall: 1, bottom: 0, width: 0.9, height: 2.05 })
  const SLAB = 0.08

  it('keeps a floor-level door open from the floor up, with the wall reaching down through the slab (RF1)', () => {
    const polygons = slabWallProfile(wall, [door], { slab: SLAB })
    for (const v of [0.001, 0.5, 1, 2]) expect(solidAt(polygons, 1, v)).toBe(false)
    // Below the floor surface the wall meets the slab edge, including under the doorway.
    expect(solidAt(polygons, 1, -0.04)).toBe(true)
    expect(solidAt(polygons, 3, -0.04)).toBe(true)
    expect(solidAt(polygons, 1, 2.2)).toBe(true)
  })

  it('keeps the door gap in a cut-down stub', () => {
    const polygons = slabWallProfile(wall, [door], { slab: SLAB, maxHeight: 0.3 })
    expect(solidAt(polygons, 1, 0.1)).toBe(false)
    expect(solidAt(polygons, 3, 0.2)).toBe(true)
    expect(solidAt(polygons, 3, 0.35)).toBe(false)
  })
})

describe('wallShapes', () => {
  it('turns each profile polygon into a shape with its holes', () => {
    const shapes = wallShapes(wallProfile(wall, [opening({})]))
    expect(shapes).toHaveLength(1)
    expect(shapes[0]!.holes).toHaveLength(1)
  })
})

describe('wallThickness', () => {
  it('uses a default when the scan gives a zero-depth wall', () => {
    expect(wallThickness(wall)).toBe(DEFAULT_WALL_THICKNESS)
    expect(wallThickness({ ...wall, thickness: 0.2 })).toBe(0.2)
  })
})
