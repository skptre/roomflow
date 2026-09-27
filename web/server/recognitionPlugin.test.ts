import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { recognitionPlugin } from './recognitionPlugin'
import { recognize } from './recognition'
vi.mock('./recognition', async (original) => ({ ...await original<typeof import('./recognition')>(), recognize: vi.fn(async () => ({ appearance: { template: 'unsupported' } })) }))

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let server: Server
let base: string
beforeAll(async () => {
  // The plugin's middleware on a plain local HTTP server: the same request handling as in Vite,
  // without booting a whole dev server (its startup work made this test time out under load).
  const middlewares: Middleware[] = []
  const plugin = recognitionPlugin({ key: 'private-test-key', paid: true, model: 'gemini-3.1-flash-lite' })
  const configure = plugin.configureServer as (server: { middlewares: { use: (fn: Middleware) => void } }) => void
  configure({ middlewares: { use: (fn) => middlewares.push(fn) } })
  server = createServer((req, res) => middlewares[0]!(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local test address')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => { await new Promise((resolve) => server?.close(resolve)) })
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
