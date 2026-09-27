/**
 * Assembled product dimensions from merchant text. Output is meters in the app
 * frame (width = X, height = Y, depth = Z). Axes are read by their labels,
 * never by position: stores disagree on order (Poly & Bark writes W × D × H,
 * Albany Park W × H × D), so an unlabeled triple is unknown. Box, package,
 * shipping, and inside/seat measurements are never read as the product size.
 * Only what the merchant lists is returned; completeDimensions fills the rest
 * from the category's typical size and then labels the whole size estimated.
 */
import type { Dimensions } from '../domain/schema'

/** Merchant-listed axes in meters; a missing axis was not listed. */
export type ListedSize = { width?: number; depth?: number; height?: number }

type Axis = keyof ListedSize

const INCH = 0.0254
const FOOT = 0.3048

const UNIT_METERS: Record<string, number> = { '"': INCH, in: INCH, 'in.': INCH, inch: INCH, inches: INCH, cm: 0.01, mm: 0.001 }

/** Unify the quote marks, multiplication signs, and entities stores use. */
function normalize(text: string): string {
  return text
    .replace(/&nbsp;|&#160;| /g, ' ')
    .replace(/&quot;|&#8221;|&#8243;|[“”″]/g, '"')
    .replace(/&#8217;|&#8242;|[‘’′]/g, "'")
    .replace(/''/g, '"')
    .replace(/×/g, 'x')
}

const NUM = String.raw`(\d+(?:\.\d+)?)`
const UNIT = String.raw`("|inches|inch|in\.?|cm|mm)`
const AXIS = String.raw`(diameter|diam|dia|width|depth|height|length|w|d|h|l)`
/** `113.5" W`, `85.5"W`, `200 cm W`, `85" Width` */
const VALUE_THEN_AXIS = new RegExp(String.raw`${NUM}\s*${UNIT}?\s*${AXIS}\b\.?`, 'iy')
/** `W 84"`, `Width: 119.5"` */
const AXIS_THEN_VALUE = new RegExp(String.raw`${AXIS}\s*:?\s*${NUM}\s*${UNIT}`, 'iy')
const SEPARATOR = /\s*(?:x|by|,|and)?\s*/iy

function axisOf(label: string): Axis | 'diameter' | 'length' {
  const l = label.toLowerCase()
  if (l.startsWith('dia')) return 'diameter'
  if (l === 'w' || l === 'width') return 'width'
  if (l === 'd' || l === 'depth') return 'depth'
  if (l === 'h' || l === 'height') return 'height'
  return 'length'
}

/** Read consecutive labeled measurements starting exactly at `start`. */
function scanLabeled(text: string, start: number): ListedSize {
  const size: ListedSize = {}
  let pos = start
  for (;;) {
    let value: number
    let unit: string | undefined
    let label: string
    VALUE_THEN_AXIS.lastIndex = pos
    AXIS_THEN_VALUE.lastIndex = pos
    const a = VALUE_THEN_AXIS.exec(text)
    const b = a ? null : AXIS_THEN_VALUE.exec(text)
    if (a) {
      value = Number(a[1])
      unit = a[2]
      label = a[3]!
      pos = VALUE_THEN_AXIS.lastIndex
    } else if (b) {
      label = b[1]!
      value = Number(b[2])
      unit = b[3]
      pos = AXIS_THEN_VALUE.lastIndex
    } else break
    const meters = value * (UNIT_METERS[(unit ?? '"').toLowerCase()] ?? INCH)
    if (!(meters > 0)) break
    const axis = axisOf(label)
    if (axis === 'diameter') {
      if (size.width !== undefined || size.depth !== undefined) break
      size.width = meters
      size.depth = meters
    } else {
      // Length names the long horizontal side: the width, when width is not given.
      const target: Axis = axis === 'length' ? 'width' : axis
      if (size[target] !== undefined) break
      size[target] = meters
    }
    SEPARATOR.lastIndex = pos
    SEPARATOR.exec(text)
    pos = SEPARATOR.lastIndex
  }
  return size
}

const isEmpty = (size: ListedSize) => size.width === undefined && size.depth === undefined && size.height === undefined

const LABEL = /(overall(?:\s+product)?(?:\s+dimensions?)?|general\s+dimensions?|dimensions?)\s*(\([^)]*\))?\s*:/gi
/** Words before "Dimensions" that mean it is not the assembled product's size. */
const NOT_PRODUCT_BEFORE = /(box|package|packaging|packaged|shipping|shipped|carton|inner|inside|interior|seat|seating|storage|drawer|shelf|cushion|opening|mattress|clearance)\s*$/i
const NOT_PRODUCT_NOTE = /inside|storage|cushion|seat|arm|box|package|shipping|extended/i

/** The assembled product size from a description, or null when none is labeled. */
export function parseOverallDimensions(text: string): ListedSize | null {
  const clean = normalize(text)
  const candidates: { rank: number; start: number }[] = []
  for (const match of clean.matchAll(LABEL)) {
    const label = match[1]!.toLowerCase()
    if (NOT_PRODUCT_BEFORE.test(clean.slice(Math.max(0, match.index - 24), match.index))) continue
    if (match[2] && NOT_PRODUCT_NOTE.test(match[2])) continue
    const rank = label.startsWith('overall') ? 0 : label.startsWith('general') ? 1 : 2
    candidates.push({ rank, start: match.index + match[0].length })
  }
  candidates.sort((a, b) => a.rank - b.rank || a.start - b.start)
  for (const { start } of candidates) {
    SEPARATOR.lastIndex = start
    SEPARATOR.exec(clean)
    const size = scanLabeled(clean, SEPARATOR.lastIndex)
    if (!isEmpty(size)) return size
  }
  return null
}

export type SizeKind = 'curtain' | 'art' | 'rug' | 'pillow' | 'furniture'

const LEN = String.raw`\d+(?:\.\d+)?\s*(?:'\s*-?\s*(?:\d+(?:\.\d+)?\s*")?|")?`
const PAIR = new RegExp(String.raw`^\s*(${LEN})\s*x\s*(${LEN})\s*(round)?\s*$`, 'i')
const ROUND = new RegExp(String.raw`^\s*(${LEN})\s*round\s*$`, 'i')
const CURTAIN = /^\s*(\d+(?:\.\d+)?)\s*"?\s*W\s*x\s*(\d+(?:\.\d+)?)\s*"?\s*L\s*$/i

/** One length like `5'`, `2'6"`, `1'-9"`, `20"`, or a bare number in the default unit. */
function parseLength(text: string, bareUnit: number): number | null {
  const t = text.trim()
  const feet = /^(\d+(?:\.\d+)?)\s*'\s*-?\s*(?:(\d+(?:\.\d+)?)\s*")?$/.exec(t)
  if (feet) return Number(feet[1]) * FOOT + Number(feet[2] ?? 0) * INCH
  const inches = /^(\d+(?:\.\d+)?)\s*"$/.exec(t)
  if (inches) return Number(inches[1]) * INCH
  const bare = /^(\d+(?:\.\d+)?)$/.exec(t)
  return bare ? Number(bare[1]) * bareUnit : null
}

function parsePair(text: string, bareUnit: number): [number, number] | null {
  const match = PAIR.exec(text)
  if (!match) return null
  const a = parseLength(match[1]!, bareUnit)
  const b = parseLength(match[2]!, bareUnit)
  return a && b ? [a, b] : null
}

/** A variant's size option value, read the way that kind of product lists sizes. */
export function parseSizeOption(value: string, kind: SizeKind): ListedSize | null {
  const clean = normalize(value)
  switch (kind) {
    case 'curtain': {
      const panel = CURTAIN.exec(clean)
      if (panel) return { width: Number(panel[1]) * INCH, height: Number(panel[2]) * INCH }
      const pair = parsePair(clean, INCH)
      return pair ? { width: pair[0], height: pair[1] } : null
    }
    case 'art':
    case 'pillow': {
      const pair = parsePair(clean, INCH)
      return pair ? { width: pair[0], height: pair[1] } : null
    }
    case 'rug': {
      const round = ROUND.exec(clean)
      if (round) {
        const d = parseLength(round[1]!, FOOT)
        return d ? { width: d, depth: d } : null
      }
      const pair = parsePair(clean, FOOT)
      return pair ? { width: pair[0], depth: pair[1] } : null
    }
    case 'furniture': {
      for (const match of clean.matchAll(/\d|\b(?:width|depth|height|w|d|h)\b/gi)) {
        const size = scanLabeled(clean, match.index)
        if (!isEmpty(size)) return size
      }
      return null
    }
  }
}

/** Mattress sizes in inches (width, length). */
const MATTRESS: [RegExp, number, number][] = [
  [/\bcal(?:\.|i|ifornia)?\s+king\b/i, 72, 84],
  [/\btwin\s*xl\b/i, 38, 80],
  [/\bking\b/i, 76, 80],
  [/\bqueen\b/i, 60, 80],
  [/\bfull\b/i, 54, 75],
  [/\btwin\b/i, 38, 75],
]

/**
 * A rough bed-frame footprint from a mattress size name (frames run about
 * 10 cm wider and 15 cm longer). Always an estimate, never a listing.
 * Combined names ("King/Cal King") take the larger size in each direction.
 */
export function bedSizeEstimate(value: string): { width: number; depth: number } | null {
  let width = 0
  let length = 0
  for (const [pattern, w, l] of MATTRESS) {
    if (!pattern.test(value)) continue
    width = Math.max(width, w)
    length = Math.max(length, l)
  }
  return width ? { width: width * INCH + 0.1, depth: length * INCH + 0.15 } : null
}

/** A full size for the app: listed axes win; any axis filled from `typical` makes the whole size estimated. */
export function completeDimensions(listed: ListedSize | null, typical: { width: number; height: number; depth: number }): Dimensions {
  const width = listed?.width
  const height = listed?.height
  const depth = listed?.depth
  const complete = width !== undefined && height !== undefined && depth !== undefined
  return {
    width: width ?? typical.width,
    height: height ?? typical.height,
    depth: depth ?? typical.depth,
    source: complete ? 'merchant' : 'estimated',
  }
}
