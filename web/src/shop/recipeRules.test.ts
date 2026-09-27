import { describe, expect, it } from 'vitest'
import { validateRecipe, variantBlocks, variantColors } from '../blocks/recipe'
import fixtures from './__fixtures__/shopify-products.json'
import { COLOR_LEXICON } from './colors'
import { normalizeProduct } from './normalize'
import { rulesRecipe, rulesTrace } from './recipeRules'
import { ShopifyProduct } from './shopify'
import type { SnapshotProduct } from './snapshot'
import { storeByDomain } from './stores'

const hex = (name: string) => COLOR_LEXICON[name]!.hex

function fromFixture(value: unknown, domain: string): SnapshotProduct {
  const result = normalizeProduct(ShopifyProduct.parse(structuredClone(value)), storeByDomain(domain)!)
  if (!('product' in result)) throw new Error(`excluded: ${result.excluded}`)
  return result.product
}

/** A listing with only what the rules read. */
function listing(category: string, name: string, options: Record<string, string[]> = {}, tags: string[] = []): SnapshotProduct {
  const optionNames = Object.keys(options)
  const columns = Object.values(options)
  const count = Math.max(1, ...columns.map((values) => values.length))
  return {
    id: `shop:example.com:${name.length}`,
    name,
    category,
    tags,
    vendor: 'Example',
    store: 'Example',
    storeDomain: 'example.com',
    handle: 'x',
    url: 'https://example.com/products/x',
    imageUrl: 'https://cdn.shopify.com/s/files/x.jpg',
    optionNames,
    variants: Array.from({ length: count }, (_, i) => ({
      sid: i + 1,
      optionValues: columns.map((values) => values[i % values.length]!),
      dimensions: { width: 1, height: 1, depth: 1, source: 'estimated' as const },
      price: null,
      available: true,
    })),
  }
}

function expectValid(recipe: unknown) {
  const result = validateRecipe(recipe)
  expect(result.ok ? '' : result.error).toBe('')
}

describe('rulesRecipe — real listings', () => {
  it('Burrow sofa: fabric colors the upholstery, leg finish the legs, arm style picks the arm', () => {
    const product = fromFixture(fixtures.burrowSofa, 'www.burrow.com')
    const recipe = rulesRecipe(product)
    expectValid(recipe)
    expect(recipe).toMatchObject({ id: `rules:${product.id}`, productId: product.id, family: 'sofa', tier: 'rules' })
    expect(recipe.optionColors?.Fabric?.['Ivory - Performance Basketweave']).toEqual({ upholstery: hex('ivory') })
    expect(recipe.optionColors?.['Leg Finish']?.['Walnut - Wood']).toEqual({ legs: hex('walnut') })
    expect(recipe.optionColors?.['Leg Finish']?.['Black - Metal']).toEqual({ legs: hex('black') })
    expect(recipe.optionBlocks?.['Arm Style']?.Block).toEqual({ arm: 'track' })
    expect(recipe.evidence).toEqual({ colors: 'name', shape: 'matched' })
    expect(variantColors(recipe, product.optionNames, ['Ivory - Performance Basketweave', 'Oak - Wood', 'Block'])).toMatchObject({
      upholstery: hex('ivory'),
      legs: hex('oak'),
    })
  })

  it('Poly & Bark leather sectional: left-facing L, leather upholstery, sleeper noted as unmatched', () => {
    const recipe = rulesRecipe(fromFixture(fixtures.polyAndBarkSectional, 'polyandbark.com'))
    expectValid(recipe)
    expect(recipe.blocks.shape).toBe('L-left')
    expect(recipe.materialKind?.upholstery).toBe('leather')
    expect(recipe.optionColors?.Color?.['Chocolate Brown']?.upholstery).toBe(hex('chocolate'))
    expect(recipe.unmatched).toContain('sleeper')
  })

  it('curtain without a color option takes its color from an exact color tag', () => {
    const recipe = rulesRecipe(fromFixture(fixtures.curtain, 'halfpricedrapes.com'))
    expectValid(recipe)
    expect(recipe.family).toBe('curtain')
    expect(recipe.defaultColors).toEqual({ fabric: hex('blue') })
    expect(recipe.evidence?.colors).toBe('name')
  })

  it('art print shows its own photo, unframed unless the listing says framed', () => {
    const product = fromFixture(fixtures.artPrint, 'juniperprintshop.com')
    const recipe = rulesRecipe(product)
    expectValid(recipe)
    expect(recipe.image?.url).toBe(product.imageUrl)
    expect(recipe.blocks.frame).toBe('none')
    expect(rulesRecipe(listing('wall-art', 'Leaf Study Framed Print')).blocks.frame).toBe('thin')
  })

  it('rug shows its photo and takes a fallback color from the title', () => {
    const recipe = rulesRecipe(fromFixture(fixtures.rug, 'loloirugs.com'))
    expectValid(recipe)
    expect(recipe.image).toBeDefined()
    expect(recipe.defaultColors?.top).toBe(hex('ivory'))
  })
})

describe('rulesRecipe — keywords', () => {
  it('reads whole words only ("outdoor" is not a door)', () => {
    expect(rulesRecipe(listing('cabinet', 'Outdoor Storage Cabinet')).blocks.layout).toBe('doors') // category default
    expect(rulesRecipe(listing('cabinet', 'Open Bookcase Cabinet')).blocks.layout).toBe('shelves')
    expect(rulesRecipe(listing('nightstand', 'Outdoor Side Nightstand')).blocks.layout).toBe('drawer-shelf')
  })

  it('counts drawers into rows and columns', () => {
    expect(rulesRecipe(listing('dresser', 'Wren 6-Drawer Dresser'))).toMatchObject({ blocks: { layout: 'drawers' }, params: { rows: 3, cols: 2 } })
    expect(rulesRecipe(listing('nightstand', 'Two Drawer Nightstand'))).toMatchObject({ blocks: { layout: 'drawers' }, params: { rows: 2, cols: 1 } })
  })

  it('shapes tables, lamps, beds, plants, mirrors and chaises from the title', () => {
    expect(rulesRecipe(listing('dining-table', 'Round Pedestal Dining Table')).blocks).toMatchObject({ top: 'round', base: 'pedestal' })
    expect(rulesRecipe(listing('floor-lamp', 'Arc Floor Lamp')).blocks.stem).toBe('arc')
    expect(rulesRecipe(listing('bed', 'Channel Tufted Upholstered Bed')).blocks).toMatchObject({ headboard: 'channel', frame: 'upholstered' })
    expect(rulesRecipe(listing('plant', 'Fiddle Leaf Fig')).blocks.plant).toBe('fiddle')
    expect(rulesRecipe(listing('plant', 'Snake Plant Laurentii')).blocks.plant).toBe('snake')
    expect(rulesRecipe(listing('plant', 'Monstera Deliciosa')).blocks.plant).toBe('bush')
    expect(rulesRecipe(listing('mirror', 'Arched Floor Mirror')).blocks.shape).toBe('arch')
    expect(rulesRecipe(listing('sectional', 'Nomad Left Chaise Sectional')).blocks.shape).toBe('chaise-left')
    expect(rulesRecipe(listing('sectional', 'Nomad Chaise Sectional')).blocks.shape).toBe('chaise-right')
  })

  it('records shape as default when no keyword applied', () => {
    expect(rulesRecipe(listing('sofa', 'The Lucia')).evidence?.shape).toBe('default')
  })
})

describe('rulesRecipe — options', () => {
  it('one finish colors every wood part of a table; a two-part value paints two slots', () => {
    const table = rulesRecipe(listing('coffee-table', 'Coffee Table', { Finish: ['Walnut', 'Natural Oak'] }))
    expect(table.optionColors?.Finish?.Walnut).toEqual({ top: hex('walnut'), base: hex('walnut') })
    const sofa = rulesRecipe(listing('sofa', 'Sofa', { 'Fabric and Wood Finish': ['Ivory / Walnut'] }))
    expect(sofa.optionColors?.['Fabric and Wood Finish']?.['Ivory / Walnut']).toEqual({ upholstery: hex('ivory'), legs: hex('walnut') })
  })

  it('hardware options color only the handles; size options color nothing', () => {
    const dresser = rulesRecipe(listing('dresser', 'Dresser', { 'Hardware Color': ['Brass'], Size: ['Large'] }))
    expect(dresser.optionColors?.['Hardware Color']?.Brass).toEqual({ handles: hex('brass') })
    expect(dresser.optionColors?.Size).toBeUndefined()
  })

  it('metal leg finishes make the legs metal when most values are metal', () => {
    const sofa = rulesRecipe(listing('sofa', 'Sofa', { 'Leg Finish': ['Brass - Metal', 'Black - Metal', 'Walnut - Wood'] }))
    expect(sofa.materialKind?.legs).toBe('metal')
  })

  it('rug sizes that are round make those variants round', () => {
    const rug = rulesRecipe(listing('rug', 'Rug', { Size: ["5' x 8'", "8' Round"] }))
    expect(rug.optionBlocks?.Size?.["8' Round"]).toEqual({ shape: 'round' })
    expect(variantBlocks(rug, ['Size'], ["5' x 8'"])).toBeUndefined()
  })

  it('leaves names it cannot read uncolored rather than guessing', () => {
    const sofa = rulesRecipe(listing('sofa', 'Sofa', { Fabric: ['Water Lily'] }))
    expect(sofa.optionColors).toBeUndefined()
    expect(sofa.evidence?.colors).toBe('default')
  })
})

describe('rulesRecipe — families without the block', () => {
  it('ignores a leg-style option on a family that has no leg style (Burrow bed)', () => {
    const bed = rulesRecipe(listing('bed', 'Bed', { 'Leg Style': ['Tapered', 'Straight'] }))
    expect(bed.optionBlocks).toBeUndefined()
  })
})

describe('rulesRecipe — decor and planters', () => {
  it('draws trays as trays', () => {
    expect(rulesRecipe(listing('decor-object', 'Stacking Tray Set')).blocks.profile).toBe('tray')
    expect(rulesRecipe(listing('decor-object', 'Round Tray')).blocks.profile).toBe('round-tray')
    expect(rulesRecipe(listing('decor-object', 'Tray, Round Marble')).blocks.profile).toBe('round-tray')
  })

  it('a planter is sold empty: the plant choice is decided by the listing, not a photo', () => {
    const { recipe, fired } = rulesTrace(listing('planter', 'Isabella Ceramic Planter'))
    expect(recipe.blocks.plant).toBe('none')
    expect(fired.has('plant')).toBe(true)
  })
})

describe('rulesRecipe — names on the wrong part', () => {
  it('hardware options color only handles, never a bed frame', () => {
    expect(rulesRecipe(listing('bed', 'Bed', { 'Hardware Color': ['Black', 'White'] })).optionColors).toBeUndefined()
    expect(rulesRecipe(listing('dresser', 'Dresser', { 'Hardware Color': ['Black'] })).optionColors?.['Hardware Color']?.Black).toEqual({ handles: COLOR_LEXICON.black!.hex })
  })

  it('a wood or metal name does not color fabric ("Pine" upholstery is a green, not pine wood)', () => {
    expect(rulesRecipe(listing('sofa', 'Sofa', { Upholstery: ['Pine', 'Navy'] })).optionColors?.Upholstery).toEqual({ Navy: { upholstery: COLOR_LEXICON.navy!.hex } })
  })
})

describe('rulesRecipe — swivel chairs', () => {
  it('a swivel chair sits on a swivel base', () => {
    const recipe = rulesRecipe(listing('lounge-chair', 'The Vera Swivel Chair'))
    expect(recipe.blocks.base).toBe('swivel')
    expect(recipe.unmatched ?? []).not.toContain('swivel')
  })
})
