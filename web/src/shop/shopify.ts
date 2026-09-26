/**
 * Public Shopify product feeds (`/products.json`). Validates only the subset
 * we use, pages politely (one request at a time with a delay, bounded pages,
 * timeouts, bounded retries) and never fails a whole store for one bad
 * product. Network access is injected so tests never touch the network.
 */
import { z } from 'zod'

const ShopifyImage = z.object({ src: z.url() })

export const ShopifyVariant = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  option1: z.string().nullable(),
  option2: z.string().nullable(),
  option3: z.string().nullable(),
  sku: z.string().nullable().optional(),
  available: z.boolean(),
  /** Decimal string in the store currency, e.g. "4497.00". */
  price: z.string(),
  featured_image: ShopifyImage.nullable().optional(),
})
export type ShopifyVariant = z.infer<typeof ShopifyVariant>

export const ShopifyProduct = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  handle: z.string().regex(/^[a-z0-9][a-z0-9._~-]*$/i),
  body_html: z.string().nullable(),
  vendor: z.string(),
  product_type: z.string(),
  tags: z.array(z.string()),
  options: z.array(z.object({ name: z.string(), position: z.number().int(), values: z.array(z.string()) })),
  images: z.array(ShopifyImage.extend({ id: z.number().int(), variant_ids: z.array(z.number().int()).optional() })),
  variants: z.array(ShopifyVariant).min(1),
})
export type ShopifyProduct = z.infer<typeof ShopifyProduct>

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export type HarvestOptions = {
  fetch: FetchLike
  sleep?: (ms: number) => Promise<void>
  maxPages?: number
  delayMs?: number
  timeoutMs?: number
  retries?: number
}

export type HarvestResult = { domain: string; products: ShopifyProduct[]; errors: string[]; pages: number }

export const USER_AGENT = 'Roomflow-hackathon (store feed reader; see README for contact)'

/** A public hostname with a letter TLD — never an IP, port, path, or query. */
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i

export function assertStoreDomain(domain: string): void {
  if (!HOSTNAME.test(domain)) throw new Error(`store domain must be a bare hostname, got "${domain}"`)
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function getPage(url: string, options: Required<Omit<HarvestOptions, 'maxPages'>>): Promise<unknown> {
  let lastError = ''
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    if (attempt > 0) await options.sleep(options.delayMs * 2 ** attempt)
    try {
      const response = await options.fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(options.timeoutMs),
      })
      if (!response.ok) {
        lastError = `HTTP ${response.status}`
        continue
      }
      return await response.json()
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  throw new Error(lastError)
}

export async function harvestStore(domain: string, options: HarvestOptions): Promise<HarvestResult> {
  assertStoreDomain(domain)
  const settings = { sleep: wait, delayMs: 1000, timeoutMs: 15_000, retries: 2, ...options }
  const maxPages = options.maxPages ?? 12
  const products: ShopifyProduct[] = []
  const errors: string[] = []
  let pages = 0
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await settings.sleep(settings.delayMs)
    let body: unknown
    try {
      body = await getPage(`https://${domain}/products.json?limit=250&page=${page}`, settings)
    } catch (error) {
      errors.push(`page ${page}: ${(error as Error).message}`)
      break
    }
    pages = page
    const list = z.object({ products: z.array(z.unknown()) }).safeParse(body)
    if (!list.success) {
      errors.push(`page ${page}: not a product feed`)
      break
    }
    if (list.data.products.length === 0) break
    list.data.products.forEach((raw, index) => {
      const product = ShopifyProduct.safeParse(raw)
      if (product.success) products.push(product.data)
      else errors.push(`page ${page}: product ${index + 1} invalid (${product.error.issues[0]?.path.join('.') ?? 'unknown'})`)
    })
  }
  return { domain, products, errors, pages }
}
