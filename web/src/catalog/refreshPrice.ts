/**
 * "Refresh price": ask our own server to re-read one offer from its store.
 * The reply is validated here, and a successful refresh yields a newer offer
 * (same id, new retrievedAt) for the catalog's offer map — never a room edit,
 * so undo does not revert it. Failures keep the saved offer.
 */
import { z } from 'zod'
import { formatMoney } from '../domain/money'
import { Money, type Offer } from '../domain/schema'

const Reply = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), price: Money.nullable(), available: z.boolean().optional(), retrievedAt: z.iso.datetime() }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

export type PriceRefresh = { ok: true; offer: Offer; message: string; changed: boolean } | { ok: false; message: string }

type Fetch = (url: string) => Promise<Response>

const UNAVAILABLE = 'Couldn’t check the price right now. The saved price is unchanged.'

function describe(before: Offer, after: Offer): { message: string; changed: boolean } {
  const store = after.merchant
  const was = before.price ? formatMoney(before.price) : null
  const now = after.price ? formatMoney(after.price) : null
  if (before.available !== false && after.available === false) {
    return { message: `${store} now shows it as sold out${now ? ` at ${now}` : ''}.`, changed: true }
  }
  if (!now) return { message: was ? `${store} no longer shows a price for it (was ${was}).` : `${store} still shows no price for it.`, changed: was !== null }
  if (now !== was || before.price?.currency !== after.price?.currency) {
    return { message: was ? `${store} now lists it at ${now} (was ${was}).` : `${store} now lists it at ${now}.`, changed: true }
  }
  if (before.available === false && after.available === true) return { message: `${store} has it back in stock at ${now}.`, changed: true }
  return { message: `${store} still lists it at ${now}.`, changed: false }
}

export async function refreshPrice(offer: Offer, fetch: Fetch): Promise<PriceRefresh> {
  if (offer.isSample || !offer.url || !offer.sourceStore) return { ok: false, message: 'This price can’t be refreshed.' }
  const link = new URL(offer.url)
  const handle = /^\/products\/([^/]+)$/.exec(link.pathname)?.[1]
  const variant = link.searchParams.get('variant')
  if (!handle || !variant) return { ok: false, message: 'This price can’t be refreshed.' }

  const query = new URLSearchParams({ store: offer.sourceStore, handle, variant })
  let reply: z.infer<typeof Reply>
  try {
    const response = await fetch(`/api/offer?${query}`)
    const parsed = Reply.safeParse(await response.json())
    if (!parsed.success) return { ok: false, message: UNAVAILABLE }
    reply = parsed.data
  } catch {
    return { ok: false, message: UNAVAILABLE }
  }
  if (!reply.ok) return { ok: false, message: reply.error }

  const next: Offer = {
    ...offer,
    price: reply.price,
    retrievedAt: reply.retrievedAt,
    ...(reply.available !== undefined ? { available: reply.available } : {}),
  }
  return { ok: true, offer: next, ...describe(offer, next) }
}
