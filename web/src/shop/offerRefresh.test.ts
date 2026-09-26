import { describe, expect, it } from 'vitest'
import { refreshOffer } from './offerRefresh'
import type { FetchLike } from './shopify'

const NOW = () => new Date('2026-09-27T01:00:00.000Z')

function fakeFetch(routes: Record<string, { status?: number; body?: unknown; location?: string }>) {
  const calls: { url: string; redirect?: RequestRedirect }[] = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, redirect: init?.redirect })
    const route = routes[url]
    if (!route) return new Response('not found', { status: 404 })
    if (route.location) return new Response(null, { status: route.status ?? 301, headers: { Location: route.location } })
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200 })
  }
  return { fetch, calls }
}

const JS = 'https://www.burrow.com/products/nomad-king-sofa.js'
const JSON_URL = 'https://www.burrow.com/products/nomad-king-sofa.json'

describe('refreshOffer', () => {
  it('reads integer cents and availability from the product .js endpoint', async () => {
    const { fetch, calls } = fakeFetch({
      [JS]: { body: { variants: [{ id: 111, price: 99900, available: true }, { id: 222, price: 5000, available: false }] } },
    })
    const result = await refreshOffer({ store: 'www.burrow.com', handle: 'nomad-king-sofa', variant: '111' }, { fetch, now: NOW })
    expect(result).toEqual({ ok: true, price: { amountMinor: 99900, currency: 'USD' }, available: true, retrievedAt: '2026-09-27T01:00:00.000Z' })
    expect(calls).toEqual([{ url: JS, redirect: 'manual' }])
  })

  it("follows the store's own www redirect", async () => {
    const bare = 'https://burrow.com/products/nomad-king-sofa.js'
    const { fetch, calls } = fakeFetch({
      [JS]: { location: bare },
      [bare]: { body: { variants: [{ id: 111, price: 99900, available: true }] } },
    })
    const result = await refreshOffer({ store: 'www.burrow.com', handle: 'nomad-king-sofa', variant: '111' }, { fetch, now: NOW })
    expect(result).toMatchObject({ ok: true, price: { amountMinor: 99900, currency: 'USD' } })
    expect(calls.map((c) => c.url)).toEqual([JS, bare])
  })

  it('falls back to the .json endpoint (decimal string, availability unknown)', async () => {
    const { fetch } = fakeFetch({
      [JS]: { status: 500 },
      [JSON_URL]: { body: { product: { variants: [{ id: 111, price: '1,099.00' }] } } },
    })
    const result = await refreshOffer({ store: 'www.burrow.com', handle: 'nomad-king-sofa', variant: '111' }, { fetch, now: NOW })
    expect(result).toEqual({ ok: true, price: { amountMinor: 109900, currency: 'USD' }, retrievedAt: '2026-09-27T01:00:00.000Z' })
  })

  it('reports a variant the store no longer lists', async () => {
    const { fetch } = fakeFetch({ [JS]: { body: { variants: [{ id: 999, price: 100, available: true }] } } })
    const result = await refreshOffer({ store: 'www.burrow.com', handle: 'nomad-king-sofa', variant: '111' }, { fetch, now: NOW })
    expect(result).toEqual({ ok: false, status: 404, error: 'This option is no longer listed by the store.' })
  })

  it('keeps a placeholder-price store unknown', async () => {
    const { fetch } = fakeFetch({ ['https://loloirugs.com/products/vlr-01.js']: { body: { variants: [{ id: 5, price: 9999900, available: true }] } } })
    const result = await refreshOffer({ store: 'loloirugs.com', handle: 'vlr-01', variant: '5' }, { fetch, now: NOW })
    expect(result).toMatchObject({ ok: true, price: null, available: true })
  })

  it('treats a 0 price as unknown', async () => {
    const { fetch } = fakeFetch({ [JS]: { body: { variants: [{ id: 111, price: 0, available: true }] } } })
    const result = await refreshOffer({ store: 'www.burrow.com', handle: 'nomad-king-sofa', variant: '111' }, { fetch, now: NOW })
    expect(result).toMatchObject({ ok: true, price: null })
  })

  it('refuses any host outside the harvested stores, and malformed input, without a request', async () => {
    const { fetch, calls } = fakeFetch({})
    for (const input of [
      { store: 'example.com', handle: 'x', variant: '1' },
      { store: '169.254.169.254', handle: 'x', variant: '1' },
      { store: 'www.burrow.com', handle: '../admin', variant: '1' },
      { store: 'www.burrow.com', handle: 'x?y=1', variant: '1' },
      { store: 'www.burrow.com', handle: 'x', variant: '1; drop' },
    ]) {
      const result = await refreshOffer(input, { fetch, now: NOW })
      expect(result.ok, JSON.stringify(input)).toBe(false)
      expect(result).toMatchObject({ status: 400 })
    }
    expect(calls).toEqual([])
  })

  it('never follows a redirect to another host', async () => {
    const evil = 'http://169.254.169.254/latest/meta-data'
    const { fetch, calls } = fakeFetch({ [JS]: { location: evil }, [JSON_URL]: { location: evil } })
    const result = await refreshOffer({ store: 'www.burrow.com', handle: 'nomad-king-sofa', variant: '111' }, { fetch, now: NOW })
    expect(result).toEqual({ ok: false, status: 502, error: 'The store could not be reached. The saved price is unchanged.' })
    expect(calls.map((c) => c.url)).not.toContain(evil)
  })
})
