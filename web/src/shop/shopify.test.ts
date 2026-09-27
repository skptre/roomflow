import { describe, expect, it } from 'vitest'
import fixtures from './__fixtures__/shopify-products.json'
import { harvestStore, ShopifyProduct, type FetchLike } from './shopify'

type Call = { url: string; headers: Record<string, string> }

/** A fake store: page N returns pages[N-1]; entries may be a status code or a thrown error instead. */
function fakeStore(pages: (unknown[] | number | Error)[]) {
  const calls: Call[] = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    const entry = pages.shift() ?? []
    if (entry instanceof Error) throw entry
    if (typeof entry === 'number') return new Response('nope', { status: entry })
    return new Response(JSON.stringify({ products: entry }), { status: 200 })
  }
  const sleeps: number[] = []
  const sleep = async (ms: number) => {
    sleeps.push(ms)
  }
  return { fetch, sleep, calls, sleeps }
}

const sofa = fixtures.burrowSofa
const print = fixtures.artPrint

describe('ShopifyProduct schema', () => {
  it('accepts the committed real feed fixtures', () => {
    for (const [name, product] of Object.entries(fixtures)) {
      expect(ShopifyProduct.safeParse(product).success, name).toBe(true)
    }
  })
})

describe('harvestStore', () => {
  it('pages through the public feed until an empty page', async () => {
    const store = fakeStore([[sofa], [print], []])
    const result = await harvestStore('www.burrow.com', { fetch: store.fetch, sleep: store.sleep })
    expect(result.products.map((p) => p.id)).toEqual([sofa.id, print.id])
    expect(result.errors).toEqual([])
    expect(store.calls.map((c) => c.url)).toEqual([
      'https://www.burrow.com/products.json?limit=250&page=1',
      'https://www.burrow.com/products.json?limit=250&page=2',
      'https://www.burrow.com/products.json?limit=250&page=3',
    ])
    expect(store.calls[0]!.headers['User-Agent']).toMatch(/^Roomflow-hackathon/)
  })

  it('waits between requests to stay polite', async () => {
    const store = fakeStore([[sofa], []])
    await harvestStore('www.burrow.com', { fetch: store.fetch, sleep: store.sleep, delayMs: 1000 })
    expect(store.sleeps).toEqual([1000])
  })

  it('stops at the page cap', async () => {
    const store = fakeStore([[sofa], [sofa], [sofa], [sofa]])
    const result = await harvestStore('www.burrow.com', { fetch: store.fetch, sleep: store.sleep, maxPages: 2 })
    expect(store.calls).toHaveLength(2)
    expect(result.products).toHaveLength(2)
  })

  it('retries a failed request, then continues', async () => {
    const store = fakeStore([503, new Error('socket hang up'), [sofa], []])
    const result = await harvestStore('www.burrow.com', { fetch: store.fetch, sleep: store.sleep, retries: 2 })
    expect(result.products).toHaveLength(1)
    expect(result.errors).toEqual([])
    expect(store.calls).toHaveLength(4)
  })

  it('records an error and keeps what it has when retries run out', async () => {
    const store = fakeStore([[sofa], 403, 403, 403])
    const result = await harvestStore('www.burrow.com', { fetch: store.fetch, sleep: store.sleep, retries: 2 })
    expect(result.products).toHaveLength(1)
    expect(result.errors).toEqual(['page 2: HTTP 403'])
  })

  it('skips a malformed product with an error instead of failing the page', async () => {
    const store = fakeStore([[sofa, { id: 'not-a-number', title: 42 }], []])
    const result = await harvestStore('www.burrow.com', { fetch: store.fetch, sleep: store.sleep })
    expect(result.products).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/^page 1: product 2 invalid/)
  })

  it('rejects a store domain that is not a bare hostname', async () => {
    const store = fakeStore([])
    await expect(harvestStore('evil.com/x?', { fetch: store.fetch, sleep: store.sleep })).rejects.toThrow(/hostname/)
    await expect(harvestStore('127.0.0.1', { fetch: store.fetch, sleep: store.sleep })).rejects.toThrow(/hostname/)
    expect(store.calls).toHaveLength(0)
  })
})
