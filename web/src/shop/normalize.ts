/**
 * One Shopify product → one snapshot product with its purchasable variants.
 * Identity follows the store (product and variant ids), links point at the
 * exact variant, prices are only ever what the store lists (placeholders and
 * 0.00 on a room object are unknown), and sizes come from the variant's size
 * option or the description's overall dimensions — otherwise the category's
 * typical size, labeled estimated.
 */
import { categoryInfo } from '../domain/categories'
import { categorize } from './categorize'
import { bedSizeEstimate, completeDimensions, parseOverallDimensions, parseSizeOption, type ListedSize, type SizeKind } from './dimensions'
import { moneyFromDecimalString } from './money'
import type { ShopifyProduct, ShopifyVariant } from './shopify'
import type { SnapshotProduct, SnapshotVariant } from './snapshot'
import type { StoreInfo } from './stores'

/** Enough for every real color/size combination we saw while keeping the snapshot small. */
export const MAX_VARIANTS = 100
/** A listed axis beyond this is a typo or a different unit, not furniture. */
const MAX_LISTED_METERS = 8

export type NormalizeResult = { product: SnapshotProduct; truncatedVariants: number } | { excluded: string }

const SIZE_OPTION = /size|dimension|width|length/i
const DEFAULT_TITLE = 'Default Title'

function sizeKind(category: string): SizeKind {
  switch (category) {
    case 'curtain':
      return 'curtain'
    case 'wall-art':
      return 'art'
    case 'rug':
      return 'rug'
    case 'pillow':
      return 'pillow'
    default:
      return 'furniture'
  }
}

/** Remove any listed axis that is implausible, rather than trusting it. */
function plausible(size: ListedSize | null): ListedSize | null {
  if (!size) return null
  const out: ListedSize = {}
  for (const axis of ['width', 'depth', 'height'] as const) {
    const value = size[axis]
    if (value !== undefined && value > 0.005 && value <= MAX_LISTED_METERS) out[axis] = value
  }
  return out
}

/** Meters to the micrometer: exact enough, without float noise in the snapshot. */
const micro = (meters: number) => Math.round(meters * 1e6) / 1e6

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

/** Short human tags only (drops ids like "YGroup_nomad" and long marketing phrases). */
function cleanTags(tags: readonly string[]): string[] {
  const out = new Set<string>()
  for (const tag of tags) {
    const t = tag.trim().toLowerCase()
    if (/^[a-z][a-z &'-]{1,23}$/.test(t)) out.add(t)
  }
  return [...out]
}

/** Photos render in the page: only https ones are kept (a bad one is dropped, not fatal). */
const https = (src: string | undefined) => (src?.startsWith('https://') ? src : undefined)

function variantImage(product: ShopifyProduct, variant: ShopifyVariant): string | undefined {
  return https(variant.featured_image?.src) ?? https(product.images.find((image) => image.variant_ids?.includes(variant.id))?.src) ?? https(product.images[0]?.src)
}

export function normalizeProduct(raw: ShopifyProduct, store: StoreInfo): NormalizeResult {
  const categorized = categorize({ productType: raw.product_type, title: raw.title, tags: raw.tags })
  if (categorized.category === null) return { excluded: categorized.excluded }
  const category = categorized.category
  const typical = categoryInfo(category)?.typical
  if (!typical) return { excluded: 'unknown-category' }

  const isDefault = raw.variants.length === 1 && raw.variants[0]!.title === DEFAULT_TITLE
  const options = isDefault ? [] : [...raw.options].sort((a, b) => a.position - b.position)
  const productUrl = `https://${store.domain}/products/${raw.handle}`
  const productImage = https(raw.images[0]?.src)
  const kind = sizeKind(category)
  const described = plausible(parseOverallDimensions(stripHtml(raw.body_html ?? ''))) ?? {}
  // Furniture names often state the width ("Sofa 86\"", "Aspen 39\" Modular Corner").
  const titleWidth = kind === 'furniture' ? /(?:^|\s)(\d{2,3}(?:\.\d+)?)(?:"|”|″|&quot;)(?!\s*x)/.exec(raw.title) : null
  if (titleWidth && described.width === undefined) Object.assign(described, plausible({ width: Number(titleWidth[1]) * 0.0254 }))

  const variants: SnapshotVariant[] = raw.variants.slice(0, MAX_VARIANTS).map((variant) => {
    const optionValues = options.map((_, index) => [variant.option1, variant.option2, variant.option3][index] ?? '')
    // A size option describes this variant; the description describes the product.
    let listed: ListedSize = { ...described }
    let estimate = typical
    options.forEach((option, index) => {
      if (!SIZE_OPTION.test(option.name)) return
      const value = optionValues[index]!
      listed = { ...listed, ...plausible(parseSizeOption(value, kind)) }
      if (category === 'bed') {
        const bed = bedSizeEstimate(value)
        if (bed) estimate = { ...typical, ...bed }
      }
    })
    const price = store.listsPrices ? moneyFromDecimalString(variant.price, store.currency) : null
    const image = variantImage(raw, variant)
    const dimensions = completeDimensions(listed, estimate)
    return {
      sid: variant.id,
      optionValues,
      dimensions: { ...dimensions, width: micro(dimensions.width), height: micro(dimensions.height), depth: micro(dimensions.depth) },
      ...(image && image !== productImage ? { imageUrl: image } : {}),
      // 0.00 on furniture or decor is a placeholder (unreleased or hidden listing), not free.
      price: price && price.amountMinor > 0 ? price : null,
      available: variant.available,
    }
  })

  const product: SnapshotProduct = {
    id: `shop:${store.domain}:${raw.id}`,
    name: raw.title.trim(),
    category,
    tags: cleanTags(raw.tags),
    vendor: raw.vendor,
    store: store.name,
    storeDomain: store.domain,
    handle: raw.handle,
    url: productUrl,
    ...(productImage ? { imageUrl: productImage } : {}),
    optionNames: options.map((option) => option.name),
    variants,
  }
  return { product, truncatedVariants: Math.max(0, raw.variants.length - MAX_VARIANTS) }
}
