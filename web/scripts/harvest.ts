// Reads the verified stores' public product feeds and writes the committed
// catalog snapshot plus a human-readable report. Run from web/:
//   npx tsx scripts/harvest.ts [--pages N] [--store domain] [--per-group N] [--offline]
// Raw listings are cached under .data/raw/ (gitignored) with their retrieval
// time; --offline rebuilds the snapshot from that cache without contacting
// stores. Failures are logged and skipped; the snapshot never contains
// anything the stores did not list, and its time is the oldest retrieval.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATEGORIES } from '../src/domain/categories'
import { MAX_VARIANTS, normalizeProduct } from '../src/shop/normalize'
import { selectForSnapshot } from '../src/shop/select'
import { harvestStore, ShopifyProduct, type HarvestResult } from '../src/shop/shopify'
import { Snapshot, type SnapshotProduct } from '../src/shop/snapshot'
import { STORES } from '../src/shop/stores'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'catalog')
const rawDir = join(root, '.data', 'raw')

const args = process.argv.slice(2)
const flag = (name: string) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const maxPages = Number(flag('--pages') ?? 12)
const only = flag('--store')
const perGroup = Number(flag('--per-group') ?? 30)
const offline = args.includes('--offline')

/** Words the block library is authored against (plan: "block reference system", layer 2). */
const VOCABULARY = [
  'sectional', 'modular', 'woven', 'upholstered', 'chaise', 'channel', 'panel', 'tufted', 'ribbed', 'tulip', 'tapered',
  'pedestal', 'nesting', 'slipper', 'button', 'scalloped', 'waterfall', 'slatted', 'platform', 'track arm', 'rolled arm',
  'slope arm', 'wingback', 'arched', 'curved', 'round', 'oval', 'swivel', 'sling', 'cane', 'rattan', 'boucle', 'bouclé',
  'velvet', 'leather', 'linen', 'walnut', 'oak', 'drum', 'hairpin', 'trestle', 'drawer', 'storage', 'sleeper', 'pillow back',
]

const retrievals: string[] = []
const products = new Map<string, SnapshotProduct>()
const storeRows: Snapshot['stores'] = []
const excluded = new Map<string, number>()
const unmappedTypes = new Map<string, number>()
let truncated = 0

mkdirSync(rawDir, { recursive: true })
for (const store of STORES) {
  if (only && store.domain !== only) continue
  const cache = join(rawDir, `${store.domain}.json`)
  let result: HarvestResult & { retrievedAt: string }
  if (offline) {
    if (!existsSync(cache)) {
      console.log(`no cached listings for ${store.domain}; skipped`)
      continue
    }
    const cached = JSON.parse(readFileSync(cache, 'utf8')) as unknown
    // Older caches are a bare product array written right after retrieval: use the file time.
    const record = Array.isArray(cached) ? { products: cached, errors: [], pages: 0, retrievedAt: statSync(cache).mtime.toISOString() } : (cached as typeof result)
    result = { ...record, domain: store.domain, products: record.products.map((p) => ShopifyProduct.parse(p)) }
  } else {
    console.log(`harvesting ${store.domain} …`)
    const retrievedAt = new Date().toISOString()
    result = { ...(await harvestStore(store.domain, { fetch, maxPages })), retrievedAt }
    writeFileSync(cache, JSON.stringify(result))
  }
  retrievals.push(result.retrievedAt)
  let kept = 0
  for (const raw of result.products) {
    const normalized = normalizeProduct(raw, store)
    if (!('product' in normalized)) {
      excluded.set(normalized.excluded, (excluded.get(normalized.excluded) ?? 0) + 1)
      if (normalized.excluded === 'unmapped') {
        const key = `${store.name}: ${raw.product_type || '(no type)'}`
        unmappedTypes.set(key, (unmappedTypes.get(key) ?? 0) + 1)
      }
      continue
    }
    // Pages can shift while we read them; keep one copy per store product.
    if (!products.has(normalized.product.id)) kept += 1
    products.set(normalized.product.id, normalized.product)
    truncated += normalized.truncatedVariants
  }
  storeRows.push({ domain: store.domain, name: store.name, products: kept, errors: result.errors })
  console.log(`  ${result.products.length} listings over ${result.pages} pages → ${kept} kept${result.errors.length ? `, errors: ${result.errors.join('; ')}` : ''}`)
}

const all = [...products.values()]
const selected = selectForSnapshot(all, perGroup)
for (const row of storeRows) row.products = selected.filter((p) => p.storeDomain === row.domain).length
const retrievedAt = retrievals.sort()[0] ?? new Date().toISOString()
const snapshot = Snapshot.parse({ version: 1, retrievedAt, stores: storeRows, products: selected })
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(snapshot))
writeFileSync(join(outDir, 'harvest-report.md'), report(snapshot))
console.log(`wrote ${snapshot.products.length} products to public/catalog/snapshot.json`)

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((100 * part) / whole)}%` : '—'
}

function report(snap: Snapshot): string {
  const variants = snap.products.flatMap((p) => p.variants.map((v) => ({ p, v })))
  const byCategory = new Map<string, { products: number; variants: number; merchant: number; priced: number; available: number }>()
  for (const p of snap.products) {
    const row = byCategory.get(p.category) ?? { products: 0, variants: 0, merchant: 0, priced: 0, available: 0 }
    row.products += 1
    for (const v of p.variants) {
      row.variants += 1
      if (v.dimensions.source === 'merchant') row.merchant += 1
      if (v.price) row.priced += 1
      if (v.available) row.available += 1
    }
    byCategory.set(p.category, row)
  }
  const optionNames = new Map<string, number>()
  for (const p of snap.products) for (const name of p.optionNames) optionNames.set(name, (optionNames.get(name) ?? 0) + 1)
  const vocab = VOCABULARY.map((word) => {
    const pattern = new RegExp(`\\b${word}\\b`, 'i')
    return [word, snap.products.filter((p) => pattern.test(`${p.name} ${p.tags.join(' ')}`)).length] as const
  }).sort((a, b) => b[1] - a[1])
  const sorted = <K,>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1])

  return [
    `# Catalog harvest report`,
    ``,
    `Retrieved ${snap.retrievedAt} (earliest store) from ${snap.stores.length} stores' public product feeds. ${snap.products.length} products, ${variants.length} variants,`,
    `chosen from ${all.length} room-ready listings: at most ${perGroup} per store and category, one of each design before a second.`,
    `Prices are what each store listed at that time (USD). Unknown prices are shown as unknown, never zero.`,
    `Loloi's feed lists placeholder prices (99999.00), so its offers are unknown-price.`,
    ``,
    `## Stores`,
    ``,
    `| Store | Products kept | Errors |`,
    `|---|---:|---|`,
    ...snap.stores.map((s) => `| [${s.name}](https://${s.domain}) | ${s.products} | ${s.errors.join('; ') || '—'} |`),
    ``,
    `## Categories`,
    ``,
    `| Category | Products | Variants | Merchant-listed size | Priced | In stock |`,
    `|---|---:|---:|---:|---:|---:|`,
    ...[...byCategory]
      .sort((a, b) => b[1].products - a[1].products)
      .map(([c, r]) => `| ${CATEGORIES[c]?.label ?? c} | ${r.products} | ${r.variants} | ${pct(r.merchant, r.variants)} | ${pct(r.priced, r.variants)} | ${pct(r.available, r.variants)} |`),
    ``,
    `Variants beyond ${MAX_VARIANTS} per product were left out: ${truncated}.`,
    ``,
    `## Excluded listings`,
    ``,
    ...sorted(excluded).map(([reason, n]) => `- ${reason}: ${n}`),
    ``,
    `Most common unmapped product types:`,
    ``,
    ...sorted(unmappedTypes)
      .slice(0, 25)
      .map(([type, n]) => `- ${type}: ${n}`),
    ``,
    `## Block vocabulary (product names and tags)`,
    ``,
    `| Word | Products |`,
    `|---|---:|`,
    ...vocab.filter(([, n]) => n > 0).map(([w, n]) => `| ${w} | ${n} |`),
    ``,
    `## Option names`,
    ``,
    ...sorted(optionNames)
      .slice(0, 30)
      .map(([name, n]) => `- ${name}: ${n}`),
    ``,
  ].join('\n')
}
