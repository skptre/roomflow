/**
 * Presentation helpers for real listings: small CDN renditions of product
 * photos, and the browse moods ("Natural", "Cozy"…) read from the words a
 * listing actually uses — materials and color names in its title, variant,
 * and tags — since store tags carry no mood of their own.
 */
import type { CatalogEntry } from '../domain/catalog'

/** A width-limited rendition from the Shopify CDN (other hosts unchanged). */
export function sizedImage(url: string, width: number): string {
  const parsed = new URL(url)
  if (parsed.hostname !== 'cdn.shopify.com') return url
  parsed.searchParams.set('width', String(width))
  return parsed.href
}

const MOOD_WORDS: Record<string, readonly string[]> = {
  natural: ['oak', 'walnut', 'teak', 'ash', 'maple', 'wood', 'natural', 'linen', 'jute', 'rattan', 'cane', 'wicker', 'woven', 'sisal', 'seagrass', 'terracotta', 'clay', 'stone', 'travertine', 'oat', 'sand'],
  cozy: ['boucle', 'velvet', 'mohair', 'wool', 'shearling', 'sherpa', 'knit', 'plush', 'chunky', 'faux fur', 'chenille', 'cashmere', 'fleece', 'quilted', 'tufted'],
  minimal: ['white', 'black', 'ivory', 'chalk', 'metal', 'steel', 'chrome', 'minimal', 'modern', 'grey', 'gray', 'charcoal', 'onyx', 'ebony', 'glass'],
  colorful: ['green', 'blue', 'navy', 'teal', 'pink', 'blush', 'orange', 'rust', 'yellow', 'mustard', 'red', 'burgundy', 'purple', 'plum', 'emerald', 'olive', 'moss', 'sage', 'coral', 'cobalt', 'ochre'],
}

const MOOD_PATTERNS = Object.fromEntries(
  Object.entries(MOOD_WORDS).map(([mood, words]) => [mood, new RegExp(`\\b(?:${words.join('|')})\\b`, 'i')]),
)

/** Accents off, so "Bouclé" reads as boucle (a word boundary treats é as a non-word character). */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function matchesMood(entry: CatalogEntry, mood: string): boolean {
  if (!mood) return true
  const pattern = MOOD_PATTERNS[mood]
  if (!pattern) return entry.product.tags.includes(mood)
  return pattern.test(fold([entry.product.name, entry.variant.label, ...entry.product.tags].join(' ')))
}
