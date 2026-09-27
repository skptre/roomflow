import { describe, expect, it } from 'vitest'
import { allowedHosts, EgressBlocked, guardedFetch } from './egress'

function recorder(responses: Record<string, Response> = {}) {
  const seen: string[] = []
  const inner = async (url: string) => {
    seen.push(url)
    return responses[url] ?? new Response('{}', { status: 200 })
  }
  return { seen, inner }
}

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } })

describe('allowedHosts', () => {
  it('holds every store (both www forms), the image CDN and Gemini — nothing else', () => {
    const hosts = allowedHosts()
    expect(hosts.has('www.burrow.com')).toBe(true)
    expect(hosts.has('burrow.com')).toBe(true)
    expect(hosts.has('cdn.shopify.com')).toBe(true)
    expect(hosts.has('generativelanguage.googleapis.com')).toBe(true)
    expect(hosts.has('example.com')).toBe(false)
  })
})

describe('guardedFetch', () => {
  it('passes allowed https requests through', async () => {
    const { seen, inner } = recorder()
    const response = await guardedFetch(inner)('https://cdn.shopify.com/s/files/a.jpg?width=512')
    expect(response.status).toBe(200)
    expect(seen).toEqual(['https://cdn.shopify.com/s/files/a.jpg?width=512'])
  })

  it('refuses other hosts, plain http, credentials in the URL and garbage — before sending anything', async () => {
    const { seen, inner } = recorder()
    const fetch = guardedFetch(inner)
    for (const url of ['https://example.com/x', 'http://cdn.shopify.com/a.jpg', 'https://user:pw@cdn.shopify.com/a.jpg', 'https://cdn.shopify.com.evil.io/a', 'not a url', 'http://127.0.0.1:5173/api']) {
      await expect(fetch(url)).rejects.toBeInstanceOf(EgressBlocked)
    }
    expect(seen).toEqual([])
  })

  it('follows redirects only to allowed hosts', async () => {
    const { seen, inner } = recorder({
      'https://www.burrow.com/products/a.js': redirect('https://burrow.com/products/a.js'),
      'https://cdn.shopify.com/leak.jpg': redirect('https://tracker.example/pixel'),
    })
    const fetch = guardedFetch(inner)
    expect((await fetch('https://www.burrow.com/products/a.js')).status).toBe(200)
    expect(seen).toEqual(['https://www.burrow.com/products/a.js', 'https://burrow.com/products/a.js'])
    await expect(fetch('https://cdn.shopify.com/leak.jpg')).rejects.toBeInstanceOf(EgressBlocked)
    expect(seen).not.toContain('https://tracker.example/pixel')
  })

  it('leaves manual redirect handling to callers that ask for it', async () => {
    const { inner } = recorder({ 'https://polyandbark.com/p.js': redirect('https://elsewhere.example/') })
    expect((await guardedFetch(inner)('https://polyandbark.com/p.js', { redirect: 'manual' })).status).toBe(302)
  })
})
