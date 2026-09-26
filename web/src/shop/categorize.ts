/**
 * Store listing → Roomflow category. Only listings that become one visible,
 * buyable room object are kept: swatches, slipcovers, bedding, hardware,
 * fees, bundles and multi-item sets are excluded with a reason (the harvest
 * report counts them). The product type decides first; generic types
 * ("Seating", "Furniture", none) defer to the title. Anything unrecognized
 * is reported as unmapped rather than guessed.
 */

export type Categorized = { category: string } | { category: null; excluded: string }

export type ListingText = { productType: string; title: string; tags: readonly string[] }

type Rule = [pattern: RegExp, result: string]

/** Checked against type and title. Order matters: first match wins. */
const EXCLUDE: Rule[] = [
  [/\bswatch(es)?\b|\bsample\b/, 'swatch-or-sample'],
  [/slipcover|seating accessories|headboard accessories|furniture accessories|leather tops/, 'part-or-accessory'],
  [/gift card|\bfee\b|\bcontent\b|serviceability|warranty|insurance|protection plan/, 'not-a-product'],
  [/\bbundles?\b|\bset of \d+\b|\(set of|\bsets? with\b|outdoor set|\bpair\b|& chairs\b|\bwith ottoman\b| \+ /, 'multi-item-set'],
  [/\bfabric\b(?! swatch)|yardage/, 'fabric-yardage'],
  [/\bpulls?\b(?!-\s*out)|\bknobs?\b|\bhooks?\b|hardware|\bleg\b|\blegs\b|\brack\b/, 'hardware'],
  [/sheets?\b|sheeting|duvet|pillowcase|\bshams?\b|comforter|quilt|coverlet|bed blanket|bedding|bed bundles/, 'bedding'],
  [/mattress|adjustable base|box foundation|body pillow|pillow insert|down alternative/, 'sleep-product'],
  [/towel|\bbath\b|bath rug|bath mat|tub mat|shower curtain|\brobes?\b|slipper|loungewear|clog|baby/, 'bath-or-apparel'],
  [/add-?on|expansion|lift kit|headboard/, 'bed-add-on'],
  [/roman shade|\bshades?\b|\bblinds?\b/, 'window-shade'],
  [/sconce|flush mount|pendant|chandelier|ceiling/, 'ceiling-or-wall-light'],
  [/outdoor plant|\bbulbs?\b|\bseeds?\b|consumable|plant food|fertilizer|leaf care|care duo|potting soil|soil mix/, 'garden-supply'],
  [/rug pad/, 'rug-pad'],
  [/storage cart|bar cart|wall shel|picture ledge|modular component/, 'unsupported-form'],
]

/** Product types that name the category directly. */
const BY_TYPE: Rule[] = [
  [/^(modular )?sectionals?$/, 'sectional'],
  [/^(sofas?|modular sofas|sofas & loveseats|loveseats?)$/, 'sofa'],
  [/^(dining chairs?|bar and counter stools)$/, 'dining-chair'],
  [/^(chairs?|lounge chairs|accent seating|armchairs?|swivel chairs?)$/, 'lounge-chair'],
  [/^ottomans?$/, 'ottoman'],
  [/^(benches|bench|dining bench)$/, 'bench'],
  [/^(beds?|daybeds?)$/, 'bed'],
  [/^nightstands?$/, 'nightstand'],
  [/^dressers?$/, 'dresser'],
  [/^(bookshelf|bookshelves|bookcases?|shelving)$/, 'bookshelf'],
  [/^(media centers?|cabinets?)$/, 'cabinet'],
  [/^coffee tables?$/, 'coffee-table'],
  [/^(side tables?|end tables?)$/, 'side-table'],
  [/^(round )?dining tables?$/, 'dining-table'],
  [/^console tables?$/, 'console'],
  [/^table lamps?$/, 'table-lamp'],
  [/^floor lamps?$/, 'floor-lamp'],
  [/^rugs?$/, 'rug'],
  [/^(indoor )?plants?$/, 'plant'],
  [/^planters?$/, 'planter'],
  [/^(horizontal|vertical|art|wall art|art prints?)$/, 'wall-art'],
  [/^mirrors?$/, 'mirror'],
  [/^(custom )?curtains?$/, 'curtain'],
  // Sleeping pillows and inserts were already excluded above.
  [/^(pillows?|decorative pillows|throw pillows|pillow covers)$/, 'pillow'],
  [/^(throw blankets|throws)$/, 'throw'],
  [/^vases?$/, 'vase'],
  [/^trays?$/, 'decor-object'],
]

/** Title words, for generic types and to refine broad ones. First match wins. */
const BY_TITLE: Rule[] = [
  [/sectional|u-shape|l-shape|chaise sofa/, 'sectional'],
  [/\bsofa\b|loveseat|\bsettee\b|\bcouch\b/, 'sofa'],
  [/dining chair|counter stool|bar stool|counter height stool|bar height stool/, 'dining-chair'],
  [/ottoman(?! tray)|pouf|\bstool\b/, 'ottoman'],
  [/\bbench\b/, 'bench'],
  [/\bchair\b|armchair/, 'lounge-chair'],
  [/nightstand|bedside table/, 'nightstand'],
  [/\bbed\b|bed frame/, 'bed'],
  [/dresser|chest of drawers/, 'dresser'],
  [/wardrobe|armoire|credenza|sideboard|buffet|cabinet|media console|media center/, 'cabinet'],
  [/bookshelf|bookcase|shelving|etagere/, 'bookshelf'],
  [/coffee table/, 'coffee-table'],
  [/side table|end table|accent table/, 'side-table'],
  [/dining table/, 'dining-table'],
  [/console/, 'console'],
  [/\bdesk\b/, 'desk'],
  [/floor lamp/, 'floor-lamp'],
  [/table lamp|\blamp\b/, 'table-lamp'],
  [/\brug\b/, 'rug'],
  [/mirror/, 'mirror'],
  [/curtain|drape/, 'curtain'],
  [/\bthrow\b/, 'throw'],
  [/pillow|cushion/, 'pillow'],
  [/planter|\bpot\b/, 'planter'],
  [/\bvase\b/, 'vase'],
  [/lantern|candle holder|sculpture|\bbowl\b|\btray\b|objet|bookends?/, 'decor-object'],
]

/** Types too broad to decide alone: the title refines them. */
const GENERIC = /^(|seating|furniture|outdoor furniture|dining|decor|decorative accessories|lighting|tables|storage|shelving & storage|pillows & throws|accent tables?|accessories|benches, stools & ottomans|stools?|blankets?|frames?|wall décor \+ mirrors|mirrors & frames)$/

const SEATING_REFINEMENTS = new Set(['sectional', 'lounge-chair', 'ottoman', 'bench', 'dining-chair'])

function first(rules: readonly Rule[], text: string): string | undefined {
  return rules.find(([pattern]) => pattern.test(text))?.[1]
}

export function categorize({ productType, title }: ListingText): Categorized {
  const type = productType.trim().toLowerCase()
  const name = title.trim().toLowerCase()
  const excluded = first(EXCLUDE, type) ?? first(EXCLUDE, name)
  if (excluded) return { category: null, excluded }

  if (!GENERIC.test(type)) {
    const direct = first(BY_TYPE, type)
    if (!direct) return { category: null, excluded: 'unmapped' }
    // Stores file other seating under sofa types (Poly & Bark: sectionals and ottomans
    // under "Sofas & Loveseats"; Floyd: a lounge chair under "Sectionals"). An explicit
    // seating word in the title wins.
    if (direct === 'sofa' || direct === 'sectional') {
      const byTitle = first(BY_TITLE, name)
      if (byTitle && SEATING_REFINEMENTS.has(byTitle)) return { category: byTitle }
    }
    return { category: direct }
  }
  const byTitle = first(BY_TITLE, name)
  return byTitle ? { category: byTitle } : { category: null, excluded: 'unmapped' }
}
