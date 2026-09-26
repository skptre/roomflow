import { describe, expect, it } from 'vitest'
import { clampIntoRoom, footprint, footprintBounds, footprintsOverlap, insideRoom, type Placed } from './geometry'

const ROOM = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 4, z: 3.5 },
  { x: 0, z: 3.5 },
]

function placed(x: number, z: number, width: number, depth: number, yaw = 0): Placed {
  return { pose: { position: { x, y: 0, z }, yaw }, dimensions: { width, depth } }
}

describe('footprint', () => {
  it('spans the width along X at yaw 0', () => {
    const bounds = footprintBounds(footprint(placed(2, 1, 2, 1)))
    expect(bounds.maxX - bounds.minX).toBeCloseTo(2)
    expect(bounds.maxZ - bounds.minZ).toBeCloseTo(1)
  })

  it('swaps extents for a desk rotated 90°', () => {
    const bounds = footprintBounds(footprint(placed(2, 1, 2, 1, Math.PI / 2)))
    expect(bounds.maxX - bounds.minX).toBeCloseTo(1)
    expect(bounds.maxZ - bounds.minZ).toBeCloseTo(2)
  })

  it('turns local +X toward -Z for positive yaw', () => {
    const corners = footprint(placed(0, 0, 2, 0.0001, Math.PI / 2))
    const xs = corners.map((c) => c.x)
    const zs = corners.map((c) => c.z)
    expect(Math.max(...xs.map(Math.abs))).toBeCloseTo(0)
    expect(Math.min(...zs)).toBeCloseTo(-1)
    expect(Math.max(...zs)).toBeCloseTo(1)
  })
})

describe('footprintsOverlap', () => {
  it('treats a shared edge as touching, not overlapping', () => {
    expect(footprintsOverlap(placed(0.5, 0.5, 1, 1), placed(1.5, 0.5, 1, 1))).toBe(false)
  })

  it('detects real overlap', () => {
    expect(footprintsOverlap(placed(0.5, 0.5, 1, 1), placed(1.2, 0.5, 1, 1))).toBe(true)
  })

  it('uses the rotated shape for a 45° square (SAT)', () => {
    // The diamond's axis-aligned bounds reach ±0.707 and would overlap the square's
    // corner at (0.6, 0.6); the diamond itself only reaches x + z = 0.707.
    const diamond = placed(0, 0, 1, 1, Math.PI / 4)
    expect(footprintsOverlap(diamond, placed(1.1, 1.1, 1, 1))).toBe(false)
    expect(footprintsOverlap(diamond, placed(1.0, 0, 1, 1))).toBe(true)
  })

  it('uses the swapped footprint of a rotated desk', () => {
    // A 2×1 desk at x=1 rotated 90° spans x 0.5..1.5, so a box at x 1.85..2.35 is clear.
    const box = placed(2.1, 1, 0.5, 0.5)
    expect(footprintsOverlap(placed(1, 1, 2, 1, Math.PI / 2), box)).toBe(false)
    expect(footprintsOverlap(placed(1, 1, 2, 1), box)).toBe(true)
  })
})

describe('insideRoom', () => {
  it('accepts an object fully inside, including one touching the wall', () => {
    expect(insideRoom(placed(1, 1, 1, 1), ROOM)).toBe(true)
    expect(insideRoom(placed(0.5, 0.5, 1, 1), ROOM)).toBe(true)
  })

  it('rejects an object half outside', () => {
    expect(insideRoom(placed(-0.2, 1, 1, 1), ROOM)).toBe(false)
  })

  describe('in an L-shaped room', () => {
    const lRoom = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 2 },
      { x: 2, z: 2 },
      { x: 2, z: 4 },
      { x: 0, z: 4 },
    ]

    it('accepts objects in either arm', () => {
      expect(insideRoom(placed(2, 1, 3.8, 0.5), lRoom)).toBe(true)
      expect(insideRoom(placed(1, 3, 1, 1), lRoom)).toBe(true)
    })

    it('rejects an object in the missing corner', () => {
      expect(insideRoom(placed(3, 3, 1, 1), lRoom)).toBe(false)
    })

    it('rejects a long object whose corners are inside but whose middle crosses the notch', () => {
      // Thin rod from about (3.49, 1.51) to (1.51, 3.49); its middle passes (2.5, 2.5).
      expect(insideRoom(placed(2.5, 2.5, 2.8, 0.05, Math.PI / 4), lRoom)).toBe(false)
    })
  })
})

describe('clampIntoRoom', () => {
  it('moves a half-outside object fully inside without changing yaw or size', () => {
    const desk = placed(-0.2, 1, 2, 1, Math.PI / 2)
    const pose = clampIntoRoom(desk, ROOM)
    expect(pose).not.toBeNull()
    expect(pose!.yaw).toBe(desk.pose.yaw)
    expect(insideRoom({ pose: pose!, dimensions: desk.dimensions }, ROOM)).toBe(true)
    // Rotated, the desk is 1 m wide in X, so it lands against the wall at x = 0.5; z is untouched.
    expect(pose!.position.x).toBeCloseTo(0.5)
    expect(pose!.position.z).toBeCloseTo(1)
    expect(pose!.position.y).toBe(0)
  })

  it('returns the same pose when already inside', () => {
    const chair = placed(2, 2, 0.5, 0.5, 0.3)
    expect(clampIntoRoom(chair, ROOM)).toEqual(chair.pose)
  })

  it('finds the nearest fit in a U-shaped room whose centroid lies outside the floor', () => {
    // Notch x 2..4, z 1..4 is outside; the area centroid (3, 1.83) falls inside the notch.
    const uRoom = [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 4 },
      { x: 4, z: 4 },
      { x: 4, z: 1 },
      { x: 2, z: 1 },
      { x: 2, z: 4 },
      { x: 0, z: 4 },
    ]
    const box = placed(3, 3, 1, 1, 0.2)
    const pose = clampIntoRoom(box, uRoom)
    expect(pose).not.toBeNull()
    expect(pose!.yaw).toBe(box.pose.yaw)
    expect(insideRoom({ pose: pose!, dimensions: box.dimensions }, uRoom)).toBe(true)
    // Nearest arm is about 1.6 m away sideways, not 2.4 m down to the bottom band.
    const moved = Math.hypot(pose!.position.x - 3, pose!.position.z - 3)
    expect(moved).toBeLessThan(1.8)
  })

  it('returns null when the object cannot fit at that yaw', () => {
    expect(clampIntoRoom(placed(2, 2, 5, 1), ROOM)).toBeNull()
  })
})
