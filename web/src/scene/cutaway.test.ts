import { describe, expect, it } from 'vitest'
import type { Vec2, Wall } from '../domain/schema'
import { CUT_OFF, CUT_ON, wallsToCut } from './cutaway'

const floor: Vec2[] = [
  { x: -2, z: -1.75 },
  { x: 2, z: -1.75 },
  { x: 2, z: 1.75 },
  { x: -2, z: 1.75 },
]

function wall(id: string, start: Vec2, end: Vec2, exterior = true): Wall {
  return { id, start, end, height: 2.5, thickness: 0, exterior }
}

const walls = [
  wall('south', { x: -2, z: -1.75 }, { x: 2, z: -1.75 }),
  wall('east', { x: 2, z: -1.75 }, { x: 2, z: 1.75 }),
  wall('north', { x: 2, z: 1.75 }, { x: -2, z: 1.75 }),
  wall('west', { x: -2, z: 1.75 }, { x: -2, z: -1.75 }),
]

/** Horizontal direction from the orbit target toward the camera. */
function dir(x: number, z: number): Vec2 {
  const length = Math.hypot(x, z)
  return { x: x / length, z: z / length }
}

describe('wallsToCut', () => {
  it('cuts the exterior wall between the camera and the room', () => {
    expect([...wallsToCut(walls, floor, dir(0, 1), new Set())]).toEqual(['north'])
  })

  it('cuts both walls of the corner the camera looks over', () => {
    expect([...wallsToCut(walls, floor, dir(1, 1), new Set())].sort()).toEqual(['east', 'north'])
  })

  it('does not flicker on small camera jitter around the threshold', () => {
    // East wall's facing = the camera direction's x component.
    const between = (CUT_ON + CUT_OFF) / 2
    const jitter = dir(between, Math.sqrt(1 - between * between))
    expect(wallsToCut(walls, floor, jitter, new Set(['east'])).has('east')).toBe(true)
    expect(wallsToCut(walls, floor, jitter, new Set()).has('east')).toBe(false)
  })

  it('restores a wall once the camera has clearly moved away', () => {
    const below = CUT_OFF - 0.05
    expect(wallsToCut(walls, floor, dir(below, Math.sqrt(1 - below * below)), new Set(['east'])).has('east')).toBe(false)
  })

  it('never cuts an interior partition', () => {
    const partition = wall('partition', { x: -2, z: 0 }, { x: 0, z: 0 }, false)
    expect(wallsToCut([...walls, partition], floor, dir(0, 1), new Set()).has('partition')).toBe(false)
  })

  it('cuts nothing when looking straight down', () => {
    expect(wallsToCut(walls, floor, { x: 0, z: 0 }, new Set()).size).toBe(0)
  })
})
