/**
 * Server-side AI context: settings from web/.env.local (never VITE_-prefixed,
 * never sent to the browser), the file-backed spending ledger, and one
 * `callGemini` that every paid request goes through — price check, cap
 * reservation, call, settle. Used by scripts now and by /api routes later.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { generateJson, listModels, pickModel, worstCaseMicros, type FetchLike, type GenerateRequest, type GenerateResult } from '../src/ai/gemini'
import { Ledger, parseLedgerLines, usdToMicros, type InputClass } from '../src/ai/ledger'
import { costMicros, rateFor } from '../src/ai/rates'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = join(webRoot, '.data')

export type AiContext = {
  apiKey: string
  ledger: Ledger
  fetch: FetchLike
  /** Resolve the model to use (configured, else cheapest priced flash-lite), checked against what the key can reach. */
  chooseModel(override?: string): Promise<{ model: string; reason: string }>
  call(request: PaidCall): Promise<PaidResult>
}

export type PaidCall = Omit<GenerateRequest, 'fetch' | 'apiKey'> & { purpose: string; inputClass: InputClass; textChars: number; images: number }
export type PaidResult = (GenerateResult & { callId?: string; micros: number }) | { ok: false; refused: string; micros: 0 }

/** Settings and ledger; null (with the reason) when AI isn't configured — callers fall back to free tiers. */
export function openAi(options: { mode?: string; fetch?: FetchLike } = {}): AiContext | { unavailable: string } {
  const env = loadEnv(options.mode ?? 'development', webRoot, '')
  const apiKey = env.GEMINI_API_KEY?.trim()
  if (!apiKey) return { unavailable: 'GEMINI_API_KEY is not set in web/.env.local' }
  const dailyCapMicros = usdToMicros(env.AI_DAILY_CAP_USD || '2.00')
  const callCapMicros = usdToMicros(env.AI_CALL_CAP_USD || '0.02')
  if (dailyCapMicros === null || callCapMicros === null) return { unavailable: 'AI_DAILY_CAP_USD / AI_CALL_CAP_USD must be plain USD amounts' }

  mkdirSync(DATA_DIR, { recursive: true })
  const file = join(DATA_DIR, 'ledger.jsonl')
  const events = existsSync(file) ? parseLedgerLines(readFileSync(file, 'utf8')) : []
  const ledger = new Ledger({ dailyCapMicros, callCapMicros, events, persist: (event) => appendFileSync(file, `${JSON.stringify(event)}\n`) })
  const fetchImpl = options.fetch ?? fetch
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
      const rate = rateFor(request.model, new Date())
      const worst = rate ? worstCaseMicros(rate, { textChars: request.textChars, images: request.images, maxOutputTokens: request.maxOutputTokens }) : null
      const reserved = ledger.reserve({ purpose: request.purpose, model: request.model, inputClass: request.inputClass, worstCaseMicros: worst })
      if (!reserved.ok) return { ok: false, refused: reserved.reason, micros: 0 }
      const { purpose: _purpose, inputClass: _inputClass, textChars: _textChars, images: _images, ...generate } = request
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
