import { describe, expect, it } from 'vitest'
import { validateRecipe, variantBlocks, variantColors, type Recipe } from './recipe'

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
      optionColors: { Fabric: { 'Heather Charcoal': { upholstery: '#4a4b4d' } }, 'Fabric and Wood Finish': { 'Ivory / Walnut': { upholstery: '#efe8d8', legs: '#5B3A24' } } },
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
    expect(error({ ...base, optionColors: { Fabric: { Red: { cape: '#aa0000' } } } })).toMatch(/cape/))
  it('accepts per-value block choices the family declares', () =>
    expect(validateRecipe({ ...base, optionBlocks: { 'Arm Style': { Block: { arm: 'track' }, Round: { arm: 'rolled' } } } }).ok).toBe(true))
  it('rejects a per-value block option the family lacks', () =>
    expect(error({ ...base, optionBlocks: { 'Arm Style': { Wing: { arm: 'wing' } } } })).toMatch(/arm/))
  it('rejects an image on a family without an image slot', () =>
    expect(error({ ...base, image: { url: 'https://cdn.shopify.com/a.jpg' } })).toMatch(/image/))
  it('rejects a non-https image', () =>
    expect(error({ ...base, family: 'art', blocks: {}, params: {}, image: { url: 'http://cdn.shopify.com/a.jpg' } })).toMatch(/image/))
  it('rejects fields it does not know (model output is data, not instructions)', () =>
    expect(error({ ...base, script: 'alert(1)' })).toMatch(/script|Unrecognized/))
  it('rejects an oversized unmatched list', () =>
    expect(error({ ...base, unmatched: Array.from({ length: 50 }, (_, i) => `f${i}`) })).toMatch(/unmatched/))
})

describe('variantColors', () => {
  const recipe = {
    schemaVersion: 1,
    id: 'r',
    family: 'sofa',
    blocks: {},
    params: {},
    tier: 'rules',
    defaultColors: { upholstery: '#b9b2a6', legs: '#6b4a33' },
    optionColors: {
      Fabric: { 'Heather Charcoal': { upholstery: '#4a4b4d' }, 'Moss Green': { upholstery: '#6b7445' } },
      'Leg Finish': { Oak: { legs: '#c49a6c' } },
    },
  } as Recipe

  it('starts from the recipe defaults and applies each chosen option value', () => {
    expect(variantColors(recipe, ['Fabric', 'Leg Finish'], ['Moss Green', 'Oak'])).toEqual({ upholstery: '#6b7445', legs: '#c49a6c' })
  })

  it('keeps defaults for option values it has no color for', () => {
    expect(variantColors(recipe, ['Fabric', 'Leg Finish'], ['Mystery Weave', 'Walnut'])).toEqual({ upholstery: '#b9b2a6', legs: '#6b4a33' })
  })

  it('matches options by name, not position', () => {
    expect(variantColors(recipe, ['Leg Finish', 'Fabric'], ['Oak', 'Heather Charcoal'])).toEqual({ upholstery: '#4a4b4d', legs: '#c49a6c' })
  })

  it('is undefined when the recipe names no colors at all', () => {
    expect(variantColors({ ...recipe, defaultColors: undefined, optionColors: undefined }, [], [])).toBeUndefined()
  })
})

describe('variantBlocks', () => {
  const recipe = {
    blocks: { arm: 'track', back: 'channel' },
    optionBlocks: { 'Arm Style': { Round: { arm: 'rolled' } }, Size: { "8' Round": { shape: 'round' } } },
  } as Pick<Recipe, 'blocks' | 'optionBlocks'>

  it('overrides the recipe blocks with the chosen values', () => {
    expect(variantBlocks(recipe, ['Arm Style'], ['Round'])).toEqual({ arm: 'rolled', back: 'channel' })
  })

  it('is undefined when no chosen value changes a block', () => {
    expect(variantBlocks(recipe, ['Arm Style'], ['Block'])).toBeUndefined()
  })
})
