/**
 * Versioned rate card for the AI calls we make (plan D12). Prices are copied
 * from the provider's public pricing page on the date in `version`; a model
 * not on the card, or used past a listed price's end date, has no known price
 * and is refused before dispatch rather than billed at a guess.
 *
 * Integer accounting: $X per million tokens = X µ$ per token = 1000·X n$ per
 * token, so every rate below is a whole number of nano-dollars per token.
 */

export type Rate = { inputNanosPerToken: number; outputNanosPerToken: number }
export type Usage = { input: number; output: number; thoughts: number }

type Listed = Rate & { from?: string; until?: string }

export const RATE_CARD = {
  version: '2026-09-26',
  source: 'https://ai.google.dev/gemini-api/docs/pricing',
  note: 'Paid tier, standard (not batch), text/image input. Thinking tokens are billed as output.',
  models: {
    // $0.75 / $3.75 through 2026-12-31; the page lists $1.50 / $7.50 from 2027-01-01 (not added until re-read).
    'gemini-3.8-flash': [{ inputNanosPerToken: 750, outputNanosPerToken: 3750, until: '2026-12-31T23:59:59.999Z' }],
    'gemini-3.5-flash-lite': [{ inputNanosPerToken: 300, outputNanosPerToken: 2500 }],
    'gemini-3.1-flash-lite': [{ inputNanosPerToken: 250, outputNanosPerToken: 1500 }],
    'gemini-3.5-flash': [{ inputNanosPerToken: 1500, outputNanosPerToken: 9000 }],
  } as Readonly<Record<string, readonly Listed[]>>,
}

/** The listed price of a model at a moment, or undefined when we don't know it. */
export function rateFor(model: string, at: Date): Rate | undefined {
  const listed = Object.hasOwn(RATE_CARD.models, model) ? RATE_CARD.models[model] : undefined
  const time = at.getTime()
  const entry = listed?.find((r) => (!r.from || Date.parse(r.from) <= time) && (!r.until || time <= Date.parse(r.until)))
  return entry ? { inputNanosPerToken: entry.inputNanosPerToken, outputNanosPerToken: entry.outputNanosPerToken } : undefined
}

/** Cost of one call in whole micro-dollars, rounded up. */
export function costMicros(rate: Rate, usage: Usage): number {
  const nanos = usage.input * rate.inputNanosPerToken + (usage.output + usage.thoughts) * rate.outputNanosPerToken
  return Math.ceil(nanos / 1000)
}
