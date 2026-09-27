/**
 * Rules tier (plan D13, free): a recipe from the listing's own words. The
 * family and its defaults come from the category; whole-word keywords in the
 * title and tags pick blocks; option names decide which part an option colors;
 * the color lexicon turns option values into hex. Anything the words don't say
 * stays the family default, and evidence says so — no guessing.
 */
import type { Family, MaterialKind } from '../blocks/family'
import { getFamily } from '../blocks/families'
import { validateRecipe, type Recipe } from '../blocks/recipe'
import { defaultRecipeId, getRecipe } from '../blocks/registry'
import { matchColor, matchColorParts, type ColorMatch } from './colors'
import type { SnapshotProduct } from './snapshot'

/** Extra listing text the snapshot doesn't keep (from the raw feed). Only the product type is read for shape. */
export type ListingText = { productType?: string; description?: string; images?: readonly string[] }

export const RULES_VERSION = 'rules-1'

type Rule = [pattern: RegExp, block: string, option: string]
/** Option name → the slots its values color. `spread`: one color paints every slot (a table's single finish). */
type SlotMap = { name: RegExp; slots: string[]; spread?: boolean }

const ARM: Rule[] = [
  [/\btrack[- ]arms?\b/, 'arm', 'track'],
  [/\b(rolled|roll|english)[- ]arms?\b/, 'arm', 'rolled'],
  [/\bslop(e|ed)[- ]arms?\b/, 'arm', 'slope'],
  [/\bflared?[- ]arms?\b/, 'arm', 'flared'],
  [/\barmless\b/, 'arm', 'none'],
]
const BACK: Rule[] = [
  [/\bchannel(ed)?\b/, 'back', 'channel'],
  [/\btight[- ]back\b|\btufted\b/, 'back', 'tight'],
  [/\b(pillow|loose)[- ]back\b/, 'back', 'pillow'],
]
const UPHOLSTERED_BASE: Rule[] = [
  [/\bmetal (legs?|base)\b|\bhairpin\b/, 'base', 'metal-legs'],
  [/\bplinth\b|\bskirted\b/, 'base', 'plinth'],
  [/\bblock legs?\b/, 'base', 'block-legs'],
  [/\btapered legs?\b/, 'base', 'tapered-legs'],
]
const UPHOLSTERY_OPTIONS: SlotMap[] = [
  { name: /fabric (and|&) (wood|leg)/, slots: ['upholstery', 'legs'] },
  { name: /leg|base|wood|stain|finish/, slots: ['legs'] },
  { name: /upholster|fabric|cover|leather|colou?r|material/, slots: ['upholstery'] },
]

/** Keyword rules per family, first match per block wins. */
const RULES: Readonly<Record<string, Rule[]>> = {
  sofa: [...ARM, ...BACK, ...UPHOLSTERED_BASE],
  chair: [[/\bbarrel\b/, 'shell', 'barrel'], [/\bround\b|\bpouf\b|\bdrum\b/, 'top', 'round'], ...ARM, ...BACK, ...UPHOLSTERED_BASE],
  bed: [
    [/\bno headboard\b|\bheadboardless\b/, 'headboard', 'none'],
    [/\bchannel(ed)?\b/, 'headboard', 'channel'],
    [/\bwingback\b/, 'headboard', 'wingback'],
    [/\bslat(ted)?\b/, 'headboard', 'slatted'],
    [/\barch(ed)?\b/, 'headboard', 'arched'],
    [/\bcurved\b|\brounded\b/, 'headboard', 'rounded'],
    [/\bupholstered\b/, 'frame', 'upholstered'],
    [/\bplatform\b/, 'frame', 'platform'],
    [/\b(no|without) footboard\b/, 'footboard', 'none'],
    [/\bfootboard\b/, 'footboard', 'low'],
  ],
  table: [
    [/\bround\b|\bcircular\b/, 'top', 'round'],
    [/\boval\b/, 'top', 'oval'],
    [/\bpedestal\b|\btulip\b/, 'base', 'pedestal'],
    [/\btrestle\b/, 'base', 'trestle'],
    [/\bhairpin\b/, 'base', 'hairpin'],
    [/\bwaterfall\b/, 'base', 'panel'],
    [/\bsled\b/, 'base', 'sled'],
    [/\bdrum\b|\bcube\b|\bplinth\b/, 'base', 'cube'],
    [/\bturned\b/, 'legStyle', 'turned'],
    [/\bmetal legs?\b/, 'legStyle', 'metal'],
    [/\btapered\b/, 'legStyle', 'tapered'],
    [/\bshelf\b/, 'shelf', 'lower'],
    [/\b(two|2)[- ]drawers?\b/, 'drawer', '2'],
    [/\bdrawers?\b/, 'drawer', '1'],
  ],
  storage: [
    [/\bcut[- ]?outs?\b|\bfinger[- ]pulls?\b|\bhandleless\b|\bpush[- ]to[- ]open\b/, 'handles', 'edge'],
    [/\bknobs?\b/, 'handles', 'knob'],
    [/\bpulls?\b|\bhandles?\b/, 'handles', 'bar'],
    [/\bplinth\b/, 'base', 'plinth'],
    [/\bhairpin\b|\bmetal legs?\b/, 'legStyle', 'metal'],
  ],
  lamp: [
    [/\bdrum\b/, 'shade', 'drum'],
    [/\bempire\b/, 'shade', 'empire'],
    [/\bcone\b|\btapered shade\b/, 'shade', 'cone'],
    [/\bdome\b/, 'shade', 'dome'],
    [/\bglobe\b|\bsphere\b|\borb\b/, 'shade', 'globe'],
    [/\barc\b|\barching\b/, 'stem', 'arc'],
    [/\btripod\b/, 'stem', 'tripod'],
    [/\bstacked\b|\btotem\b/, 'stem', 'stacked'],
    [/\bsquare\b|\bcube\b/, 'base', 'square'],
  ],
  planter: [
    [/\bfiddle\b/, 'plant', 'fiddle'],
    [/\bsnake\b|\bsansevieria\b/, 'plant', 'snake'],
    [/\bpalm\b|\bparlor\b|\bareca\b|\bkentia\b/, 'plant', 'palm'],
    [/\bpothos\b|\bphilodendron\b|\bivy\b|\bhoya\b|\bstring of\b|\btrailing\b/, 'plant', 'trailing'],
    [/\bbowl\b/, 'pot', 'bowl'],
    [/\bfooted\b|\bpedestal\b/, 'pot', 'footed'],
    [/\bsquare\b|\bbox\b|\bcube\b/, 'pot', 'square'],
    [/\bcylinder\b|\bcylindrical\b/, 'pot', 'cylinder'],
  ],
  rug: [
    [/\bround\b/, 'shape', 'round'],
    [/\bfringe[ds]?\b|\btassel(s|ed)?\b/, 'edge', 'fringe'],
  ],
  art: [
    [/\bunframed\b|\bprint only\b/, 'frame', 'none'],
    [/\bframed\b/, 'frame', 'thin'],
  ],
  mirror: [
    [/\barch(ed)?\b/, 'shape', 'arch'],
    [/\bround\b|\bcircle\b|\bcircular\b/, 'shape', 'round'],
    [/\boval\b/, 'shape', 'oval'],
    [/\bframeless\b|\bbeveled\b/, 'frame', 'none'],
  ],
  vase: [
    [/\bbud\b/, 'profile', 'bud'],
    [/\bbottle\b/, 'profile', 'bottle'],
    [/\bbowl\b/, 'profile', 'bowl'],
    [/\bcylinder\b|\bcylindrical\b/, 'profile', 'cylinder'],
    [/\bsphere\b|\borb\b|\bmoon\b/, 'profile', 'sphere'],
    [/\bamphora\b|\burn\b|\bjug\b/, 'profile', 'amphora'],
  ],
  pillow: [[/\bround\b/, 'shape', 'round']],
  'dining-chair': [
    [/\bbackless\b/, 'back', 'none'],
    [/\bspindle\b|\bwindsor\b/, 'back', 'spindle'],
    [/\bslat(ted)?\b|\bladder\b/, 'back', 'slats'],
    [/\bcane\b|\brattan\b|\bwoven\b/, 'back', 'open-frame'],
    [/\bupholstered\b/, 'back', 'upholstered'],
    [/\bupholstered\b/, 'seat', 'upholstered'],
    [/\bcushion(ed)?\b|\bseat pad\b/, 'seat', 'cushion'],
    [/\bswivel\b|\bpedestal\b/, 'base', 'pedestal'],
    [/\bmetal\b|\bhairpin\b|\bsteel\b/, 'legStyle', 'metal'],
    [/\btapered\b/, 'legStyle', 'tapered'],
  ],
}

/** Which slots each option colors, per family. Options not listed (size, fill, configuration…) color nothing. */
const OPTION_SLOTS: Readonly<Record<string, SlotMap[]>> = {
  sofa: UPHOLSTERY_OPTIONS,
  chair: UPHOLSTERY_OPTIONS,
  bed: [
    { name: /headboard (fabric|colou?r|upholster)/, slots: ['headboard'] },
    { name: /upholster|fabric/, slots: ['headboard', 'frame'], spread: true },
    { name: /wood|finish|stain|colou?r|material/, slots: ['frame', 'headboard'], spread: true },
  ],
  table: [
    { name: /\btop\b/, slots: ['top'] },
    { name: /base|leg/, slots: ['base'] },
    { name: /finish|wood|colou?r|stain|material|stone/, slots: ['top', 'base'], spread: true },
  ],
  storage: [
    { name: /hardware|handle|pull|knob/, slots: ['handles'] },
    { name: /finish|wood|colou?r|stain|material/, slots: ['body', 'fronts', 'base'], spread: true },
  ],
  lamp: [
    { name: /shade/, slots: ['shade'] },
    { name: /\bbase\b/, slots: ['base'] },
    { name: /finish|colou?r|metal|material/, slots: ['stem', 'shade'] },
  ],
  planter: [{ name: /planter|pot|colou?r|finish|glaze/, slots: ['pot'] }],
  rug: [{ name: /colou?r/, slots: ['top'] }],
  art: [{ name: /frame/, slots: ['frame'] }],
  mirror: [{ name: /finish|frame|colou?r|metal/, slots: ['frame'] }],
  vase: [{ name: /colou?r|finish|glaze|material/, slots: ['body'] }],
  curtain: [{ name: /colou?r|fabric/, slots: ['fabric'] }],
  pillow: [{ name: /colou?r|fabric|cover/, slots: ['fabric'] }],
  throw: [{ name: /colou?r|fabric/, slots: ['fabric'] }],
  'dining-chair': [
    { name: /seat|fabric|upholster|cushion|leather/, slots: ['seat'] },
    { name: /frame|wood|finish|leg|stain|colou?r|material/, slots: ['frame', 'seat'], spread: true },
  ],
}

/** Option names that never name a color, whatever else they contain ("Cover Type", "Headboard Height"). */
const NOT_COLOR = /size|fill|config|quantit|depth|height|density|support|\bset\b|orientation|\barm|style|shape|insert|type|width|length|count/

/** The slot a listing's own color (title, tags) belongs to when no option colors it. */
const PRIMARY: Readonly<Record<string, string[]>> = {
  sofa: ['upholstery'],
  chair: ['upholstery'],
  bed: ['frame', 'headboard'],
  table: ['top', 'base'],
  storage: ['body', 'fronts', 'base'],
  lamp: ['base', 'stem'],
  planter: ['pot'],
  rug: ['top'],
  mirror: ['frame'],
  vase: ['body'],
  curtain: ['fabric'],
  pillow: ['fabric'],
  throw: ['fabric'],
  'dining-chair': ['frame', 'seat'],
}

/** Words a listing may use that no block expresses yet (tallied into the coverage report). */
const VOCABULARY = [
  'sleeper', 'swivel', 'recliner', 'reclining', 'modular', 'tufted', 'scalloped', 'ribbed', 'fluted', 'slipcovered',
  'woven', 'rattan', 'cane', 'wicker', 'rope', 'nesting', 'extendable', 'storage', 'u-shaped', 'curved', 'boucle', 'shearling', 'rocking', 'glider', 'wingback', 'canopy', 'four poster', 'bunk', 'daybed', 'trundle', 'chandelier',
]

const NUMBERS: Readonly<Record<string, number>> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Tag values that state a color: "color-brown", "Color:Gold/Yellow", "colour_grey". */
function colorTags(tags: readonly string[]): string[] {
  return tags.flatMap((tag) => {
    const match = /^colou?r\s*[-_:]\s*(.+)$/i.exec(tag.trim())
    return match ? [match[1]!.replace(/[-_]/g, ' ')] : []
  })
}

function drawerGrid(count: number): { rows: number; cols: number } {
  if (count === 9) return { rows: 3, cols: 3 }
  if (count >= 4 && count % 2 === 0 && count <= 14) return { rows: count / 2, cols: 2 }
  return { rows: Math.min(count, 7), cols: 1 }
}

export function rulesRecipe(product: SnapshotProduct, text: ListingText = {}): Recipe {
  return rulesTrace(product, text).recipe
}

/** Whether an option's name could name a color (not a size, fill, configuration, style…). */
export function mayNameColor(optionName: string): boolean {
  return !NOT_COLOR.test(optionName.toLowerCase())
}

/** Which slots an option's values color in a family (and whether one color paints all of them); null when it colors nothing. */
export function colorOptionSlots(familyId: string, optionName: string): { slots: readonly string[]; spread: boolean } | null {
  const lower = optionName.toLowerCase()
  if (NOT_COLOR.test(lower)) return null
  const map = (OPTION_SLOTS[familyId] ?? []).find((entry) => entry.name.test(lower))
  return map ? { slots: map.slots, spread: !!map.spread } : null
}

/**
 * The rules recipe plus what the listing's own words decided (`fired` blocks
 * and params). A photo tier keeps those: the merchant's words beat a reading.
 */
export function rulesTrace(product: SnapshotProduct, text: ListingText = {}): { recipe: Recipe; fired: ReadonlySet<string> } {
  const defaultId = defaultRecipeId(product.category)
  const base = defaultId ? getRecipe(defaultId) : undefined
  if (!base) throw new Error(`No block family for category "${product.category}"`)
  const family = getFamily(base.family)!
  const words = fold([product.name, ...product.tags, text.productType ?? ''].join(' | '))

  const blocks: Record<string, string> = { ...base.blocks }
  const params: Record<string, number> = { ...base.params }
  const fired = new Set<string>()
  let matchedShape = false
  for (const [pattern, block, option] of RULES[family.id] ?? []) {
    if (fired.has(block) || !Object.hasOwn(family.blocks, block) || !pattern.test(words)) continue
    // An armchair's "round" is its look, not an ottoman top.
    if (family.id === 'chair' && block === 'top' && blocks.form !== 'ottoman') continue
    blocks[block] = option
    fired.add(block)
    matchedShape = true
  }
  if (family.id === 'sofa' && sofaShape(product, words, blocks)) {
    fired.add('shape')
    matchedShape = true
  }
  if (family.id === 'storage' && storageLayout(product.category, words, blocks, params)) {
    for (const name of ['layout', 'rows', 'cols']) fired.add(name)
    matchedShape = true
  }
  if (family.id === 'planter' && product.category === 'plant' && !fired.has('plant')) blocks.plant = 'bush'
  if (family.id === 'art' && !fired.has('frame')) {
    // A print sold as paper or canvas arrives without a frame unless the listing says framed.
    blocks.frame = 'none'
  }

  // Option values → slot colors and block choices.
  const optionColors: NonNullable<Recipe['optionColors']> = {}
  const optionBlocks: NonNullable<Recipe['optionBlocks']> = {}
  const materials = new Map<string, MaterialKind[]>()
  product.optionNames.forEach((name, index) => {
    const values = [...new Set(product.variants.map((variant) => variant.optionValues[index]).filter((value): value is string => !!value))]
    const byValue = optionValueBlocks(family, name, values, blocks)
    if (Object.keys(byValue).length > 0) {
      optionBlocks[name] = byValue
      matchedShape = true
    }
    const lower = name.toLowerCase()
    if (NOT_COLOR.test(lower)) return
    const map = (OPTION_SLOTS[family.id] ?? []).find((entry) => entry.name.test(lower))
    if (!map) return
    const colored: Record<string, Record<string, string>> = {}
    for (const value of values) {
      const kinds = map.slots.map((slot) => family.slots[slot]?.kind)
      const parts = map.spread ? [matchColor(value, kinds[0])] : matchColorParts(value, kinds)
      const slotColors: Record<string, string> = {}
      map.slots.forEach((slot, i) => {
        const part: ColorMatch | null | undefined = map.spread ? parts[0] : parts.length === 1 ? (i === 0 ? parts[0] : undefined) : parts[i]
        if (!part) return
        slotColors[slot] = part.hex
        if (part.material) materials.set(slot, [...(materials.get(slot) ?? []), part.material])
      })
      if (Object.keys(slotColors).length > 0) colored[value] = slotColors
    }
    if (Object.keys(colored).length > 0) optionColors[name] = colored
  })

  // Materials: most values say metal legs → metal legs; leather in the listing → leather upholstery.
  const materialKind: Record<string, MaterialKind> = { ...base.materialKind }
  for (const [slot, kinds] of materials) {
    const counts = new Map<MaterialKind, number>()
    for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1)
    const [top, count] = [...counts].sort((a, b) => b[1] - a[1])[0]!
    if (count * 2 > kinds.length && top !== family.slots[slot]!.kind && compatible(family.slots[slot]!.kind, top)) materialKind[slot] = top
  }
  if (Object.hasOwn(family.slots, 'upholstery') && /\bleather\b/.test(words)) materialKind.upholstery = 'leather'

  // The listing's own color (title, color tags, a tag that is exactly a color) for its main part, if no option colors it.
  const defaultColors: Record<string, string> = { ...base.defaultColors }
  const painted = new Set(Object.values(optionColors).flatMap((values) => Object.values(values).flatMap((colors) => Object.keys(colors))))
  // A plant's name is the plant ("Olive Tree"), not its pot's color.
  const primary = product.category === 'plant' ? [] : (PRIMARY[family.id] ?? []).filter((slot) => !painted.has(slot))
  let named = painted.size > 0
  if (primary.length > 0) {
    const own =
      matchColor(product.name, family.slots[primary[0]!]?.kind) ??
      colorTags(product.tags).map((tag) => matchColor(tag)).find(Boolean) ??
      product.tags.map((tag) => (COLOR_TAG.test(tag) ? matchColor(tag) : null)).find(Boolean)
    if (own) {
      for (const slot of primary) defaultColors[slot] = own.hex
      named = true
    }
  }

  const unmatched = VOCABULARY.filter((word) => new RegExp(`\\b${word}\\b`).test(words) && !expressed(word, blocks))
  const recipe: Recipe = {
    schemaVersion: 1,
    id: `rules:${product.id}`,
    productId: product.id,
    family: family.id,
    blocks,
    params,
    ...(Object.keys(materialKind).length > 0 ? { materialKind } : {}),
    ...(Object.keys(defaultColors).length > 0 ? { defaultColors } : {}),
    ...(Object.keys(optionColors).length > 0 ? { optionColors } : {}),
    ...(Object.keys(optionBlocks).length > 0 ? { optionBlocks } : {}),
    ...(family.imageSlot && product.imageUrl ? { image: { url: product.imageUrl } } : {}),
    tier: 'rules',
    generator: { version: RULES_VERSION },
    evidence: { colors: named ? 'name' : 'default', shape: matchedShape ? 'matched' : 'default' },
    ...(unmatched.length > 0 ? { unmatched: unmatched.slice(0, 20) } : {}),
  }
  const result = validateRecipe(recipe)
  if (!result.ok) throw new Error(`rules recipe for ${product.id}: ${result.error}`)
  return { recipe: result.recipe, fired }
}

/** A tag that is nothing but a color name ("Blue", "Ivory"). */
const COLOR_TAG = /^[a-z]+( [a-z]+)?$/i

/** A slot may switch between hard materials (wood legs ↔ metal legs), never fabric ↔ metal. */
function compatible(from: MaterialKind, to: MaterialKind): boolean {
  const hard: MaterialKind[] = ['wood', 'metal', 'stone', 'ceramic', 'glass']
  const soft: MaterialKind[] = ['fabric', 'leather']
  return (hard.includes(from) && hard.includes(to)) || (soft.includes(from) && soft.includes(to))
}

function expressed(word: string, blocks: Readonly<Record<string, string>>): boolean {
  if (word === 'wingback') return blocks.headboard === 'wingback'
  if (word === 'curved') return blocks.headboard === 'rounded' || blocks.shell === 'barrel'
  return false
}

/** Sectional layout: chaise or L, and which side. Returns whether the words decided it. */
function sofaShape(product: SnapshotProduct, words: string, blocks: Record<string, string>): boolean {
  const left = /\bleft\b|\blaf\b|\bleft[- ]facing\b/.test(words)
  if (/\bchaise\b/.test(words)) {
    blocks.shape = left ? 'chaise-left' : 'chaise-right'
    return true
  }
  if (product.category === 'sectional' || /\bcorner\b|\bl[- ]shaped?\b/.test(words)) {
    blocks.shape = left ? 'L-left' : 'L-right'
    return left || /\bcorner\b|\bl[- ]shaped?\b/.test(words)
  }
  return false
}

/** Drawer counts, doors, open shelves. Returns whether the words decided it. */
function storageLayout(category: string, words: string, blocks: Record<string, string>, params: Record<string, number>): boolean {
  const count = /\b(\d{1,2}|two|three|four|five|six|seven|eight|nine)[- ]drawers?\b/.exec(words)
  if (count && category !== 'bookshelf') {
    const n = NUMBERS[count[1]!] ?? Number(count[1])
    if (n >= 1) {
      blocks.layout = 'drawers'
      Object.assign(params, drawerGrid(n))
      return true
    }
  }
  if (/\bbookcase\b|\bopen shel(f|ves)\b|\bopen\b.*\bcabinet\b/.test(words) && category !== 'dresser') {
    blocks.layout = 'shelves'
    return true
  }
  if (/\bdoors?\b/.test(words) && (category === 'cabinet' || category === 'nightstand')) {
    blocks.layout = 'doors'
    return true
  }
  return false
}

/** Block choices named by option values: arm styles, leg styles, round rug sizes, chaise sides. */
function optionValueBlocks(family: Family, name: string, values: readonly string[], blocks: Readonly<Record<string, string>>) {
  const familyId = family.id
  const lower = name.toLowerCase()
  const out: Record<string, Record<string, string>> = {}
  const set = (value: string, block: string, option: string) => {
    if (!family.blocks[block]?.options.includes(option)) return
    if (blocks[block] === option && !(block in (out[value] ?? {}))) return
    out[value] = { ...out[value], [block]: option }
  }
  for (const value of values) {
    const v = fold(value)
    if ((familyId === 'sofa' || familyId === 'chair') && /\barm/.test(lower)) {
      if (/\b(block|track|square)\b/.test(v)) set(value, 'arm', 'track')
      else if (/\b(round|rolled|roll)\b/.test(v)) set(value, 'arm', 'rolled')
      else if (/\b(slope|sloped|angled)\b/.test(v)) set(value, 'arm', 'slope')
      else if (/\bflared?\b/.test(v)) set(value, 'arm', 'flared')
      else if (/\b(armless|none)\b/.test(v)) set(value, 'arm', 'none')
    }
    if (familyId === 'sofa' && /orientation|facing|chaise|side/.test(lower)) {
      const chaise = (blocks.shape ?? '').startsWith('chaise')
      if (/\bleft\b/.test(v)) set(value, 'shape', chaise ? 'chaise-left' : 'L-left')
      else if (/\bright\b/.test(v)) set(value, 'shape', chaise ? 'chaise-right' : 'L-right')
    }
    if (/\bleg/.test(lower)) {
      if (familyId === 'table' && /\bhairpin\b/.test(v)) set(value, 'base', 'hairpin')
      else if (/\bhairpin\b|\bmetal\b/.test(v)) set(value, familyId === 'sofa' || familyId === 'chair' ? 'base' : 'legStyle', familyId === 'sofa' || familyId === 'chair' ? 'metal-legs' : 'metal')
      else if (/\bstraight\b/.test(v) && familyId !== 'sofa' && familyId !== 'chair') set(value, 'legStyle', 'straight')
      else if (/\btapered\b/.test(v)) set(value, familyId === 'sofa' || familyId === 'chair' ? 'base' : 'legStyle', familyId === 'sofa' || familyId === 'chair' ? 'tapered-legs' : 'tapered')
    }
    if ((familyId === 'rug' || familyId === 'mirror' || familyId === 'table') && /size|shape/.test(lower)) {
      const block = familyId === 'table' ? 'top' : 'shape'
      if (/\bround\b|\bcircle\b/.test(v)) set(value, block, 'round')
      else if (/\boval\b/.test(v)) set(value, block, 'oval')
    }
    if (familyId === 'art' && /frame/.test(lower) && /\b(unframed|no frame|none|print only)\b/.test(v)) set(value, 'frame', 'none')
    if (familyId === 'art' && /frame/.test(lower) && !/\b(unframed|no frame|none|print only)\b/.test(v) && blocks.frame === 'none') set(value, 'frame', 'thin')
    if (familyId === 'art' && /material/.test(lower) && /\bcanvas\b/.test(v)) set(value, 'frame', 'none')
  }
  return out
}
