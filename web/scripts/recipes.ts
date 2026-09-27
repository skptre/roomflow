// Builds block recipes for the catalog snapshot. Run from web/:
//   npx tsx scripts/recipes.ts                       rules tier for every product → public/catalog/recipes.json
//   npx tsx scripts/recipes.ts --gemini --pilot [--model m] [--thinking LOW] [--out file]
//                                                    Gemini tier on the 48-product pilot → .data/pilot-<model>.json
//   npx tsx scripts/recipes.ts --gemini [--limit N]  Gemini tier on the catalog (under the ledger's caps) → recipes.json
//   npx tsx scripts/recipes.ts --lineup              pilot comparison data for the ?lineup page → public/dev/lineup.json
//   add --dry-run to any Gemini run to print the plan and worst-case cost without calling anything.
// Gemini answers are cached in .data/gemini/ by (product, model, prompt, photos), so nothing is paid for twice.
// Only public listing data is sent (title, options, description, store photos). Every call goes through
// the ledger: refused before dispatch if it could pass the per-call or daily cap.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, openAi, type AiContext } from '../server/ai'
import { worstCaseMicros, type Part } from '../src/ai/gemini'
import { rateFor } from '../src/ai/rates'
import { getFamily } from '../src/blocks/families'
import type { Family } from '../src/blocks/family'
import { Recipe } from '../src/blocks/recipe'
import {
  answerSchema,
  GEMINI_RECIPE_VERSION,
  mergeGemini,
  parseAnswer,
  planReadings,
  promptImages,
  promptText,
  readingsFrom,
  type GeminiAnswer,
  type PromptImage,
  type ValueImage,
} from '../src/shop/recipeGemini'
import { rulesTrace, type ListingText } from '../src/shop/recipeRules'
import { Snapshot, type SnapshotProduct } from '../src/shop/snapshot'
import { STORES } from '../src/shop/stores'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name: string) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const has = (name: string) => args.includes(name)

const MAX_OUTPUT_TOKENS = 4096
const CONCURRENCY = 4
const IMAGE_WIDTH = 512
const IMAGE_MAX_BYTES = 3_000_000
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const IMAGE_HOSTS = new Set(['cdn.shopify.com', ...STORES.map((store) => store.domain)])
const PILOT_SIZE = 48
const HELD_OUT = 6

const snapshot = Snapshot.parse(JSON.parse(readFileSync(join(root, 'public', 'catalog', 'snapshot.json'), 'utf8')))

// ---------- listing text from the raw feeds (description, product type, photos) ----------
function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const listingText = new Map<string, ListingText>()
for (const file of readdirSync(join(DATA_DIR, 'raw')).filter((name) => name.endsWith('.json') && !name.includes('.p1.'))) {
  const domain = file.replace(/\.json$/, '')
  const cached = JSON.parse(readFileSync(join(DATA_DIR, 'raw', file), 'utf8')) as unknown
  const list = (Array.isArray(cached) ? cached : (cached as { products: unknown[] }).products) as {
    id: number
    product_type?: string
    body_html?: string | null
    images?: { src?: string }[]
  }[]
  for (const raw of list) {
    listingText.set(`shop:${domain}:${raw.id}`, {
      productType: raw.product_type || undefined,
      description: raw.body_html ? stripHtml(raw.body_html) : undefined,
      images: (raw.images ?? []).map((image) => image.src).filter((src): src is string => typeof src === 'string' && src.startsWith('https://')),
    })
  }
}
const textOf = (product: SnapshotProduct) => listingText.get(product.id) ?? {}

// ---------- the rules tier for everyone ----------
const traces = new Map(snapshot.products.map((product) => [product.id, rulesTrace(product, textOf(product))]))
const familyOf = (product: SnapshotProduct): Family => getFamily(traces.get(product.id)!.recipe.family)!

// ---------- pilot: ≥3 per family across stores, deterministic, 6 held out ----------
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

function pilotProducts(): { product: SnapshotProduct; heldOut: boolean }[] {
  const byFamily = new Map<string, SnapshotProduct[]>()
  for (const product of [...snapshot.products].sort((a, b) => hash(a.id).localeCompare(hash(b.id)))) {
    if (!product.imageUrl) continue
    const family = familyOf(product).id
    byFamily.set(family, [...(byFamily.get(family) ?? []), product])
  }
  const picked: SnapshotProduct[] = []
  const take = (family: string, count: number) => {
    const pool = (byFamily.get(family) ?? []).filter((p) => !picked.includes(p))
    const stores = new Set<string>()
    // Prefer a different store for each pick; then fill from any store.
    for (const product of pool) if (picked.filter((p) => familyOf(p).id === family).length < count && !stores.has(product.storeDomain)) {
      picked.push(product)
      stores.add(product.storeDomain)
    }
    for (const product of pool) if (picked.filter((p) => familyOf(p).id === family).length < count && !picked.includes(product)) picked.push(product)
  }
  for (const family of byFamily.keys()) take(family, 3)
  for (const family of ['sofa', 'chair', 'storage', 'table', 'bed']) if (picked.length < PILOT_SIZE) take(family, 4)
  const chosen = picked.slice(0, PILOT_SIZE)
  const held = new Set([...chosen].sort((a, b) => hash(`held:${a.id}`).localeCompare(hash(`held:${b.id}`))).slice(0, HELD_OUT))
  return chosen.map((product) => ({ product, heldOut: held.has(product) }))
}

// ---------- photos ----------
const imageDir = join(DATA_DIR, 'images')
mkdirSync(imageDir, { recursive: true })

function sizedUrl(url: string): string {
  const parsed = new URL(url)
  parsed.searchParams.set('width', String(IMAGE_WIDTH))
  return parsed.toString()
}

async function loadImage(url: string): Promise<{ mimeType: string; data: string } | null> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || !IMAGE_HOSTS.has(parsed.hostname)) return null
  const target = sizedUrl(url)
  const file = join(imageDir, hash(target))
  if (existsSync(`${file}.json`)) return JSON.parse(readFileSync(`${file}.json`, 'utf8')) as { mimeType: string; data: string }
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'Roomflow-hackathon (store feed reader)' } })
    const mimeType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim()
    if (!response.ok || !IMAGE_TYPES.has(mimeType)) return null
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) return null
    const image = { mimeType, data: bytes.toString('base64') }
    writeFileSync(`${file}.json`, JSON.stringify(image))
    return image
  } catch {
    return null
  }
}

// ---------- one product's Gemini answer (cached) ----------
type Answered = { productId: string; answer: GeminiAnswer; images: PromptImage[]; micros: number; cached: boolean }
type Outcome = Answered | { productId: string; skipped: string; micros: number }

const answerDir = join(DATA_DIR, 'gemini')
mkdirSync(answerDir, { recursive: true })

async function answerFor(ai: AiContext | null, model: string, thinking: 'MINIMAL' | 'LOW', product: SnapshotProduct, owned: ValueImage[], dryRun: boolean): Promise<Outcome> {
  const family = familyOf(product)
  const text = textOf(product)
  let images = promptImages(product, family, owned, text)
  const loaded = new Map<number, { mimeType: string; data: string }>()
  for (const image of images) {
    const data = dryRun ? { mimeType: 'image/jpeg', data: '' } : await loadImage(image.url)
    if (data) loaded.set(image.number, data)
  }
  if (!loaded.has(1)) return { productId: product.id, skipped: 'main photo unavailable', micros: 0 }
  // Photos that failed to load are dropped and the rest renumbered.
  if (loaded.size < images.length) {
    const keptOwned = owned.filter((v) => images.some((image) => image.url === v.url && loaded.has(image.number)))
    const keptListing = (text.images ?? []).filter((url) => images.some((image) => image.url === url && image.role === 'listing' && loaded.has(image.number)))
    const byUrl = new Map(images.map((image) => [image.url, loaded.get(image.number)]))
    images = promptImages(product, family, keptOwned, { ...text, images: keptListing })
    loaded.clear()
    for (const image of images) loaded.set(image.number, byUrl.get(image.url)!)
  }
  const prompt = promptText(product, family, text, images)
  const schema = answerSchema(family, product, images)
  const key = hash(JSON.stringify([product.id, model, thinking, GEMINI_RECIPE_VERSION, prompt, schema, images.map((image) => image.url)]))
  const cacheFile = join(answerDir, `${key}.json`)
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as { answer: unknown }
    const parsed = parseAnswer(cached.answer, family, product, images)
    if (parsed.ok) return { productId: product.id, answer: parsed.answer, images, micros: 0, cached: true }
  }
  const parts: Part[] = [{ text: prompt }]
  for (const image of images) parts.push({ text: `[${image.label}]` }, { inlineData: loaded.get(image.number)! })
  if (dryRun || !ai) {
    const rate = rateFor(model, new Date())!
    return { productId: product.id, skipped: 'dry run', micros: worstCaseMicros(rate, { textChars: prompt.length, images: images.length, maxOutputTokens: MAX_OUTPUT_TOKENS }) }
  }

  let spent = 0
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const retryNote: Part[] = attempt === 0 ? [] : [{ text: `Your previous answer was rejected: ${lastError}. Answer again, following the schema exactly.` }]
    const allParts = [...parts, ...retryNote]
    const result = await ai.call({
      purpose: attempt === 0 ? 'recipe' : 'recipe-retry',
      inputClass: 'public-product',
      model,
      parts: allParts,
      schema,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingLevel: thinking,
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
      timeoutMs: 90_000,
      textChars: allParts.reduce((sum, part) => sum + ('text' in part ? part.text.length : 0), 0),
      images: images.length,
    })
    spent += result.micros
    if ('refused' in result) return { productId: product.id, skipped: `refused: ${result.refused}`, micros: spent }
    if (!result.ok) {
      lastError = result.error
      continue
    }
    const parsed = parseAnswer(result.value, family, product, images)
    if (parsed.ok) {
      writeFileSync(cacheFile, JSON.stringify({ productId: product.id, model, thinking, version: GEMINI_RECIPE_VERSION, at: new Date().toISOString(), usage: result.usage, micros: result.micros, answer: result.value }))
      return { productId: product.id, answer: parsed.answer, images, micros: spent, cached: false }
    }
    lastError = parsed.error
  }
  return { productId: product.id, skipped: `invalid answer: ${lastError}`, micros: spent }
}

async function runGemini(products: SnapshotProduct[], model: string, thinking: 'MINIMAL' | 'LOW', dryRun: boolean) {
  const opened = dryRun ? null : openAi()
  if (opened && 'unavailable' in opened) throw new Error(opened.unavailable)
  const ai: AiContext | null = opened
  if (ai) {
    const chosen = await ai.chooseModel(model)
    console.log(`model ${chosen.model} (${chosen.reason}); spent today $${(ai.ledger.spentTodayMicros() / 1e6).toFixed(4)}`)
  }
  const plan = planReadings(products.map((product) => ({ product, familyId: familyOf(product).id })))
  const outcomes: Outcome[] = []
  let next = 0
  let stop = ''
  async function worker() {
    while (next < products.length && !stop) {
      const product = products[next++]!
      const outcome = await answerFor(ai, model, thinking, product, plan.get(product.id) ?? [], dryRun)
      outcomes.push(outcome)
      if ('skipped' in outcome && outcome.skipped.startsWith('refused: daily-cap')) stop = 'daily cap reached'
      const done = outcomes.length
      if (done % 10 === 0 || done === products.length) console.log(`${done}/${products.length} · spent this run $${(outcomes.reduce((s, o) => s + o.micros, 0) / 1e6).toFixed(4)}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  if (stop) console.log(`stopped: ${stop}; remaining products keep their rules recipes`)

  const answered = outcomes.filter((o): o is Answered => 'answer' in o)
  const readings = new Map<string, Record<string, string>>()
  for (const o of answered) {
    const product = products.find((p) => p.id === o.productId)!
    for (const reading of readingsFrom(o.answer, product, familyOf(product), o.images)) readings.set(reading.key, reading.slots)
  }
  const recipes = new Map<string, Recipe>()
  const vetoes: string[] = []
  const failures: string[] = []
  for (const o of answered) {
    const product = products.find((p) => p.id === o.productId)!
    try {
      const merged = mergeGemini({ product, trace: traces.get(product.id)!, answer: o.answer, images: o.images, readings, model })
      recipes.set(product.id, merged.recipe)
      vetoes.push(...merged.vetoes.map((v) => `${product.name}: ${v}`))
    } catch (error) {
      failures.push(`${product.id}: ${String(error)}`)
    }
  }
  for (const o of outcomes) if ('skipped' in o) failures.push(`${o.productId}: ${o.skipped}`)
  const micros = outcomes.reduce((sum, o) => sum + o.micros, 0)
  console.log(
    `${dryRun ? 'worst case' : 'spent'} $${(micros / 1e6).toFixed(4)} · answered ${answered.length} (${answered.filter((o) => o.cached).length} cached) · merged ${recipes.size} · vetoes ${vetoes.length} · failed/skipped ${failures.length}`,
  )
  for (const line of [...failures, ...vetoes].slice(0, 30)) console.log(`  ${line}`)
  return { recipes, vetoes, failures, micros }
}

function writeRecipes(file: string, recipes: Map<string, Recipe>, extra: Record<string, unknown> = {}) {
  const list = snapshot.products.map((product) => recipes.get(product.id) ?? traces.get(product.id)!.recipe)
  for (const recipe of list) Recipe.parse(recipe)
  const tiers = list.reduce<Record<string, number>>((counts, recipe) => ({ ...counts, [recipe.tier]: (counts[recipe.tier] ?? 0) + 1 }), {})
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), snapshotRetrievedAt: snapshot.retrievedAt, tiers, ...extra, recipes: list }))
  console.log(`wrote ${file} (${list.length} recipes: ${JSON.stringify(tiers)})`)
}

// ---------- modes ----------
const model = flag('--model') ?? 'gemini-3.8-flash'
const thinking = (flag('--thinking') ?? 'LOW') as 'MINIMAL' | 'LOW'
const dryRun = has('--dry-run')

if (has('--lineup')) {
  const pilot = pilotProducts()
  const runs = readdirSync(DATA_DIR)
    .filter((name) => name.startsWith('pilot-') && name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as { label: string; recipes: Recipe[] })
  const rows = pilot.map(({ product, heldOut }) => {
    const variant = product.variants.find((v) => !v.imageUrl || v.imageUrl === product.imageUrl) ?? product.variants[0]!
    return {
      id: product.id,
      name: product.name,
      store: product.store,
      category: product.category,
      url: product.url,
      photo: variant.imageUrl ?? product.imageUrl,
      variant: variant.optionValues.join(' / ') || 'Standard',
      optionNames: product.optionNames,
      optionValues: variant.optionValues,
      size: variant.dimensions,
      heldOut,
      columns: [
        { label: 'rules (free)', recipe: traces.get(product.id)!.recipe },
        ...runs.map((run) => ({ label: run.label, recipe: run.recipes.find((r) => r.productId === product.id) ?? null })),
      ],
    }
  })
  const out = join(root, 'public', 'dev', 'lineup.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), rows }))
  console.log(`wrote ${out}: ${rows.length} rows × ${1 + runs.length} columns (${runs.map((r) => r.label).join(', ')})`)
} else if (has('--gemini')) {
  if (!rateFor(model, new Date())) throw new Error(`no known price for ${model}; add it to src/ai/rates.ts from the pricing page first`)
  if (has('--pilot')) {
    const pilot = pilotProducts()
    console.log(`pilot: ${pilot.length} products, ${new Set(pilot.map((p) => familyOf(p.product).id)).size} families, ${new Set(pilot.map((p) => p.product.storeDomain)).size} stores, ${pilot.filter((p) => p.heldOut).length} held out`)
    const result = await runGemini(pilot.map((p) => p.product), model, thinking, dryRun)
    if (!dryRun) {
      const out = flag('--out') ?? join(DATA_DIR, `pilot-${model}-${thinking.toLowerCase()}.json`)
      writeFileSync(out, JSON.stringify({ label: `${model} · ${thinking.toLowerCase()} thinking`, model, thinking, micros: result.micros, vetoes: result.vetoes, failures: result.failures, recipes: [...result.recipes.values()] }))
      console.log(`wrote ${out}`)
    }
  } else {
    const limit = Number(flag('--limit') ?? snapshot.products.length)
    const products = snapshot.products.filter((p) => p.imageUrl).slice(0, limit)
    const result = await runGemini(products, model, thinking, dryRun)
    if (!dryRun) writeRecipes(join(root, 'public', 'catalog', 'recipes.json'), result.recipes, { model, thinking })
  }
} else {
  writeRecipes(join(root, 'public', 'catalog', 'recipes.json'), new Map())
}
