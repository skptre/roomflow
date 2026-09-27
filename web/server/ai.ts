/**
 * Server-side AI context: settings from web/.env.local (never VITE_-prefixed,
 * never sent to the browser), the file-backed spending ledger, and one
 * `callGemini` that every paid request goes through — price check, cap
 * reservation, call, settle. Used by scripts now and by /api routes later.
 *
 * Responsible-use rules enforced here:
 *   - every request leaves through the egress allowlist (stores, Shopify CDN, Gemini),
 *   - the ledger file is shared: each process re-reads it before reserving, so the
 *     app and scripts count against one daily cap,
 *   - a private photo (`user-photo`) is never sent without the user's consent for that call.
 */
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { guardedFetch } from '../src/ai/egress'
import { generateJson, listModels, pickModel, worstCaseMicros, type FetchLike, type GenerateRequest, type GenerateResult } from '../src/ai/gemini'
import { Ledger, parseLedgerLines, usdToMicros, type InputClass } from '../src/ai/ledger'
import { costMicros, rateFor } from '../src/ai/rates'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = join(webRoot, '.data')
const LEDGER_FILE = join(DATA_DIR, 'ledger.jsonl')

export type AiContext = {
  apiKey: string
  ledger: Ledger
  fetch: FetchLike
  /** Resolve the model to use (configured, else cheapest priced flash-lite), checked against what the key can reach. */
  chooseModel(override?: string): Promise<{ model: string; reason: string }>
  call(request: PaidCall): Promise<PaidResult>
}

/** `consented`: the user approved sending this private input for this call (required for `user-photo`). */
export type PaidCall = Omit<GenerateRequest, 'fetch' | 'apiKey'> & { purpose: string; inputClass: InputClass; textChars: number; images: number; consented?: boolean }
export type PaidResult = (GenerateResult & { callId?: string; micros: number }) | { ok: false; refused: string; micros: 0 }

// ---------- the shared ledger file ----------

type Caps = { dailyCapMicros: number; callCapMicros: number }

function readCaps(env: Record<string, string>): Caps | null {
  const dailyCapMicros = usdToMicros(env.AI_DAILY_CAP_USD || '2.00')
  const callCapMicros = usdToMicros(env.AI_CALL_CAP_USD || '0.02')
  return dailyCapMicros === null || callCapMicros === null ? null : { dailyCapMicros, callCapMicros }
}

/** The ledger plus `sync()`, which applies lines other processes appended since the last read. */
function openLedger(caps: Caps): { ledger: Ledger; sync: () => void } {
  mkdirSync(DATA_DIR, { recursive: true })
  const ledger = new Ledger({ ...caps, events: [], persist: (event) => appendFileSync(LEDGER_FILE, `${JSON.stringify(event)}\n`) })
  let offset = 0
  const sync = () => {
    if (!existsSync(LEDGER_FILE)) return
    const fd = openSync(LEDGER_FILE, 'r')
    try {
      const size = fstatSync(fd).size
      if (size <= offset) return
      const buffer = Buffer.alloc(size - offset)
      readSync(fd, buffer, 0, buffer.length, offset)
      // Only whole lines: a line still being written is read next time.
      const end = buffer.lastIndexOf(0x0a)
      if (end < 0) return
      ledger.ingest(parseLedgerLines(buffer.subarray(0, end + 1).toString('utf8')))
      offset += end + 1
    } finally {
      closeSync(fd)
    }
  }
  sync()
  return { ledger, sync }
}

// ---------- paid calls ----------

/** Settings and ledger; null (with the reason) when AI isn't available — callers fall back to free tiers. */
export function openAi(options: { mode?: string; fetch?: FetchLike } = {}): AiContext | { unavailable: string } {
  const env = loadEnv(options.mode ?? 'development', webRoot, '')
  const apiKey = env.GEMINI_API_KEY?.trim()
  if (!apiKey) return { unavailable: 'GEMINI_API_KEY is not set in web/.env.local' }
  const caps = readCaps(env)
  if (!caps) return { unavailable: 'AI_DAILY_CAP_USD / AI_CALL_CAP_USD must be plain USD amounts' }

  const { ledger, sync } = openLedger(caps)
  const fetchImpl = guardedFetch(options.fetch ?? fetch)
  let models: Promise<string[]> | null = null

  return {
    apiKey,
    ledger,
    fetch: fetchImpl,
    async chooseModel(override) {
      models ??= listModels({ fetch: fetchImpl, apiKey })
      const picked = pickModel(await models, override ?? env.GEMINI_MODEL?.trim(), new Date())
      if (!picked) throw new Error('no reachable Gemini model has a known price (see src/ai/rates.ts)')
      if (override && picked.model !== override) throw new Error(`model ${override} is not reachable with this key`)
      return picked
    },
    async call(request) {
      if (request.inputClass === 'user-photo' && request.consented !== true) return { ok: false, refused: 'no-consent', micros: 0 }
      const rate = rateFor(request.model, new Date())
      const worst = rate ? worstCaseMicros(rate, { textChars: request.textChars, images: request.images, maxOutputTokens: request.maxOutputTokens }) : null
      sync()
      const reserved = ledger.reserve({ purpose: request.purpose, model: request.model, inputClass: request.inputClass, worstCaseMicros: worst })
      if (!reserved.ok) return { ok: false, refused: reserved.reason, micros: 0 }
      const { purpose: _purpose, inputClass: _inputClass, textChars: _textChars, images: _images, consented: _consented, ...generate } = request
      const result = await generateJson({ ...generate, fetch: fetchImpl, apiKey })
      if (result.ok || result.charged === 'billed') {
        const micros = result.usageIncomplete ? worst! : costMicros(rate!, result.usage)
        ledger.settle(reserved.id, micros, result.usage)
        return { ...result, callId: reserved.id, micros }
      }
      ledger.fail(reserved.id, result.charged)
      return { ...result, callId: reserved.id, micros: result.charged === 'unknown' ? worst! : 0 }
    },
  }
}
