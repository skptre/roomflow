/** Short-lived, one-browser scan handoff. Raw scans stay in memory until claimed or expired. */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { MAX_IMPORT_BYTES, parseRoomPlanJson } from '../src/import/roomplan'

const LIFETIME_MS = 30 * 60_000
const MAX_SESSIONS = 40

type Session = {
  browserToken: string
  uploadToken: string
  expiresAt: number
  scan: string | null
}

function reply(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(body))
}

function token() {
  return randomBytes(24).toString('base64url')
}

function matches(actual: string | undefined, expected: string) {
  if (!actual?.startsWith('Bearer ')) return false
  const left = Buffer.from(actual.slice(7))
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

function isPrivateIPv4(host: string) {
  const parts = host.split('.').map(Number)
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    (parts[0] === 10 || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
      (parts[0] === 192 && parts[1] === 168))
}

function reachableOrigin(req: IncomingMessage): string | null {
  const configured = process.env.ROOMFLOW_PAIR_ORIGIN
  if (configured) {
    try {
      const url = new URL(configured)
      if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isPrivateIPv4(url.hostname))) return null
      return url.origin
    } catch { return null }
  }
  const host = req.headers.host ?? ''
  const [hostname, port] = host.split(':')
  if (isPrivateIPv4(hostname ?? '')) return `http://${host}`
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return null
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal && isPrivateIPv4(address.address))
        return `http://${address.address}${port ? `:${port}` : ''}`
    }
  }
  return null
}

function sameOrigin(req: IncomingMessage): boolean {
  if (!req.headers.origin) return true
  try { return new URL(req.headers.origin).host === req.headers.host }
  catch { return false }
}

async function readScan(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > MAX_IMPORT_BYTES) throw new Error('too-large')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function createPairingApi(now = () => Date.now()) {
  const sessions = new Map<string, Session>()

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path !== '/api/pairings' && !/^\/api\/pairings\/[A-Za-z0-9_-]+$/.test(path)) return false
    for (const [id, session] of sessions) if (session.expiresAt <= now()) sessions.delete(id)

    if (path === '/api/pairings') {
      if (req.method !== 'POST') reply(res, 405, { error: 'Use POST.' })
      else if (!sameOrigin(req))
        reply(res, 403, { error: 'Open pairing from this browser.' })
      else if (sessions.size >= MAX_SESSIONS) reply(res, 429, { error: 'Too many active pairings. Try again shortly.' })
      else {
        const origin = reachableOrigin(req)
        if (!origin) reply(res, 503, { error: 'Open Roomflow over your local network, or configure its HTTPS pairing address.' })
        else {
          const id = token()
          const browserToken = token()
          const uploadToken = token()
          const expiresAt = now() + LIFETIME_MS
          sessions.set(id, { browserToken, uploadToken, expiresAt, scan: null })
          const qr = new URL('roomflow://pair')
          qr.searchParams.set('server', origin)
          qr.searchParams.set('session', id)
          qr.searchParams.set('token', uploadToken)
          reply(res, 201, { id, browserToken, qr: qr.toString(), expiresAt, server: new URL(origin).host })
        }
      }
      return true
    }

    const id = path.slice('/api/pairings/'.length)
    const session = sessions.get(id)
    if (!session) {
      reply(res, 404, { error: 'Pairing expired. Start a new one.' })
      return true
    }
    const browser = matches(req.headers.authorization, session.browserToken)
    const phone = matches(req.headers.authorization, session.uploadToken)
    if (req.method === 'GET' && browser) {
      reply(res, 200, session.scan === null ? { status: 'waiting' } : { status: 'ready', scan: session.scan })
    } else if (req.method === 'PUT' && phone) {
      if (session.scan !== null) reply(res, 409, { error: 'This pairing already received a scan.' })
      else if (req.headers['content-type']?.split(';')[0] !== 'application/json') reply(res, 415, { error: 'Send RoomPlan JSON.' })
      else {
        try {
          const scan = await readScan(req)
          const result = parseRoomPlanJson(scan)
          if (!result.ok) reply(res, 422, { error: 'The scan could not be opened.' })
          else {
            session.scan = scan
            reply(res, 200, { status: 'received' })
          }
        } catch (error) {
          reply(res, error instanceof Error && error.message === 'too-large' ? 413 : 400,
            { error: 'The scan could not be received.' })
        }
      }
    } else if (req.method === 'DELETE' && browser) {
      sessions.delete(id)
      reply(res, 200, { status: 'closed' })
    } else reply(res, 403, { error: 'This pairing link is not valid for that action.' })
    return true
  }
}
