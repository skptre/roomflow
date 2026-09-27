import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPairingApi } from './pairing'

const scan = readFileSync(new URL('../src/fixtures/synthetic-bedroom.roomplan.json', import.meta.url), 'utf8')
let server: Server
let base: string
let now = 1_000_000

beforeEach(async () => {
  now = 1_000_000
  const api = createPairingApi(() => now)
  server = createServer((req, res) => { void api(req, res).then((handled) => { if (!handled) { res.statusCode = 404; res.end() } }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  base = `http://127.0.0.1:${address.port}`
  vi.stubEnv('ROOMFLOW_PAIR_ORIGIN', 'https://roomflow.example')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function create() {
  const response = await fetch(`${base}/api/pairings`, { method: 'POST', headers: { Origin: base } })
  expect(response.status).toBe(201)
  return response.json() as Promise<{ id: string; browserToken: string; qr: string; expiresAt: number }>
}

describe('scan pairing', () => {
  it('accepts one valid scan for the paired browser and never exposes it to an unpaired client', async () => {
    const pairing = await create()
    const code = new URL(pairing.qr)
    const uploadToken = code.searchParams.get('token')!
    expect(code.searchParams.get('server')).toBe('https://roomflow.example')

    const forbidden = await fetch(`${base}/api/pairings/${pairing.id}`)
    expect(forbidden.status).toBe(403)
    const waiting = await fetch(`${base}/api/pairings/${pairing.id}`, {
      headers: { Authorization: `Bearer ${pairing.browserToken}` },
    })
    expect(await waiting.json()).toEqual({ status: 'waiting' })

    const upload = await fetch(`${base}/api/pairings/${pairing.id}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${uploadToken}`, 'Content-Type': 'application/json' }, body: scan,
    })
    expect(upload.status).toBe(200)
    const received = await fetch(`${base}/api/pairings/${pairing.id}`, {
      headers: { Authorization: `Bearer ${pairing.browserToken}` },
    })
    expect(await received.json()).toEqual({ status: 'ready', scan })
    const duplicate = await fetch(`${base}/api/pairings/${pairing.id}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${uploadToken}`, 'Content-Type': 'application/json' }, body: scan,
    })
    expect(duplicate.status).toBe(409)
    const close = await fetch(`${base}/api/pairings/${pairing.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${pairing.browserToken}` },
    })
    expect(close.status).toBe(200)
    expect((await fetch(`${base}/api/pairings/${pairing.id}`)).status).toBe(404)
  })

  it('rejects malformed scans and expires unused codes', async () => {
    const pairing = await create()
    const uploadToken = new URL(pairing.qr).searchParams.get('token')!
    const invalid = await fetch(`${base}/api/pairings/${pairing.id}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${uploadToken}`, 'Content-Type': 'application/json' }, body: '{}',
    })
    expect(invalid.status).toBe(422)
    now = pairing.expiresAt
    const expired = await fetch(`${base}/api/pairings/${pairing.id}`, {
      headers: { Authorization: `Bearer ${pairing.browserToken}` },
    })
    expect(expired.status).toBe(404)
  })
})
