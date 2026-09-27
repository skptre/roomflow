/**
 * Furniture color names → sRGB hex (plan D5, second source after the photo).
 * Store option values are messy ("Heather Charcoal - Performance Basketweave",
 * "Light Weight Linen Black Pepper"), so matching looks for the longest known
 * phrase, skips fabric weights, and treats material words (linen, canvas…) as
 * colors only when nothing else matches. Hue families group colors for browse
 * moods. (A name never overrides a photo reading: in the pilot, names mapped to
 * the wrong part far more often than photos were misread.)
 */
import type { MaterialKind } from '../blocks/family'

export type LexiconEntry = {
  hex: string
  /** What the name implies the part is made of (a wood species, a metal finish). */
  material?: MaterialKind
  /** A different reading when the part is of this material ("natural" wood vs fabric). */
  byKind?: Partial<Record<MaterialKind, string>>
}

const wood = (hex: string): LexiconEntry => ({ hex, material: 'wood' })
const metal = (hex: string): LexiconEntry => ({ hex, material: 'metal' })
const stone = (hex: string): LexiconEntry => ({ hex, material: 'stone' })

/** Names are lowercase, accents removed, single spaces. */
export const COLOR_LEXICON: Readonly<Record<string, LexiconEntry>> = {
  // Woods and stains (as the finished piece reads, not raw lumber).
  walnut: wood('#5b3a24'),
  'natural walnut': wood('#6b4a33'),
  'dark walnut': wood('#3f2a1d'),
  oak: wood('#c49a6c'),
  'white oak': wood('#c9a97c'),
  'natural oak': wood('#c8a578'),
  'light oak': wood('#d4b58a'),
  'blackened oak': wood('#2b2622'),
  'smoked oak': wood('#6a5241'),
  'chocolate oak': wood('#4a3426'),
  'toasted oak': wood('#a07048'),
  ash: { hex: '#d6c3a0', material: 'wood', byKind: { fabric: '#b5b2ac' } },
  maple: wood('#d9b98a'),
  teak: wood('#a0703f'),
  cherry: { hex: '#8b4a2b', material: 'wood', byKind: { fabric: '#8e2a36', ceramic: '#8e2a36' } },
  espresso: wood('#3b2a20'),
  mahogany: wood('#5a2a1b'),
  pecan: wood('#8a5a36'),
  driftwood: wood('#9c8b78'),
  whitewash: wood('#e0d8cc'),
  greywash: wood('#a39d93'),
  ebony: wood('#231f1c'),
  acacia: wood('#9b6a3c'),
  mango: wood('#a47a52'),
  pine: wood('#d8b27c'),
  birch: wood('#e0cda8'),
  beech: wood('#d7b48a'),
  bamboo: wood('#d2b47c'),
  rosewood: wood('#5c2b22'),
  elm: wood('#b08a62'),
  hickory: wood('#b58b5c'),
  cedar: wood('#a8653a'),
  sheesham: wood('#7a4b2e'),
  'reclaimed wood': wood('#8c6d52'),
  honey: { hex: '#c28e45', byKind: { wood: '#b8844a' } },
  rattan: wood('#c9a36b'),
  cane: wood('#d1b07a'),
  wicker: wood('#c49a64'),
  jute: { hex: '#c9ae84' },
  seagrass: { hex: '#b8a574' },

  // Metals.
  brass: metal('#b5935a'),
  'antique brass': metal('#8c6d3f'),
  'aged brass': metal('#9c7a45'),
  'satin brass': metal('#c2a36b'),
  'brushed brass': metal('#bf9f62'),
  'polished brass': metal('#c9a55a'),
  gold: metal('#c9a449'),
  'brushed gold': metal('#c3a25e'),
  bronze: metal('#6e5436'),
  'oil rubbed bronze': metal('#3d2e24'),
  'antique bronze': metal('#5a4630'),
  nickel: metal('#b8b6b0'),
  'brushed nickel': metal('#a9a7a1'),
  'polished nickel': metal('#cfcfcb'),
  'satin nickel': metal('#b0aea8'),
  chrome: metal('#d4d6d8'),
  silver: metal('#c0c0c0'),
  steel: { hex: '#8a8d90', material: 'metal', byKind: { fabric: '#6f7680' } },
  'stainless steel': metal('#b4b6b7'),
  iron: metal('#3a3a3a'),
  'wrought iron': metal('#2e2e2e'),
  copper: metal('#b06c43'),
  pewter: metal('#8e8e8a'),
  gunmetal: metal('#53565a'),
  aluminum: metal('#c4c6c8'),
  'matte black': { hex: '#232324' },

  // Stone and glass.
  marble: stone('#e8e5df'),
  'white marble': stone('#ebe8e2'),
  'black marble': stone('#2a2a2a'),
  'green marble': stone('#3f5a4c'),
  travertine: stone('#d9c7a8'),
  terrazzo: stone('#dcd6cc'),
  granite: stone('#6d6a66'),
  concrete: stone('#a19e98'),
  cement: stone('#9d9a94'),
  limestone: stone('#d8d0bf'),
  soapstone: stone('#5e605c'),
  clear: { hex: '#e8eef0' },
  frosted: { hex: '#e9ecec' },
  amber: { hex: '#b0702a' },

  // Whites and creams.
  white: { hex: '#f2f0eb' },
  'bright white': { hex: '#f7f7f5' },
  'off white': { hex: '#ede9e0' },
  snow: { hex: '#f4f3ef' },
  chalk: { hex: '#ebe7df' },
  alabaster: { hex: '#ede8dd' },
  ivory: { hex: '#efe8d8' },
  cream: { hex: '#ece2cc' },
  crema: { hex: '#e9dcc3' },
  bone: { hex: '#e3dac8' },
  oyster: { hex: '#d9d2c4' },
  'oyster white': { hex: '#e4ddd0' },
  pearl: { hex: '#e2ddd3' },
  'pearl grey': { hex: '#c9c7c1' },
  porcelain: { hex: '#ecebe6' },
  talc: { hex: '#e8e4dc' },
  frost: { hex: '#e9ecec' },
  eggshell: { hex: '#efe9da' },
  marshmallow: { hex: '#f1ede4' },
  gardenia: { hex: '#f1ece0' },
  powder: { hex: '#e8e6e1' },
  linen: { hex: '#e3d9c6' },
  'linen white': { hex: '#ece6d8' },
  canvas: { hex: '#ddd3bf' },
  ecru: { hex: '#ddd2b8' },
  parchment: { hex: '#e8dcc0' },
  vanilla: { hex: '#efe3c4' },
  champagne: { hex: '#e3d4b8' },

  // Beiges, tans, browns.
  natural: { hex: '#e4dac6', byKind: { wood: '#c8a578', metal: '#b5935a', stone: '#d8d0bf' } },
  oat: { hex: '#ddd1b9' },
  oatmeal: { hex: '#d8ccb4' },
  flax: { hex: '#d6c7a4' },
  sand: { hex: '#d2c2a2' },
  dune: { hex: '#cdbb9b' },
  beige: { hex: '#d4c3a3' },
  wheat: { hex: '#dcc59a' },
  straw: { hex: '#d9c38c' },
  biscuit: { hex: '#d6bf98' },
  almond: { hex: '#dccab0' },
  khaki: { hex: '#b8a47e' },
  stone: { hex: '#b3aa9c' },
  pebble: { hex: '#aaa49a' },
  greige: { hex: '#b8b0a2' },
  taupe: { hex: '#8f8272' },
  mushroom: { hex: '#a39585' },
  fawn: { hex: '#c4a582' },
  camel: { hex: '#b7874f' },
  tan: { hex: '#c19a6b' },
  caramel: { hex: '#a86a36' },
  toffee: { hex: '#9a6a3e' },
  cognac: { hex: '#8b4a24' },
  saddle: { hex: '#8b5a2b' },
  whiskey: { hex: '#9a5e2e' },
  tobacco: { hex: '#6e4a2c' },
  hazelnut: { hex: '#9a7b5a' },
  mocha: { hex: '#7a5c4b' },
  coffee: { hex: '#5b4130' },
  chocolate: { hex: '#4a3326' },
  truffle: { hex: '#5e4b3f' },
  brown: { hex: '#6b4c36' },
  'dark brown': { hex: '#3f2c20' },
  chestnut: { hex: '#6f3f28' },
  toast: { hex: '#b8875a' },
  acorn: { hex: '#8a6440' },
  latte: { hex: '#c4a584' },
  cafe: { hex: '#8a6a50' },
  cocoa: { hex: '#5e4232' },
  umber: { hex: '#5a4030' },
  java: { hex: '#4a3428' },
  rye: { hex: '#b89a6e' },
  sandstone: { hex: '#c9ae88' },
  papyrus: { hex: '#ddd0b0' },

  // Greys and blacks.
  grey: { hex: '#9a9894' },
  'light grey': { hex: '#c4c3bf' },
  'dark grey': { hex: '#5a5a5a' },
  'heather grey': { hex: '#a3a3a0' },
  'stone grey': { hex: '#9f9a92' },
  fog: { hex: '#c9c8c3' },
  mist: { hex: '#d5d6d3' },
  cloud: { hex: '#dcdcd8' },
  dove: { hex: '#b9b5ae' },
  smoke: { hex: '#8e8d8a' },
  mineral: { hex: '#8f9491' },
  slate: { hex: '#5f6770' },
  graphite: { hex: '#45474a' },
  charcoal: { hex: '#3f4042' },
  'heather charcoal': { hex: '#4a4b4d' },
  carbon: { hex: '#2e2f31' },
  onyx: { hex: '#1f1f22' },
  jet: { hex: '#18181a' },
  licorice: { hex: '#232123' },
  black: { hex: '#1d1d1f' },
  ink: { hex: '#20242c' },
  midnight: { hex: '#1e2433' },
  platinum: { hex: '#c9c9c6' },
  gravel: { hex: '#8f8a82' },
  shale: { hex: '#6a6862' },
  shadow: { hex: '#4a4846' },
  obsidian: { hex: '#1c1c1e' },

  // Blues.
  navy: { hex: '#25324a' },
  'navy blue': { hex: '#27344f' },
  'midnight navy': { hex: '#1f2a3d' },
  'dark navy': { hex: '#1e2839' },
  indigo: { hex: '#2f3b63' },
  denim: { hex: '#4c6380' },
  cobalt: { hex: '#1f4fa0' },
  blue: { hex: '#3c5f8f' },
  'light blue': { hex: '#a9c3d9' },
  'powder blue': { hex: '#b3c8d8' },
  sky: { hex: '#9cc3dd' },
  'sky blue': { hex: '#9cc3dd' },
  'ice blue': { hex: '#c9dce6' },
  'night sky': { hex: '#232a3d' },
  'dusty blue': { hex: '#8199ad' },
  ocean: { hex: '#2f5d7c' },
  harbor: { hex: '#3f5a6c' },
  sapphire: { hex: '#22407a' },
  teal: { hex: '#2e6e70' },
  'dark teal': { hex: '#1f4f52' },
  aqua: { hex: '#6fb7b3' },
  turquoise: { hex: '#3aa0a0' },
  peacock: { hex: '#1f5a66' },
  chambray: { hex: '#8da2b8' },
  azure: { hex: '#5a8fc0' },
  marine: { hex: '#274a6e' },
  lapis: { hex: '#2a4a8a' },
  twilight: { hex: '#3a4260' },

  // Greens.
  green: { hex: '#4f7a4a' },
  sage: { hex: '#9ca98c' },
  olive: { hex: '#6b6a3a' },
  'dark olive': { hex: '#4d4c2c' },
  moss: { hex: '#6b7445' },
  forest: { hex: '#2f4a33' },
  'forest green': { hex: '#2f4a33' },
  'hunter green': { hex: '#31473a' },
  emerald: { hex: '#2c6e4f' },
  spruce: { hex: '#2e4a44' },
  eucalyptus: { hex: '#8fa593' },
  mint: { hex: '#a8d5b8' },
  pistachio: { hex: '#b8c790' },
  celadon: { hex: '#b3c7a8' },
  jade: { hex: '#4f8a6c' },
  fern: { hex: '#5f7f4a' },
  lichen: { hex: '#8e9a73' },
  seafoam: { hex: '#a4cbb8' },
  nori: { hex: '#2a3228' },
  avocado: { hex: '#5e6b35' },
  chartreuse: { hex: '#b5b83a' },
  army: { hex: '#5a5a3a' },
  balsam: { hex: '#3f5a4a' },
  cypress: { hex: '#4a5a45' },
  evergreen: { hex: '#2f4a3a' },
  rosemary: { hex: '#6f7a62' },
  clover: { hex: '#4f7a45' },
  kiwi: { hex: '#8fa84a' },
  'sea glass': { hex: '#a9c7bd' },
  citron: { hex: '#d6c65a' },
  goldenrod: { hex: '#d0a030' },
  butterscotch: { hex: '#c98f3e' },
  turmeric: { hex: '#cc9a2a' },
  tawny: { hex: '#a9784a' },

  // Yellows and oranges.
  yellow: { hex: '#e1c34a' },
  mustard: { hex: '#c79b2c' },
  ochre: { hex: '#c1872e' },
  saffron: { hex: '#d9952b' },
  lemon: { hex: '#efe08a' },
  butter: { hex: '#f1e3a6' },
  orange: { hex: '#d77a36' },
  'burnt orange': { hex: '#c0612b' },
  apricot: { hex: '#e8a87c' },
  peach: { hex: '#eab39a' },
  coral: { hex: '#e07f66' },
  salmon: { hex: '#e39580' },

  // Reds, pinks, purples.
  terracotta: { hex: '#b8643e' },
  clay: { hex: '#b07458' },
  rust: { hex: '#a4532e' },
  sienna: { hex: '#9b4f2e' },
  brick: { hex: '#9b4a36' },
  red: { hex: '#a3302a' },
  crimson: { hex: '#9a1f2c' },
  burgundy: { hex: '#6d2432' },
  wine: { hex: '#5e1f2d' },
  oxblood: { hex: '#5a1f1f' },
  berry: { hex: '#7d2e46' },
  raspberry: { hex: '#9c2f53' },
  blush: { hex: '#e3bcb0' },
  rose: { hex: '#c98b8b' },
  'dusty rose': { hex: '#b98b86' },
  pink: { hex: '#e2a3ad' },
  mauve: { hex: '#9e7b86' },
  plum: { hex: '#5b3350' },
  aubergine: { hex: '#3e2536' },
  eggplant: { hex: '#3b2436' },
  mulberry: { hex: '#6b2f4a' },
  raisin: { hex: '#4a2e33' },
  madder: { hex: '#9a3a2e' },
  persimmon: { hex: '#d0653a' },
  bubblegum: { hex: '#eba3bd' },
  lavender: { hex: '#b8a9cf' },
  lilac: { hex: '#c4b0d1' },
  purple: { hex: '#6b4c8a' },
  violet: { hex: '#6a4f9a' },
}

/** Other spellings → lexicon name. */
const ALIASES: Readonly<Record<string, string>> = {
  gray: 'grey',
  'light gray': 'light grey',
  'dark gray': 'dark grey',
  'heather gray': 'heather grey',
  'pearl gray': 'pearl grey',
  'terra cotta': 'terracotta',
  offwhite: 'off white',
  stainless: 'stainless steel',
  lapiz: 'lapis',
  seaglass: 'sea glass',
}

/** Words that are colors only when nothing better is in the name ("Linen" alone vs "Linen Black"). */
const MATERIAL_WORDS = new Set(['linen', 'canvas', 'rattan', 'cane', 'wicker', 'jute', 'seagrass', 'natural', 'stone', 'clear', 'marble'])

/** A word in the value that says what the part is made of. */
const MATERIAL_HINTS: Readonly<Record<string, MaterialKind>> = {
  wood: 'wood',
  wooden: 'wood',
  metal: 'metal',
  leather: 'leather',
  marble: 'stone',
  stone: 'stone',
  travertine: 'stone',
  glass: 'glass',
  ceramic: 'ceramic',
  stoneware: 'ceramic',
  porcelain: 'ceramic',
}

/** Words that say nothing about color. */
const GENERIC_WORDS = new Set(['finish', 'color', 'colour', 'fabric', 'performance', 'solid'])

const DARKER = new Set(['dark', 'deep'])
const LIGHTER = new Set(['light', 'pale', 'soft'])

export type ColorMatch = {
  /** Lexicon name matched. */
  name: string
  hex: string
  material?: MaterialKind
  modifier?: 'light' | 'dark'
}

const PHRASES: ReadonlyMap<string, string> = new Map([
  ...Object.keys(COLOR_LEXICON).map((name) => [name, name] as const),
  ...Object.entries(ALIASES),
])
const LONGEST = Math.max(...[...PHRASES.keys()].map((phrase) => phrase.split(' ').length))

function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(light|medium|heavy)[\s-]*weight\b/g, ' ')
    .replace(/-/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

type Hit = { name: string; start: number; length: number }

/** The lexicon phrase a value names, by position (longest, then earliest; material words only when alone). */
function bestHit(tokens: readonly string[]): Hit | null {
  const hits: Hit[] = []
  for (let start = 0; start < tokens.length; start++) {
    for (let length = Math.min(LONGEST, tokens.length - start); length >= 1; length--) {
      const name = PHRASES.get(tokens.slice(start, start + length).join(' '))
      if (name) hits.push({ name, start, length })
    }
  }
  const strong = hits.filter((hit) => !(hit.length === 1 && MATERIAL_WORDS.has(hit.name)))
  // A material word is the color only when it is all the value says ("Natural", "Linen - Fabric"),
  // not a fabric line in front of a name we don't know ("Cotton Canvas Moon Dust").
  const bare = hits.filter((hit) => tokens.every((token, i) => i === hit.start || Object.hasOwn(MATERIAL_HINTS, token) || GENERIC_WORDS.has(token)))
  const pool = strong.length > 0 ? strong : bare
  return pool.reduce<Hit | null>((a, b) => (!a || b.length > a.length || (b.length === a.length && b.start < a.start) ? b : a), null)
}

/** The color a store option value names, or null when it names none. `kind` picks readings like natural wood vs natural fabric. */
export function matchColor(text: string, kind?: MaterialKind): ColorMatch | null {
  const tokens = words(text)
  const best = bestHit(tokens)
  if (!best) return null

  const entry = COLOR_LEXICON[best.name]!
  const hinted = tokens.map((token) => MATERIAL_HINTS[token]).find(Boolean)
  const material = hinted ?? entry.material
  const readAs = kind ?? material
  let hex = (readAs && entry.byKind?.[readAs]) || entry.hex
  const before = tokens[best.start - 1]
  const modifier = before && DARKER.has(before) ? 'dark' : before && LIGHTER.has(before) ? 'light' : undefined
  if (modifier) hex = shiftLightness(hex, modifier === 'dark' ? -0.14 : 0.14)
  return { name: best.name, hex, ...(material ? { material } : {}), ...(modifier ? { modifier } : {}) }
}

/** Each "/"-separated part of a value matched on its own ("Ivory / Walnut" → two parts). */
export function matchColorParts(text: string, kinds: readonly (MaterialKind | undefined)[] = []): (ColorMatch | null)[] {
  return text.split('/').map((part, index) => matchColor(part, kinds[index]))
}

/** Hue, saturation, lightness, plus chroma (max − min channel), which unlike HSL saturation doesn't inflate near white or black. */
type Hsl = { h: number; s: number; l: number; c?: number }

function toHsl(hex: string): Hsl {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l, c: 0 }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s, l, c: d }
}

function fromHsl({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const channel = (v: number) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function shiftLightness(hex: string, by: number): string {
  const hsl = toHsl(hex)
  return fromHsl({ ...hsl, l: Math.min(0.95, Math.max(0.05, hsl.l + by)) })
}

export type HueFamily =
  | 'light-neutral' | 'mid-neutral' | 'dark-neutral'
  | 'red' | 'orange' | 'brown' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink'

/** A color reads as a neutral (grey, off-white, near-black) below this chroma or saturation. */
const isNeutral = ({ s, c = 0 }: Hsl) => c < 0.06 || s < 0.12

export function hueFamily(hex: string): HueFamily {
  const hsl = toHsl(hex)
  const { h, l } = hsl
  if (isNeutral(hsl)) return l >= 0.7 ? 'light-neutral' : l < 0.3 ? 'dark-neutral' : 'mid-neutral'
  if (h < 15 || h >= 345) return 'red'
  if (h < 45) return l < 0.45 ? 'brown' : 'orange'
  if (h < 65) return 'yellow'
  if (h < 165) return 'green'
  if (h < 195) return 'teal'
  if (h < 255) return 'blue'
  if (h < 290) return 'purple'
  return 'pink'
}
