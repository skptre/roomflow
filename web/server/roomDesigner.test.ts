import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Ledger, type LedgerEvent } from '../src/ai/ledger'
import { createAiContext, type AiContext, type PaidCall, type PaidResult } from './ai'
import { createRoomDesignerHandler, ROOM_DESIGN_SYSTEM_INSTRUCTION, type RoomDesignerDeps } from './roomDesigner'
import type { RoomDesignIntent } from '../src/roomDesigner/contract'
import { sampleCatalog } from '../src/fixtures/sample-catalog'
import { readFileSync } from 'node:fs'
import { parseRoomPlanJson } from '../src/import/roomplan'
import { prepareRoomDesign } from '../src/ui/roomDesignerActions'

const intent = { rearrange: 'none', removeObjectIds: [], replace: [], add: [] }
const sofa = {
  id: 'sofa-1', category: 'sofa',
  dimensions: { width: 2, height: 0.8, depth: 0.9, source: 'captured' },
  pose: { position: { x: 1.25, y: 0, z: 1.5 }, yaw: 0 },
  keep: true, lockPlacement: false, colors: ['#336699'],
}
const request = {
  consent: true,
  brief: 'Make this room calm.',
  baseRevision: 2,
  budget: { amountMinor: 50000, currency: 'USD' },
  roomSummary: {
    id: 'room-1', floorPolygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }],
    floorBounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 3 },
    walls: [], openings: [], finishes: { wall: '#ffffff', floor: '#eeeeee' }, objects: [sofa],
  },
}
const MODEL = 'gemini-3.1-flash-lite'

let server: Server | undefined
async function closeServer() { if (server) await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined }
afterEach(closeServer)

async function listen(deps: RoomDesignerDeps) {
  const handler = createRoomDesignerHandler(deps)
  server = createServer((req, res) => { void handler(req, res) })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing server address')
  const base = `http://127.0.0.1:${address.port}`
  const post = (body: string, headers: Record<string, string> = {}) => fetch(`${base}/api/design-room`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...headers }, body })
  return { base, post }
}

/** Fake shared AI context: records every paid call the handler would make. */
async function setup(result: unknown = { intent }) {
  const call = vi.fn(async (_request: PaidCall): Promise<PaidResult> => ({ ok: true, value: result, usage: { input: 1, output: 1, thoughts: 0 }, micros: 1 }))
  const chooseModel = vi.fn(async () => ({ model: MODEL, reason: 'configured' }))
  const ai = { call, chooseModel } as unknown as AiContext
  return { ...(await listen({ ai: () => ai })), call, chooseModel }
}

const sentPrompt = (call: { mock: { calls: [PaidCall][] } }) => {
  const part = call.mock.calls[0]![0].parts[1]
  return part && 'text' in part ? part.text : ''
}

/** Real ledger-backed context with an in-memory ledger and a fake Gemini transport. */
function realContext(options: { dailyCapMicros?: number; callCapMicros?: number; paidProject?: boolean; answer?: unknown }) {
  const events: LedgerEvent[] = []
  const ledger = new Ledger({ dailyCapMicros: options.dailyCapMicros ?? 2_000_000, callCapMicros: options.callCapMicros ?? 20_000, events: [], persist: (event) => events.push(event) })
  const requests: { url: string; body?: string }[] = []
  const transport = vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined })
    if (url.includes('/models?')) return Response.json({ models: [{ name: `models/${MODEL}`, supportedGenerationMethods: ['generateContent'] }] })
    return Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(options.answer ?? { intent }) }] } }],
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40, thoughtsTokenCount: 0 },
    })
  })
  const ai = createAiContext({ apiKey: 'test-key', ledger, fetch: transport, configuredModel: MODEL, paidProject: options.paidProject ?? true })
  const generated = () => requests.filter((entry) => entry.url.includes(':generateContent'))
  return { ai, events, requests, generated }
}

function fakeExchange(req: Partial<IncomingMessage>) {
  const res = { statusCode: 0, headers: {} as Record<string, string>, body: '', setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value }, end(body: string) { this.body = body } }
  return { req: req as IncomingMessage, res, asResponse: res as unknown as ServerResponse }
}

describe('local room design endpoint: refusals before Gemini', () => {
  it('refuses a non-loopback peer even with a local Host and Origin', async () => {
    const ai = vi.fn()
    const handler = createRoomDesignerHandler({ ai })
    const { req, res, asResponse } = fakeExchange({ method: 'POST', headers: { host: 'localhost:5173', origin: 'http://localhost:5173', 'content-type': 'application/json' }, socket: { remoteAddress: '192.168.1.20' } as IncomingMessage['socket'] })
    await handler(req, asResponse)
    expect(res.statusCode).toBe(403)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(ai).not.toHaveBeenCalled()
  })

  it('refuses non-local hosts, other methods and origins, non-JSON, missing consent, oversize and invalid schemas', async () => {
    const { base, post, call, chooseModel } = await setup()
    expect((await fetch(`${base}/api/design-room`)).status).toBe(405)
    expect((await post(JSON.stringify(request), { Origin: 'https://elsewhere.example' })).status).toBe(403)
    const nonLocalHost = await new Promise<number>((resolve, reject) => {
      const raw = httpRequest(`${base}/api/design-room`, { method: 'POST', headers: { Host: 'elsewhere.example', Origin: base, 'Content-Type': 'application/json' } }, (response) => { response.resume(); resolve(response.statusCode ?? 0) })
      raw.on('error', reject)
      raw.end(JSON.stringify(request))
    })
    expect(nonLocalHost).toBe(403)
    expect((await post(JSON.stringify(request), { 'Content-Type': 'text/plain' })).status).toBe(415)
    expect((await post('{not json')).status).toBe(400)
    expect((await post(JSON.stringify({ ...request, consent: false }))).status).toBe(400)
    const { consent: _consent, ...withoutConsent } = request
    expect((await post(JSON.stringify(withoutConsent))).status).toBe(400)
    expect((await post(JSON.stringify({ ...request, brief: 'x'.repeat(601) }))).status).toBe(400)
    expect((await post(JSON.stringify({ ...request, budget: { amountMinor: 12.5, currency: 'USD' } }))).status).toBe(400)
    const oversize = await post(JSON.stringify({ ...request, brief: 'x'.repeat(33 * 1024) }))
    expect(oversize.status).toBe(413)
    expect(await oversize.json()).toEqual({ error: 'Room design request is too large.' })
    expect(call).not.toHaveBeenCalled()
    expect(chooseModel).not.toHaveBeenCalled()
  })

  it('rejects photos, URLs, raw capture, offer prices and extra coordinates smuggled into the request', async () => {
    const { post, call } = await setup()
    const smuggled = [
      { ...request, photo: 'data:image/jpeg;base64,AAAA' },
      { ...request, raw: { roomplan: { walls: [] } } },
      { ...request, position: { x: 9, y: 0, z: 9 } },
      { ...request, roomSummary: { ...request.roomSummary, source: { sessionId: 'capture' } } },
      { ...request, roomSummary: { ...request.roomSummary, objects: [{ ...sofa, productUrl: 'https://store.example/sofa' }] } },
      { ...request, roomSummary: { ...request.roomSummary, objects: [{ ...sofa, offer: { priceMinor: 99900, currency: 'USD' } }] } },
      { ...request, roomSummary: { ...request.roomSummary, objects: [{ ...sofa, pose: { ...sofa.pose, anchor: { x: 1, z: 1 } } }] } },
    ]
    for (const body of smuggled) expect((await post(JSON.stringify(body))).status).toBe(400)
    expect(call).not.toHaveBeenCalled()
  })

  it('refuses while another design is in flight and after the per-minute limit', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const call = vi.fn(async (): Promise<PaidResult> => { await gate; return { ok: true, value: { intent }, usage: { input: 1, output: 1, thoughts: 0 }, micros: 1 } })
    const ai = { call, chooseModel: async () => ({ model: MODEL, reason: 'configured' }) } as unknown as AiContext
    const { post } = await listen({ ai: () => ai })
    const first = post(JSON.stringify(request))
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1))
    expect((await post(JSON.stringify(request))).status).toBe(429)
    release()
    expect((await first).status).toBe(200)
    for (let i = 1; i < 6; i++) expect((await post(JSON.stringify(request))).status).toBe(200)
    expect((await post(JSON.stringify(request))).status).toBe(429)
    expect(call).toHaveBeenCalledTimes(6)
  })

  it('reports an unconfigured provider without touching it', async () => {
    const { post } = await listen({ ai: () => ({ unavailable: 'GEMINI_API_KEY is not set in web/.env.local' }) })
    const response = await post(JSON.stringify(request))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('GEMINI_API_KEY')
  })
})

describe('local room design endpoint: shared spend ledger', () => {
  it('refuses an exhausted daily cap and an over-limit call before any generation request', async () => {
    for (const caps of [{ dailyCapMicros: 0 }, { callCapMicros: 1 }]) {
      const context = realContext(caps)
      const { post } = await listen({ ai: () => context.ai })
      const response = await post(JSON.stringify(request))
      expect(response.status).toBe(429)
      expect(await response.json()).toEqual({ error: 'The AI spending limit has been reached. Try again later.' })
      expect(context.generated()).toHaveLength(0)
      expect(context.events.map((event) => event.type)).toEqual(['refuse'])
      await closeServer()
    }
  })

  it('refuses to send a private room summary to a project not attested as billing-enabled', async () => {
    const context = realContext({ paidProject: false })
    const { post } = await listen({ ai: () => context.ai })
    const response = await post(JSON.stringify(request))
    expect(response.status).toBe(503)
    expect(context.generated()).toHaveLength(0)
    expect(context.events).toEqual([])
  })

  it('settles a consented room-summary call on the shared ledger and sends no image parts', async () => {
    const context = realContext({})
    const { post } = await listen({ ai: () => context.ai })
    const response = await post(JSON.stringify(request))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ intent })
    expect(context.events.map((event) => event.type)).toEqual(['reserve', 'settle'])
    expect(context.events[0]).toMatchObject({ purpose: 'room-design', inputClass: 'room-summary', model: MODEL })
    const [generation] = context.generated()
    expect(generation!.url.startsWith('https://generativelanguage.googleapis.com/')).toBe(true)
    expect(generation!.body).not.toContain('inlineData')
    expect(generation!.body).not.toContain('test-key')
  })
})

describe('local room design endpoint: prompt and output boundary', () => {
  it('sends only the fixed instruction, the brief, the budget and the validated redacted summary', async () => {
    const { post, call } = await setup()
    const response = await post(JSON.stringify(request))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const paid = call.mock.calls[0]![0]
    expect(paid).toMatchObject({ purpose: 'room-design', inputClass: 'room-summary', consented: true, images: 0 })
    expect(paid.parts).toHaveLength(2)
    expect(paid.parts[0]).toEqual({ text: ROOM_DESIGN_SYSTEM_INSTRUCTION })
    const sent = JSON.parse(sentPrompt(call)) as Record<string, unknown>
    expect(Object.keys(sent).sort()).toEqual(['brief', 'budget', 'roomSummary'])
    expect(sent).toEqual({ brief: request.brief, budget: request.budget, roomSummary: request.roomSummary })
    expect(sentPrompt(call)).not.toMatch(/data:image|https?:\/\/|offer|price|roomplan|baseRevision/i)
  })

  it('with allowKeptChanges, sends the same instruction and a summary with Keep lifted, never the flag itself', async () => {
    const { post, call } = await setup()
    const lockedSofa = { ...sofa, lockPlacement: true }
    const body = { ...request, allowKeptChanges: true, roomSummary: { ...request.roomSummary, objects: [lockedSofa] } }
    expect((await post(JSON.stringify(body))).status).toBe(200)
    const paid = call.mock.calls[0]![0]
    expect(paid.parts[0]).toEqual({ text: ROOM_DESIGN_SYSTEM_INSTRUCTION })
    const sent = JSON.parse(sentPrompt(call)) as { roomSummary: { objects: { keep: boolean; lockPlacement: boolean }[] } }
    expect(Object.keys(sent).sort()).toEqual(['brief', 'budget', 'roomSummary'])
    expect(sent.roomSummary.objects).toEqual([{ ...lockedSofa, keep: false }])
    expect(sentPrompt(call)).not.toMatch(/allowKeptChanges/)
  })

  it('rejects a non-boolean allowKeptChanges before Gemini', async () => {
    const { post, call } = await setup()
    expect((await post(JSON.stringify({ ...request, allowKeptChanges: 'yes' }))).status).toBe(400)
    expect(call).not.toHaveBeenCalled()
  })

  it('omits an absent budget instead of inventing one', async () => {
    const { post, call } = await setup()
    const { budget: _budget, ...withoutBudget } = request
    expect((await post(JSON.stringify(withoutBudget))).status).toBe(200)
    expect(Object.keys(JSON.parse(sentPrompt(call)) as object).sort()).toEqual(['brief', 'roomSummary'])
  })

  it('returns valid intent that targets summary objects', async () => {
    const plan = { palette: { mode: 'darken' }, rearrange: 'gentle', removeObjectIds: [], replace: [{ objectId: 'sofa-1', category: 'sectional', count: 1 }], add: [{ category: 'rug', count: 1 }] }
    const { post } = await setup({ intent: plan })
    const response = await post(JSON.stringify(request))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ intent: plan })
  })

  it('rejects prose, unknown IDs, coordinates and prices in model output without echoing private input', async () => {
    const hostile = [
      { intent, summary: 'Secret room note' },
      { intent: { ...intent, removeObjectIds: ['ghost-9'] } },
      { intent: { ...intent, add: [{ category: 'sofa', count: 1, position: { x: 1, y: 0, z: 1 } }] } },
      { intent: { ...intent, add: [{ category: 'sofa', count: 1, priceMinor: 100 }] } },
      'Sensitive brief',
      null,
    ]
    for (const output of hostile) {
      const { post } = await setup(output)
      const response = await post(JSON.stringify({ ...request, brief: 'Sensitive brief' }))
      expect(response.status).toBe(502)
      const text = await response.text()
      expect(text).not.toMatch(/Sensitive brief|Secret room note|ghost-9|sofa-1/)
      await closeServer()
    }
  })

  it('maps provider failures to fixed errors without upstream detail', async () => {
    const { post, call } = await setup()
    call.mockResolvedValueOnce({ ok: false, charged: 'none', error: 'HTTP 400: Sensitive brief rejected', micros: 0 })
    const response = await post(JSON.stringify({ ...request, brief: 'Sensitive brief' }))
    expect(response.status).toBe(502)
    expect(await response.text()).not.toMatch(/Sensitive brief|HTTP 400/)
  })

  it('sends Gemini a response schema without keywords it does not enforce', async () => {
    const { post, call } = await setup()
    expect((await post(JSON.stringify(request))).status).toBe(200)
    const forbidden = new Set(['oneOf', 'anyOf', 'allOf', 'not', 'const', 'pattern', 'minLength', 'maxLength'])
    const found: string[] = []
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) { node.forEach((item, index) => walk(item, `${path}[${index}]`)); return }
      if (!node || typeof node !== 'object') return
      for (const [key, value] of Object.entries(node)) {
        if (forbidden.has(key)) found.push(`${path}.${key}`)
        walk(value, `${path}.${key}`)
      }
    }
    const paid = call.mock.calls[0]![0]
    walk(paid.schema, '$')
    expect(found).toEqual([])
    const palette = (paid.schema as { properties: { intent: { properties: { palette: { properties: Record<string, unknown> } } } } }).properties.intent.properties.palette
    expect(Object.keys(palette.properties).sort()).toEqual(['color', 'mode'])
    expect(paid.textChars).toBeGreaterThanOrEqual(ROOM_DESIGN_SYSTEM_INSTRUCTION.length + sentPrompt(call).length + JSON.stringify(paid.schema).length)
  })

  it.each([
    { mode: 'set', color: '#000000' },
    { mode: 'set', color: '#000' },
    { mode: 'set', color: '#0A0A0A' },
    { mode: 'darken', color: '#000000' },
  ])('accepts a "turn everything black" palette %o and prepares one restyle', async (palette) => {
    const { post } = await setup({ intent: { ...intent, palette } })
    const budget = { amountMinor: 50000, currency: 'USD' }
    const response = await post(JSON.stringify({ ...request, brief: 'Turn everything black', budget }))
    expect(response.status).toBe(200)
    const body = await response.json() as { intent: RoomDesignIntent }
    const entries = sampleCatalog.map((entry) => ({ ...entry, offer: { ...entry.offer, available: true } }))
    const parsedRoom = parseRoomPlanJson(readFileSync(new URL('../src/fixtures/synthetic-bedroom.roomplan.json', import.meta.url), 'utf8'), { now: '2026-09-26T00:00:00.000Z' })
    if (!parsedRoom.ok) throw new Error(parsedRoom.error)
    const prepared = prepareRoomDesign(body.intent, { room: parsedRoom.room, catalog: entries, budget, baseRevision: 2, sources: { offers: new Map(entries.map((entry) => [entry.offer.id, entry.offer])) } })
    expect(prepared.proposal.commands.map((command) => command.type)).toEqual(['restyle'])
  })

  it('resolves an ID sent to both remove and replace to the replacement', async () => {
    const plan = { ...intent, removeObjectIds: ['sofa-1'], replace: [{ objectId: 'sofa-1', category: 'sectional', count: 1 }] }
    const { post } = await setup({ intent: plan })
    const response = await post(JSON.stringify(request))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ intent: { ...intent, replace: plan.replace } })
  })

  it('never logs request bodies, prompts or model output', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}))
    try {
      const { post, call } = await setup({ intent, summary: 'Secret room note' })
      await post(JSON.stringify({ ...request, brief: 'Sensitive brief' }))
      call.mockRejectedValueOnce(new Error('Sensitive brief'))
      await post(JSON.stringify({ ...request, brief: 'Sensitive brief' }))
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})
