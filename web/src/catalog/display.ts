/**
 * Presentation helpers for real listings: small CDN renditions of product
 * photos, and the browse moods ("Natural", "Cozy"…) read from the words a
 * listing actually uses — materials and color names in its title, variant,
 * and tags — since store tags carry no mood of their own.
 */
import type { CatalogEntry } from '../domain/catalog'
import { hueFamily } from '../shop/colors'

/** A width-limited rendition from the Shopify CDN (other hosts unchanged). */
export function sizedImage(url: string, width: number): string {
  const parsed = new URL(url)
  if (parsed.hostname !== 'cdn.shopify.com') return url
  parsed.searchParams.set('width', String(width))
  return parsed.href
}

/** Sold-out listings last (still browsable), order otherwise unchanged. */
export function inStockFirst(entries: readonly CatalogEntry[]): CatalogEntry[] {
  return [...entries.filter((e) => e.offer.available !== false), ...entries.filter((e) => e.offer.available === false)]
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

/** The moods a listing's own words suggest ("Walnut - Wood" → natural). */
export function moodsOf(words: readonly string[]): string[] {
  const text = fold(words.join(' '))
  return Object.keys(MOOD_PATTERNS).filter((mood) => MOOD_PATTERNS[mood]!.test(text))
}

export function matchesMood(entry: CatalogEntry, mood: string): boolean {
  if (!mood) return true
  const pattern = MOOD_PATTERNS[mood]
  if (!pattern) return entry.product.tags.includes(mood)
  return pattern.test(fold([entry.product.name, entry.variant.label, ...entry.product.tags].join(' ')))
}

/** Colorfulness of an sRGB hex: max − min channel, 0–1. */
function chroma(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (Math.max(...channels) - Math.min(...channels)) / 255
}

/**
 * The moods the colors a piece is drawn in suggest (for looks): neutrals and
 * near-white warm tones read minimal, woods and muted earth tones natural,
 * clear colors colorful. Soft ranking only, like the word moods.
 */
export function moodsOfColors(hexes: readonly string[]): string[] {
  const moods = new Set<string>()
  for (const hex of hexes) {
    const family = hueFamily(hex)
    const c = chroma(hex)
    if (family.endsWith('neutral')) moods.add('minimal')
    else if (family === 'brown') moods.add('natural')
    else if (family === 'orange' || family === 'yellow') moods.add(c < 0.12 ? 'minimal' : c < 0.3 ? 'natural' : 'colorful')
    else moods.add('colorful')
  }
  return [...moods]
}
