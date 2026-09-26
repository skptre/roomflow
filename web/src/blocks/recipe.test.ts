import { describe, expect, it } from 'vitest'
import { validateRecipe } from './recipe'

const base = {
  schemaVersion: 1,
  id: 'test:sofa',
  family: 'sofa',
  blocks: { arm: 'rolled', base: 'metal-legs' },
  params: { seatCushions: 3, legHeight: 0.15 },
  tier: 'rules',
}

function error(input: unknown) {
  const result = validateRecipe(input)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}

describe('validateRecipe', () => {
  it('accepts a minimal recipe and fills empty blocks/params', () => {
    const result = validateRecipe({ schemaVersion: 1, id: 'x', family: 'chair', tier: 'default' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.recipe.blocks).toEqual({})
  })

  it('accepts block choices, params, slot kinds and colors the family declares', () => {
    const result = validateRecipe({
      ...base,
      materialKind: { legs: 'metal' },
      defaultColors: { upholstery: '#4A4B4D', legs: '#2b2b2c' },
      optionColors: { Fabric: { slot: 'upholstery', values: { 'Heather Charcoal': '#4a4b4d' } } },
    })
    expect(result.ok).toBe(true)
    // Hex colors are normalized to lowercase.
    if (result.ok) expect(result.recipe.defaultColors?.upholstery).toBe('#4a4b4d')
  })

  it('rejects an unknown family', () => expect(error({ ...base, family: 'spaceship' })).toMatch(/family/))
  it('rejects an unknown block', () => expect(error({ ...base, blocks: { wings: 'yes' } })).toMatch(/wings/))
  it('rejects a block option the family lacks', () => expect(error({ ...base, blocks: { arm: 'tentacle' } })).toMatch(/arm/))
  it('rejects an unknown param', () => expect(error({ ...base, params: { glow: 1 } })).toMatch(/glow/))
  it('rejects a param outside its range', () => expect(error({ ...base, params: { legHeight: 2 } })).toMatch(/legHeight/))
  it('rejects a fractional count', () => expect(error({ ...base, params: { seatCushions: 2.5 } })).toMatch(/seatCushions/))
  it('rejects a malformed color', () => expect(error({ ...base, defaultColors: { upholstery: 'charcoal' } })).toMatch(/defaultColors/))
  it('rejects a slot the family lacks', () => expect(error({ ...base, defaultColors: { cape: '#000000' } })).toMatch(/cape/))
  it('rejects an option color mapped to an unknown slot', () =>
    expect(error({ ...base, optionColors: { Fabric: { slot: 'cape', values: { Red: '#aa0000' } } } })).toMatch(/cape/))
  it('rejects an image on a family without an image slot', () =>
    expect(error({ ...base, image: { url: 'https://cdn.shopify.com/a.jpg' } })).toMatch(/image/))
  it('rejects a non-https image', () =>
    expect(error({ ...base, family: 'art', blocks: {}, params: {}, image: { url: 'http://cdn.shopify.com/a.jpg' } })).toMatch(/image/))
  it('rejects fields it does not know (model output is data, not instructions)', () =>
    expect(error({ ...base, script: 'alert(1)' })).toMatch(/script|Unrecognized/))
  it('rejects an oversized unmatched list', () =>
    expect(error({ ...base, unmatched: Array.from({ length: 50 }, (_, i) => `f${i}`) })).toMatch(/unmatched/))
})
