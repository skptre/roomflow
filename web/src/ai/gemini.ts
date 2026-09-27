/**
 * Minimal Gemini REST client (server/scripts only — the key never reaches the
 * browser). Model choice follows plan D9: the configured model if the key can
 * reach it, else the cheapest reachable flash-lite with a known price. Output
 * is schema-constrained JSON; callers still validate it. Every result says
 * whether the call may have been billed, so the ledger can settle honestly.
 */
import { costMicros, rateFor, type Rate, type Usage } from './rates'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

const API = 'https://generativelanguage.googleapis.com/v1beta'

export async function listModels(options: { fetch: FetchLike; apiKey: string; timeoutMs?: number }): Promise<string[]> {
  const response = await options.fetch(`${API}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': options.apiKey },
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
  })
  if (!response.ok) throw new Error(`listing models: HTTP ${response.status}`)
  const body = (await response.json()) as { models?: { name?: unknown; supportedGenerationMethods?: unknown }[] }
  return (body.models ?? [])
    .filter((m) => typeof m.name === 'string' && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => (m.name as string).replace(/^models\//, ''))
}

export function pickModel(available: readonly string[], configured: string | undefined, at: Date): { model: string; reason: 'configured' | 'cheapest-flash-lite' } | null {
  if (configured && available.includes(configured)) return { model: configured, reason: 'configured' }
  const priced = available
    .filter((model) => /flash-lite/.test(model) && !/tts|image|preview/.test(model))
    .map((model) => ({ model, rate: rateFor(model, at) }))
    .filter((entry): entry is { model: string; rate: Rate } => !!entry.rate)
    .sort((a, b) => a.rate.inputNanosPerToken + a.rate.outputNanosPerToken - (b.rate.inputNanosPerToken + b.rate.outputNanosPerToken))
  return priced[0] ? { model: priced[0].model, reason: 'cheapest-flash-lite' } : null
}

/** Upper bound on one image's input tokens (the provider's highest per-image resolution). */
const IMAGE_TOKENS_MAX = 1120
const PROMPT_OVERHEAD_TOKENS = 200

/** A call's worst-case cost: text at ≥2 characters per token, every image at full resolution, the whole output limit spent. */
export function worstCaseMicros(rate: Rate, request: { textChars: number; images: number; maxOutputTokens: number }): number {
  const input = Math.ceil(request.textChars / 2) + request.images * IMAGE_TOKENS_MAX + PROMPT_OVERHEAD_TOKENS
  return costMicros(rate, { input, output: request.maxOutputTokens, thoughts: 0 })
}

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

export type GenerateRequest = {
  fetch: FetchLike
  apiKey: string
  model: string
  parts: Part[]
  schema: object
  /** Includes thinking tokens. */
  maxOutputTokens: number
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'
  mediaResolution?: 'MEDIA_RESOLUTION_LOW' | 'MEDIA_RESOLUTION_MEDIUM' | 'MEDIA_RESOLUTION_HIGH'
  timeoutMs: number
}

/** `usageIncomplete`: the provider didn't report input tokens; bill the reservation, never zero. */
export type GenerateResult =
  | { ok: true; value: unknown; usage: Usage; usageIncomplete?: true }
  | { ok: false; charged: 'none' | 'unknown'; error: string }
  | { ok: false; charged: 'billed'; usage: Usage; usageIncomplete?: true; error: string }

type ApiResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
    promptTokensDetails?: { tokenCount?: number }[]
  }
  error?: { message?: string }
}

export async function generateJson(request: GenerateRequest): Promise<GenerateResult> {
  const body = {
    contents: [{ role: 'user', parts: request.parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: request.schema,
      maxOutputTokens: request.maxOutputTokens,
      ...(request.thinkingLevel ? { thinkingConfig: { thinkingLevel: request.thinkingLevel } } : {}),
      ...(request.mediaResolution ? { mediaResolution: request.mediaResolution } : {}),
    },
  }
  let response: Response
  let payload: ApiResponse
  try {
    response = await request.fetch(`${API}/models/${encodeURIComponent(request.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': request.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(request.timeoutMs),
    })
    payload = (await response.json()) as ApiResponse
  } catch (error) {
    return { ok: false, charged: 'unknown', error: error instanceof Error ? error.message : String(error) }
  }
  if (!response.ok) {
    // The provider rejected or failed the request; it bills generated tokens only.
    return { ok: false, charged: 'none', error: `HTTP ${response.status}: ${payload.error?.message ?? 'no message'}` }
  }
  const meta = payload.usageMetadata ?? {}
  const input = meta.promptTokenCount ?? meta.promptTokensDetails?.reduce((sum, d) => sum + (d.tokenCount ?? 0), 0)
  const usage: Usage = { input: input ?? 0, output: meta.candidatesTokenCount ?? 0, thoughts: meta.thoughtsTokenCount ?? 0 }
  const incomplete = input === undefined ? ({ usageIncomplete: true } as const) : {}
  const candidate = payload.candidates?.[0]
  if (candidate?.finishReason !== 'STOP') return { ok: false, charged: 'billed', usage, ...incomplete, error: `answer stopped: ${candidate?.finishReason ?? 'no candidate'}` }
  const text = (candidate.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
  try {
    return { ok: true, value: JSON.parse(text) as unknown, usage, ...incomplete }
  } catch {
    return { ok: false, charged: 'billed', usage, ...incomplete, error: 'answer was not JSON' }
  }
}
