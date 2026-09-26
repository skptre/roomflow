import { describe, expect, it } from 'vitest'
import type { Offer } from '../domain/schema'
import { refreshPrice } from './refreshPrice'

const offer: Offer = {
  id: 'offer:shop:www.burrow.com:9787726004526:50013108961582',
  variantId: 'shop:www.burrow.com:9787726004526:50013108961582',
  merchant: 'Burrow',
  url: 'https://www.burrow.com/products/nomad-king-sofa?variant=50013108961582',
  price: { amountMinor: 96400, currency: 'USD' },
  retrievedAt: '2026-09-26T19:28:27.651Z',
  isSample: false,
  available: true,
  sourceStore: 'www.burrow.com',
}

function server(status: number, body: unknown) {
  const urls: string[] = []
  const fetch = async (url: string) => {
    urls.push(url)
    return new Response(JSON.stringify(body), { status })
  }
  return { fetch, urls }
}

const AT = '2026-09-27T01:00:00.000Z'

describe('refreshPrice', () => {
  it('asks our server for exactly this variant and returns the newer offer', async () => {
    const { fetch, urls } = server(200, { ok: true, price: { amountMinor: 89900, currency: 'USD' }, available: true, retrievedAt: AT })
    const result = await refreshPrice(offer, fetch)
    expect(urls).toEqual(['/api/offer?store=www.burrow.com&handle=nomad-king-sofa&variant=50013108961582'])
    expect(result).toEqual({
      ok: true,
      offer: { ...offer, price: { amountMinor: 89900, currency: 'USD' }, available: true, retrievedAt: AT },
      message: 'Burrow now lists it at $899.00 (was $964.00).',
      changed: true,
    })
  })

  it('says so when nothing changed', async () => {
    const { fetch } = server(200, { ok: true, price: offer.price, available: true, retrievedAt: AT })
    const result = await refreshPrice(offer, fetch)
    expect(result).toMatchObject({ ok: true, changed: false, message: 'Burrow still lists it at $964.00.' })
  })

  it('announces a sell-out and an unknown price without inventing one', async () => {
    const soldOut = await refreshPrice(offer, server(200, { ok: true, price: offer.price, available: false, retrievedAt: AT }).fetch)
    expect(soldOut).toMatchObject({ ok: true, changed: true, message: 'Burrow now shows it as sold out at $964.00.' })
    const unknown = await refreshPrice(offer, server(200, { ok: true, price: null, retrievedAt: AT }).fetch)
    expect(unknown).toMatchObject({ ok: true, changed: true, message: 'Burrow no longer shows a price for it (was $964.00).' })
    // Availability not reported by the store: keep what we knew.
    if (unknown.ok) expect(unknown.offer.available).toBe(true)
  })

  it('keeps the saved offer when refresh fails', async () => {
    const result = await refreshPrice(offer, server(502, { ok: false, status: 502, error: 'The store could not be reached. The saved price is unchanged.' }).fetch)
    expect(result).toEqual({ ok: false, message: 'The store could not be reached. The saved price is unchanged.' })
    const network = await refreshPrice(offer, async () => {
      throw new Error('offline')
    })
    expect(network).toEqual({ ok: false, message: 'Couldn’t check the price right now. The saved price is unchanged.' })
    const garbage = await refreshPrice(offer, server(200, { ok: true, price: { amountMinor: -5, currency: 'USD' }, retrievedAt: AT }).fetch)
    expect(garbage.ok).toBe(false)
  })

  it('does not try to refresh sample or unlinked offers', async () => {
    const { fetch, urls } = server(200, {})
    expect(await refreshPrice({ ...offer, isSample: true }, fetch)).toMatchObject({ ok: false })
    const { url: _url, ...unlinked } = offer
    expect(await refreshPrice(unlinked, fetch)).toMatchObject({ ok: false })
    expect(urls).toEqual([])
  })
})
