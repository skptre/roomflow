import { describe, expect, it } from 'vitest'
import { normalizeYaw, poseFromColumnMajor } from './units'

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

describe('poseFromColumnMajor', () => {
  it('reads identity as yaw 0 with the base on the center minus half height', () => {
    const pose = poseFromColumnMajor(IDENTITY, 2)
    expect(pose.yaw).toBeCloseTo(0)
    expect(pose.position).toEqual({ x: 0, y: -1, z: 0 })
  })

  it('reads a +90° rotation about Y as yaw π/2 and moves origin to bottom-center', () => {
    const m = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1.5, 0.4, -2, 1]
    const pose = poseFromColumnMajor(m, 0.8)
    expect(pose.yaw).toBeCloseTo(Math.PI / 2)
    expect(pose.position.x).toBeCloseTo(1.5)
    expect(pose.position.y).toBeCloseTo(0.4 - 0.8 / 2)
    expect(pose.position.z).toBeCloseTo(-2)
  })

  it('rejects matrices that are not 16 finite numbers', () => {
    expect(() => poseFromColumnMajor(IDENTITY.slice(0, 15), 1)).toThrow()
    expect(() => poseFromColumnMajor([...IDENTITY.slice(0, 15), Number.NaN], 1)).toThrow()
  })
})

describe('normalizeYaw', () => {
  it('wraps into (-π, π]', () => {
    expect(normalizeYaw(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeYaw(-Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeYaw(Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeYaw(0)).toBe(0)
    expect(normalizeYaw(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
    expect(normalizeYaw(5 * Math.PI / 2)).toBeCloseTo(Math.PI / 2)
  })
})
