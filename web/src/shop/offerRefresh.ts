/**
 * Re-read one variant's current price and availability from its store, for
 * the server's /api/offer route. Only harvested store hostnames are ever
 * contacted, inputs are validated before any request, a response redirected
 * off that host is refused, and prices follow the same honesty rules as the
 * harvest (placeholder stores and 0 are unknown).
 */
import type { Money } from '../domain/schema'
import { moneyFromCents, moneyFromDecimalString } from './money'
import { USER_AGENT, type FetchLike } from './shopify'
import { storeByDomain } from './stores'

export type OfferRequest = { store: string; handle: string; variant: string }

export type OfferRefresh =
  | { ok: true; price: Money | null; available?: boolean; retrievedAt: string }
  | { ok: false; status: number; error: string }

const HANDLE = /^[a-z0-9][a-z0-9._~-]*$/i
const VARIANT = /^\d{1,20}$/
const UNREACHABLE = 'The store could not be reached. The saved price is unchanged.'

type Found = { price: Money | null; available?: boolean }

/** The store's host and its www twin (Burrow redirects www.burrow.com → burrow.com). */
function sameStore(host: string, domain: string): boolean {
  const bare = domain.replace(/^www\./, '')
  return host === bare || host === `www.${bare}`
}

/** GET JSON, following at most two redirects and only within the store — never requesting another host. */
async function readJson(url: string, domain: string, fetch: FetchLike, timeoutMs: number): Promise<unknown> {
  let next = url
  for (let hop = 0; hop <= 2; hop++) {
    const response = await fetch(next, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location')
      const target = location ? new URL(location, next) : null
      if (!target || target.protocol !== 'https:' || !sameStore(target.hostname, domain)) throw new Error('redirected off the store')
      next = target.href
      continue
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
  throw new Error('too many redirects')
}

type RawVariant = { id?: unknown; price?: unknown; available?: unknown }

function variantsOf(body: unknown, path: 'js' | 'json'): RawVariant[] {
  const holder = path === 'js' ? body : (body as { product?: unknown } | null)?.product
  const variants = (holder as { variants?: unknown } | null)?.variants
  return Array.isArray(variants) ? (variants as RawVariant[]) : []
}

export async function refreshOffer(
  request: OfferRequest,
  options: { fetch: FetchLike; now?: () => Date; timeoutMs?: number },
): Promise<OfferRefresh> {
  const store = storeByDomain(request.store)
  if (!store || !HANDLE.test(request.handle) || !VARIANT.test(request.variant)) {
    return { ok: false, status: 400, error: 'Not a listing this app can refresh.' }
  }
  const timeoutMs = options.timeoutMs ?? 10_000
  const base = `https://${store.domain}/products/${request.handle}`
  const variantId = Number(request.variant)

  let found: Found | null | undefined
  // .js gives integer cents and availability; .json a decimal string only.
  for (const path of ['js', 'json'] as const) {
    let body: unknown
    try {
      body = await readJson(`${base}.${path}`, store.domain, options.fetch, timeoutMs)
    } catch {
      continue
    }
    const variant = variantsOf(body, path).find((v) => v.id === variantId)
    if (!variant) {
      found = null
      break
    }
    const price =
      path === 'js' ? moneyFromCents(variant.price, store.currency) : typeof variant.price === 'string' ? moneyFromDecimalString(variant.price, store.currency) : null
    found = {
      price: store.listsPrices && price && price.amountMinor > 0 ? price : null,
      ...(path === 'js' && typeof variant.available === 'boolean' ? { available: variant.available } : {}),
    }
    break
  }
  if (found === undefined) return { ok: false, status: 502, error: UNREACHABLE }
  if (found === null) return { ok: false, status: 404, error: 'This option is no longer listed by the store.' }
  return { ok: true, ...found, retrievedAt: (options.now?.() ?? new Date()).toISOString() }
}
