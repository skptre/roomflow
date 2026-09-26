import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { recognitionPlugin } from './recognitionPlugin'
import { recognize } from './recognition'
vi.mock('./recognition', async (original) => ({ ...await original<typeof import('./recognition')>(), recognize: vi.fn(async () => ({ appearance: { template: 'unsupported' } })) }))

let server: ViteDevServer
let base: string
beforeAll(async () => {
  server = await createServer({ configFile: false, plugins: [recognitionPlugin({ key: 'private-test-key', paid: true, model: 'gemini-3.1-flash-lite' })], server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  const address = server.httpServer!.address()
  if (!address || typeof address === 'string') throw new Error('Missing local test address')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => { await server?.close() })
describe('local recognition endpoint', () => {
  it('reports readiness without disclosing the key', async () => {
    const response = await fetch(`${base}/api/recognize/status`)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ ready: true, model: 'gemini-3.1-flash-lite' })
  })
  it('rejects cross-origin calls before the provider is invoked', async () => {
    const response = await fetch(`${base}/api/recognize`, { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' })
    expect(response.status).toBe(403)
    expect(recognize).not.toHaveBeenCalled()
  })
  it('accepts same-origin JSON and enforces the request limit', async () => {
    for (let i = 0; i < 7; i++) {
      const response = await fetch(`${base}/api/recognize`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' })
      expect(response.status).toBe(i === 6 ? 429 : 200)
    }
    expect(recognize).toHaveBeenCalledTimes(6)
  })
})
