import { describe, expect, it } from 'vitest'
import { assemblies } from '../fixtures/assemblies'
import { Assembly, MAX_PARTS, validateAssembly, type Part } from './assembly'

function part(overrides: Partial<Part> = {}): Part {
  return {
    name: 'block',
    shape: 'box',
    size: [0.5, 0.5, 0.5],
    position: [0, 0.25, 0],
    color: '#aa8866',
    material: 'wood',
    ...overrides,
  }
}

function assembly(parts: Part[]) {
  return { id: 'test', category: 'test', generatorVersion: 'hand-v1', parts }
}

describe('validateAssembly', () => {
  it('accepts parts inside the unit box', () => {
    expect(validateAssembly(assembly([part()])).ok).toBe(true)
  })

  it('rejects more than the part limit', () => {
    const parts = Array.from({ length: MAX_PARTS + 1 }, (_, i) => part({ name: `p${i}`, size: [0.01, 0.01, 0.01] }))
    expect(validateAssembly(assembly(parts)).ok).toBe(false)
  })

  it('rejects an empty assembly', () => {
    expect(validateAssembly(assembly([])).ok).toBe(false)
  })

  it('rejects non-finite numbers', () => {
    expect(validateAssembly(assembly([part({ size: [Number.NaN, 0.5, 0.5] })])).ok).toBe(false)
    expect(validateAssembly(assembly([part({ position: [0, Number.POSITIVE_INFINITY, 0] })])).ok).toBe(false)
  })

  it('rejects a part outside the unit box', () => {
    expect(validateAssembly(assembly([part({ position: [0.4, 0.25, 0] })])).ok).toBe(false)
    expect(validateAssembly(assembly([part({ position: [0, 0.2, 0] })])).ok).toBe(false) // pokes below the floor
  })

  it('rejects a part that only leaves the box once rotated', () => {
    // A plank lying on the floor: tilting it pushes one edge below y = 0.
    const plank = part({ size: [0.9, 0.1, 0.9], position: [0, 0.05, 0] })
    expect(validateAssembly(assembly([plank])).ok).toBe(true)
    expect(validateAssembly(assembly([{ ...plank, rotation: [0.3, 0, 0] }])).ok).toBe(false)
  })

  it('allows a 1% tolerance at the box edge', () => {
    expect(validateAssembly(assembly([part({ size: [1.009, 0.5, 1], position: [0, 0.25, 0] })])).ok).toBe(true)
    expect(validateAssembly(assembly([part({ size: [1.03, 0.5, 1], position: [0, 0.25, 0] })])).ok).toBe(false)
  })

  it('rejects unknown materials and malformed colors', () => {
    expect(Assembly.safeParse(assembly([{ ...part(), material: 'lava' } as unknown as Part])).success).toBe(false)
    expect(validateAssembly(assembly([part({ color: 'brown' })])).ok).toBe(false)
  })

  it('never accepts code or unknown keys as geometry', () => {
    const withCode = { ...part(), onRender: 'alert(1)' } as unknown as Part
    const result = validateAssembly(assembly([withCode]))
    expect(result.ok).toBe(true)
    if (result.ok) expect('onRender' in result.assembly.parts[0]!).toBe(false)
  })
})

describe('fixture assemblies', () => {
  it.each(Object.values(assemblies).map((a) => [a.id, a] as const))('%s is valid', (_id, fixture) => {
    const result = validateAssembly(fixture)
    if (!result.ok) throw new Error(result.error)
    expect(result.ok).toBe(true)
  })

  it('covers the categories captured objects map to', () => {
    for (const id of ['bed', 'desk', 'desk-chair', 'sofa', 'dresser']) expect(assemblies[id]).toBeDefined()
  })

  it('has at least 16 composed pieces', () => {
    expect(Object.keys(assemblies).length).toBeGreaterThanOrEqual(16)
  })
})
