/**
 * Roomflow's server routes, mounted inside the Vite dev and preview servers
 * (no second process). Store requests happen here, never in the browser.
 *   GET /api/offer?store=&handle=&variant=  → current price/availability of one variant
 * Requests are bounded: one in flight per variant, and a per-minute cap so a
 * stuck button can't hammer a store.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { refreshOffer, type OfferRefresh } from '../src/shop/offerRefresh'

const PER_MINUTE = 30

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export function roomflowApi(): Plugin {
  const inFlight = new Map<string, Promise<OfferRefresh>>()
  let windowStart = 0
  let windowCount = 0

  async function handle(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/api/offer') return next()
    if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'Use GET.' })

    const now = Date.now()
    if (now - windowStart > 60_000) {
      windowStart = now
      windowCount = 0
    }
    if (++windowCount > PER_MINUTE) return send(res, 429, { ok: false, error: 'Too many price checks. Try again in a minute.' })

    const request = { store: url.searchParams.get('store') ?? '', handle: url.searchParams.get('handle') ?? '', variant: url.searchParams.get('variant') ?? '' }
    const key = `${request.store}|${request.handle}|${request.variant}`
    let pending = inFlight.get(key)
    if (!pending) {
      pending = refreshOffer(request, { fetch }).finally(() => inFlight.delete(key))
      inFlight.set(key, pending)
    }
    const result = await pending
    send(res, result.ok ? 200 : result.status, result)
  }

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    handle(req, res, next).catch(() => send(res, 500, { ok: false, error: 'Something went wrong checking the price.' }))
  }

  return {
    name: 'roomflow-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
