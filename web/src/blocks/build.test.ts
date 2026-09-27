import { describe, expect, it } from 'vitest'
import { acquireModel, cachedModelCount, resolveShape, slotLooks } from './build'
import { FAMILIES } from './families'
import type { Recipe } from './recipe'

const sofa: Recipe = { schemaVersion: 1, id: 'test:sofa', family: 'sofa', blocks: { base: 'metal-legs' }, params: {}, tier: 'default' }
const size = { width: 2, height: 0.85, depth: 0.9 }

describe('resolveShape', () => {
  it('fills defaults, ignores unknown options, clamps and rounds params', () => {
    const shape = resolveShape(FAMILIES.sofa!, size, { arm: 'tentacle', back: 'channel' }, { legHeight: 9, seatCushions: 2.6 })
    expect(shape.blocks.arm).toBe('track')
    expect(shape.blocks.back).toBe('channel')
    expect(shape.params.legHeight).toBe(0.3)
    expect(shape.params.seatCushions).toBe(3)
  })
})

describe('acquireModel', () => {
  it('merges each slot into one geometry and reports slot materials', () => {
    const { model, release } = acquireModel(sofa, size)
    expect(model.slots.map((s) => s.slot).sort()).toEqual(['legs', 'upholstery'])
    for (const slot of model.slots) expect(slot.geometry.getAttribute('position').count).toBeGreaterThan(0)
    // metal-legs suggests a black metal for the legs slot.
    const legs = slotLooks(sofa, model).find((s) => s.slot === 'legs')
    expect(legs?.kind).toBe('metal')
    expect(legs?.color).toBe('#2b2b2c')
    release()
  })

  it('shares one model between users of the same shape and size, and frees it once unused', () => {
    const before = cachedModelCount()
    const a = acquireModel(sofa, size)
    const b = acquireModel({ ...sofa, id: 'another:sofa' }, { ...size })
    expect(b.model).toBe(a.model)
    a.release()
    b.release()
    // Released models linger in a small pool, so re-acquiring is instant...
    expect(acquireModel(sofa, size).model).toBe(a.model)
    expect(cachedModelCount()).toBeLessThanOrEqual(before + 1)
  })

  it('builds a different model for a different size', () => {
    const a = acquireModel(sofa, size)
    const b = acquireModel(sofa, { ...size, width: 2.4 })
    expect(b.model).not.toBe(a.model)
    a.release()
    b.release()
  })

  it('recipe materials and colors beat build suggestions, and variant colors beat both', () => {
    const recipe: Recipe = { ...sofa, materialKind: { legs: 'wood' }, defaultColors: { legs: '#6b4a33' } }
    const { model, release } = acquireModel(recipe, size)
    expect(slotLooks(recipe, model).find((s) => s.slot === 'legs')).toMatchObject({ kind: 'wood', color: '#6b4a33' })
    expect(slotLooks(recipe, model, { legs: '#c8a57a' }).find((s) => s.slot === 'legs')?.color).toBe('#c8a57a')
    release()
  })
})
