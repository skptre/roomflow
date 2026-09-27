/**
 * SAMPLE catalog — invented products for trying the app without live search.
 * Not real listings: no links, merchant "Sample catalog", every offer flagged
 * `isSample`, and the UI shows a "Sample" badge. Prices are illustrative USD.
 * Sizes are separate variants; finishes are the category's default block
 * recipe with different slot colors.
 */
import { defaultRecipeId } from '../blocks/registry'
import type { CatalogEntry } from '../domain/catalog'
import type { Offer } from '../domain/schema'

type Size = [width: number, height: number, depth: number]
type Colors = Record<string, string>
type VariantSpec = { key: string; label: string; size: Size; price: number | null; colors?: Colors }

const RETRIEVED_AT = '2026-09-26T00:00:00.000Z'

function product(
  id: string,
  name: string,
  category: string,
  tags: string[],
  variants: VariantSpec[],
  productColors?: Colors,
): CatalogEntry[] {
  const recipeId = defaultRecipeId(category)
  if (!recipeId) throw new Error(`No default recipe for ${category}`)
  return variants.map((spec) => {
    const variantId = `v-${id}-${spec.key}`
    const colors = spec.colors ?? productColors
    return {
      product: { id: `p-${id}`, name, category, tags },
      variant: {
        id: variantId,
        productId: `p-${id}`,
        label: spec.label,
        dimensions: { width: spec.size[0], height: spec.size[1], depth: spec.size[2], source: 'merchant' },
        asset: colors ? { kind: 'recipe', recipeId, colors } : { kind: 'recipe', recipeId },
      },
      offer: {
        id: `o-${id}-${spec.key}`,
        variantId,
        merchant: 'Sample catalog',
        price: spec.price === null ? null : { amountMinor: spec.price, currency: 'USD' },
        retrievedAt: RETRIEVED_AT,
        isSample: true,
      },
    }
  })
}

const lightWood = { body: '#e8e4dd', fronts: '#e8e4dd', base: '#bdb7ae' }
const blackWood = { body: '#3b3a38', fronts: '#3b3a38', base: '#2f2f31' }

export const sampleCatalog: CatalogEntry[] = [
  // Beds
  ...product('alder-bed', 'Alder Platform Bed', 'bed', ['warm', 'natural', 'oak'], [
    { key: 'full', label: 'Full', size: [1.4, 1.0, 2.0], price: 54900 },
    { key: 'queen', label: 'Queen', size: [1.6, 1.0, 2.1], price: 64900 },
    { key: 'king', label: 'King', size: [1.95, 1.0, 2.1], price: 79900 },
  ]),
  ...product('mono-bed', 'Mono Upholstered Bed', 'bed', ['minimal', 'fabric'], [
    { key: 'queen', label: 'Queen', size: [1.6, 1.1, 2.15], price: 89900 },
    { key: 'king', label: 'King', size: [1.95, 1.1, 2.15], price: 104900 },
  ], { frame: '#d9d6d0', headboard: '#d9d6d0', pillows: '#e6e3dd' }),
  ...product('fiesta-bed', 'Fiesta Bed', 'bed', ['colorful', 'cozy'], [
    { key: 'queen', label: 'Queen', size: [1.6, 0.95, 2.1], price: 72900 },
  ], { bedding: '#e6a23c', pillows: '#3e7c8c' }),

  // Nightstands
  ...product('alder-nightstand', 'Alder Nightstand', 'nightstand', ['warm', 'natural', 'oak'], [
    { key: 'std', label: 'Standard', size: [0.45, 0.55, 0.4], price: 14900 },
  ]),
  ...product('slate-nightstand', 'Slate Nightstand', 'nightstand', ['minimal'], [
    { key: 'white', label: 'White', size: [0.4, 0.5, 0.35], price: 11900, colors: { ...lightWood, handles: '#8f8f8f' } },
    { key: 'black', label: 'Black', size: [0.4, 0.5, 0.35], price: 12900, colors: { ...blackWood, handles: '#8f8f8f' } },
  ]),
  ...product('rattan-nightstand', 'Rattan Nightstand', 'nightstand', ['natural', 'cozy', 'rattan'], [
    // Deliberately unpriced: exercises "price unknown" everywhere.
    { key: 'std', label: 'Standard', size: [0.5, 0.6, 0.4], price: null },
  ], { body: '#d9bf8c', fronts: '#c8a874', base: '#c8a874' }),

  // Dressers
  ...product('alder-dresser', 'Alder Dresser', 'dresser', ['warm', 'natural', 'oak'], [
    { key: 'std', label: '6 drawers', size: [1.0, 0.8, 0.45], price: 49900 },
    { key: 'wide', label: 'Wide', size: [1.4, 0.8, 0.45], price: 64900 },
  ]),
  ...product('linea-dresser', 'Linea Dresser', 'dresser', ['minimal'], [
    { key: 'std', label: 'Standard', size: [1.2, 0.75, 0.45], price: 57900 },
  ], { ...lightWood, handles: '#c9c6c0' }),

  // Desks
  ...product('alder-desk', 'Alder Writing Desk', 'desk', ['warm', 'natural', 'oak'], [
    { key: '120', label: '120 cm', size: [1.2, 0.75, 0.6], price: 32900 },
    { key: '140', label: '140 cm', size: [1.4, 0.75, 0.7], price: 37900 },
  ]),
  ...product('studio-desk', 'Studio Desk', 'desk', ['minimal', 'metal'], [
    { key: 'std', label: 'Standard', size: [1.1, 0.74, 0.55], price: 24900 },
  ], { top: '#ece8e1' }),
  ...product('walnut-desk', 'Walnut Desk', 'desk', ['warm', 'walnut'], [
    { key: 'std', label: 'Standard', size: [1.3, 0.76, 0.65], price: 45900 },
  ], { top: '#6e4f39', base: '#6e4f39' }),

  // Desk chairs
  ...product('alder-chair', 'Alder Chair', 'desk-chair', ['warm', 'natural', 'oak'], [
    { key: 'charcoal', label: 'Charcoal seat', size: [0.5, 0.9, 0.52], price: 13900, colors: { seat: '#595b61' } },
    { key: 'linen', label: 'Linen seat', size: [0.5, 0.9, 0.52], price: 14900, colors: { seat: '#d8cfc0' } },
  ]),
  ...product('mono-chair', 'Mono Chair', 'desk-chair', ['minimal', 'metal'], [
    { key: 'std', label: 'Standard', size: [0.48, 0.85, 0.5], price: 11900 },
  ], { frame: '#2f2f31', seat: '#8a8d92' }),
  ...product('pop-chair', 'Pop Chair', 'desk-chair', ['colorful'], [
    { key: 'std', label: 'Standard', size: [0.48, 0.86, 0.5], price: 12900 },
  ], { frame: '#d65a3a', seat: '#f0c94a' }),

  // Bookshelves
  ...product('alder-shelf', 'Alder Bookshelf', 'bookshelf', ['warm', 'natural', 'oak'], [
    { key: 'std', label: '80 cm', size: [0.8, 1.8, 0.32], price: 25900 },
    { key: 'narrow', label: 'Tall narrow', size: [0.6, 2.0, 0.3], price: 22900 },
  ]),
  ...product('open-shelf', 'Open Shelf', 'bookshelf', ['minimal'], [
    { key: 'std', label: 'Standard', size: [0.9, 1.6, 0.3], price: 19900 },
  ], { body: '#efece6', base: '#e3dfd8' }),

  // Sofas
  ...product('harbor-sofa', 'Harbor Sofa', 'sofa', ['cozy', 'fabric'], [
    { key: 'three', label: '3-seat, charcoal', size: [2.0, 0.85, 0.9], price: 119900, colors: { upholstery: '#595b61' } },
    { key: 'love', label: 'Loveseat, charcoal', size: [1.6, 0.85, 0.9], price: 94900, colors: { upholstery: '#595b61' } },
    { key: 'oat', label: '3-seat, oat', size: [2.0, 0.85, 0.9], price: 124900, colors: { upholstery: '#d9ccb6' } },
  ]),
  ...product('terra-sofa', 'Terra Sofa', 'sofa', ['warm', 'colorful'], [
    { key: 'std', label: 'Standard', size: [2.1, 0.8, 0.95], price: 139900 },
  ], { upholstery: '#b8674a' }),
  ...product('sage-sofa', 'Sage Sofa', 'sofa', ['natural', 'cozy'], [
    { key: 'std', label: 'Standard', size: [1.9, 0.84, 0.9], price: 114900 },
  ], { upholstery: '#9fae96' }),

  // Lounge chairs
  ...product('reed-lounge', 'Reed Lounge Chair', 'lounge-chair', ['natural', 'warm', 'oak'], [
    { key: 'std', label: 'Standard', size: [0.75, 0.8, 0.8], price: 44900 },
  ]),
  ...product('mono-lounge', 'Mono Lounge Chair', 'lounge-chair', ['minimal'], [
    { key: 'std', label: 'Standard', size: [0.72, 0.78, 0.78], price: 39900 },
  ], { upholstery: '#cfd1d3', legs: '#2f2f31' }),
  ...product('sun-lounge', 'Sun Lounge Chair', 'lounge-chair', ['colorful'], [
    { key: 'std', label: 'Standard', size: [0.74, 0.8, 0.8], price: 42900 },
  ], { upholstery: '#e8b34b' }),

  // Coffee tables
  ...product('alder-coffee', 'Alder Coffee Table', 'coffee-table', ['warm', 'natural', 'oak'], [
    { key: 'std', label: '100 cm', size: [1.0, 0.42, 0.55], price: 22900 },
    { key: 'large', label: '120 cm', size: [1.2, 0.42, 0.6], price: 26900 },
  ]),
  ...product('slab-coffee', 'Slab Coffee Table', 'coffee-table', ['minimal'], [
    { key: 'std', label: 'Standard', size: [1.1, 0.38, 0.6], price: 24900 },
  ], { top: '#e9e6e0', base: '#bdb8b0' }),

  // Floor lamps
  ...product('linen-floor-lamp', 'Linen Floor Lamp', 'floor-lamp', ['warm', 'natural', 'linen'], [
    { key: 'std', label: 'Standard', size: [0.4, 1.6, 0.4], price: 14900 },
  ]),
  ...product('column-lamp', 'Column Floor Lamp', 'floor-lamp', ['minimal', 'metal'], [
    { key: 'std', label: 'Standard', size: [0.35, 1.5, 0.35], price: 12900 },
  ], { stem: '#2f2f31', shade: '#f3f0ea' }),
  ...product('tulip-lamp', 'Tulip Floor Lamp', 'floor-lamp', ['colorful'], [
    { key: 'std', label: 'Standard', size: [0.4, 1.55, 0.4], price: 13900 },
  ], { shade: '#e8b34b' }),

  // Table lamps
  ...product('clay-lamp', 'Clay Table Lamp', 'table-lamp', ['warm', 'natural', 'ceramic'], [
    { key: 'std', label: 'Standard', size: [0.3, 0.5, 0.3], price: 7900 },
    { key: 'large', label: 'Large', size: [0.36, 0.6, 0.36], price: 9900 },
  ]),
  ...product('stone-lamp', 'Stone Table Lamp', 'table-lamp', ['minimal', 'ceramic'], [
    { key: 'std', label: 'Standard', size: [0.28, 0.45, 0.28], price: 6900 },
  ], { base: '#d8d4cc' }),
  ...product('cobalt-lamp', 'Cobalt Table Lamp', 'table-lamp', ['colorful', 'ceramic'], [
    { key: 'std', label: 'Standard', size: [0.3, 0.48, 0.3], price: 8500 },
  ], { base: '#3f5fa8' }),

  // Rugs
  ...product('jute-rug', 'Jute Rug', 'rug', ['natural', 'warm'], [
    { key: '5x7', label: '160 × 230', size: [2.3, 0.01, 1.6], price: 17900 },
    { key: '8x10', label: '240 × 300', size: [3.0, 0.01, 2.4], price: 34900 },
    { key: '4x6', label: '120 × 180', size: [1.8, 0.01, 1.2], price: 12900 },
  ], { top: '#cdb48a' }),
  ...product('wool-rug', 'Wool Rug', 'rug', ['minimal', 'cozy', 'wool'], [
    { key: 'std', label: '140 × 200', size: [2.0, 0.012, 1.4], price: 29900 },
  ]),
  ...product('kilim-rug', 'Kilim Rug', 'rug', ['colorful'], [
    { key: 'std', label: '140 × 200', size: [2.0, 0.01, 1.4], price: 25900 },
  ], { top: '#c46a4a' }),

  // Plants
  ...product('fiddle-plant', 'Fiddle Leaf Fig (faux)', 'plant', ['natural'], [
    { key: 'std', label: '120 cm', size: [0.5, 1.2, 0.5], price: 8900 },
    { key: 'tall', label: '150 cm', size: [0.6, 1.5, 0.6], price: 12900 },
  ]),
  ...product('olive-plant', 'Olive Tree (faux)', 'plant', ['natural', 'warm'], [
    { key: 'std', label: '110 cm', size: [0.45, 1.1, 0.45], price: 9900 },
  ], { plant: '#7d8f64', pot: '#c27b58' }),
  ...product('snake-plant', 'Snake Plant (faux)', 'plant', ['minimal'], [
    { key: 'std', label: '80 cm', size: [0.35, 0.8, 0.35], price: 4900 },
  ], { pot: '#2f2f31' }),

  // Wall art
  ...product('dune-print', 'Dune Print', 'wall-art', ['warm', 'natural'], [
    { key: 'std', label: '60 × 80', size: [0.6, 0.8, 0.04], price: 6900 },
    { key: 'large', label: '80 × 100', size: [0.8, 1.0, 0.04], price: 9900 },
  ]),
  ...product('grid-print', 'Grid Print', 'wall-art', ['minimal'], [
    { key: 'std', label: '50 × 70', size: [0.5, 0.7, 0.03], price: 5900 },
  ], { canvas: '#34373d', frame: '#2f2f31' }),
  ...product('bloom-print', 'Bloom Print', 'wall-art', ['colorful'], [
    { key: 'std', label: '60 × 80', size: [0.6, 0.8, 0.04], price: 7900 },
  ], { canvas: '#e05a3a' }),

  // Mirrors
  ...product('brass-mirror', 'Brass Floor Mirror', 'mirror', ['warm'], [
    { key: 'std', label: 'Standard', size: [0.5, 1.5, 0.03], price: 17900 },
  ]),
  ...product('black-mirror', 'Black Floor Mirror', 'mirror', ['minimal', 'metal'], [
    { key: 'std', label: 'Standard', size: [0.45, 1.4, 0.03], price: 14900 },
  ], { frame: '#2f2f31' }),

  // Vases
  ...product('clay-vase', 'Clay Vase', 'vase', ['warm', 'natural', 'ceramic'], [
    { key: 'std', label: 'Standard', size: [0.18, 0.3, 0.18], price: 3900 },
    { key: 'tall', label: 'Tall', size: [0.2, 0.45, 0.2], price: 5500 },
  ]),
  ...product('white-vase', 'White Vase', 'vase', ['minimal', 'ceramic'], [
    { key: 'std', label: 'Standard', size: [0.16, 0.28, 0.16], price: 3500 },
  ], { body: '#efebe4' }),
  ...product('cobalt-vase', 'Cobalt Vase', 'vase', ['colorful', 'ceramic'], [
    { key: 'std', label: 'Standard', size: [0.18, 0.3, 0.18], price: 4500 },
  ], { body: '#3f5fa8' }),
]

/** Every sample offer by id, for pricing placed products. */
export const sampleOffers: ReadonlyMap<string, Offer> = new Map(sampleCatalog.map((entry) => [entry.offer.id, entry.offer]))

/** Variant labels ("Queen", "Linen seat") by variant id, for purchase lines. */
export const sampleVariantLabels: ReadonlyMap<string, string> = new Map(sampleCatalog.map((entry) => [entry.variant.id, entry.variant.label]))
