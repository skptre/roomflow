import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { DEFAULT_MODEL, RATES, recognize, RecognitionError, type RecognitionConfig } from './recognition.ts'
import { isLocalBrowserRequest, isLocalPeerRequest } from './localAccess.ts'

/** Local development adapter. Do not expose this unauthenticated endpoint on a public host. */
export function recognitionPlugin(config: RecognitionConfig): Plugin {
  let busy = false
  let count = 0
  let windowStart = 0
  let windowCount = 0
  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.url !== '/api/recognize' && req.url !== '/api/recognize/status') return next()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'application/json')
    const send = (status: number, value: unknown) => { res.statusCode = status; res.end(JSON.stringify(value)) }
    if (!isLocalPeerRequest(req)) return send(403, { error: 'Photo recognition is available on this computer only.' })
    if (req.method === 'GET' && req.url.endsWith('/status')) return send(200, { ready: Boolean(config.key && config.paid && Object.hasOwn(RATES, config.model)), model: config.model || DEFAULT_MODEL })
    if (req.method !== 'POST' || req.url !== '/api/recognize') return send(405, { error: 'Method not allowed.' })
    if (!isLocalBrowserRequest(req) || !req.headers['content-type']?.startsWith('application/json')) return send(403, { error: 'Use the Roomflow photo review screen.' })
    if (busy) return send(429, { error: 'Another photo is being analyzed. Please wait.' })
    if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); windowCount = 0 }
    if (windowCount >= 6 || count >= 100) return send(429, { error: 'The local recognition request limit has been reached.' })
    busy = true
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        const data = Buffer.from(chunk)
        size += data.length
        if (size > 2_010_000) throw new RecognitionError('That photo is too large.', 413)
        chunks.push(data)
      }
      let input: unknown
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new RecognitionError('Invalid photo request.') }
      count++; windowCount++
      const result = await recognize(input, config)
      send(200, result)
    } catch (error) {
      // Never log or echo photos, prompts, upstream bodies or credentials.
      send(error instanceof RecognitionError ? error.status : 500, { error: error instanceof RecognitionError ? error.message : 'Recognition failed. Your room is unchanged.' })
    } finally { busy = false }
  }
  return {
    name: 'roomflow-local-recognition',
    configureServer(server) { server.middlewares.use((req, res, next) => { void handler(req, res, next) }) },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void handler(req, res, next) }) },
  }
}
