/**
 * Store price parsing. Shopify's `.json` feeds send prices as decimal strings
 * ("4497.00"); its `.js` endpoint sends integer cents. Both become integer
 * minor units with string/integer math only — never floats. Anything that
 * does not parse cleanly is unknown (null), never zero. Two-decimal
 * currencies only (every harvested store prices in USD).
 */
import type { Money } from '../domain/schema'

const CURRENCY = /^[A-Z]{3}$/
/** Whole part with optional well-formed thousands groups, then up to two decimals. */
const DECIMAL = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/

export function moneyFromDecimalString(text: string, currency: string): Money | null {
  if (!CURRENCY.test(currency)) return null
  const match = DECIMAL.exec(text.trim())
  if (!match) return null
  const whole = match[1]!.replaceAll(',', '')
  const fraction = (match[2] ?? '').padEnd(2, '0')
  const amountMinor = Number(whole) * 100 + Number(fraction)
  return Number.isSafeInteger(amountMinor) ? { amountMinor, currency } : null
}

export function moneyFromCents(cents: unknown, currency: string): Money | null {
  if (!CURRENCY.test(currency)) return null
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0) return null
  return { amountMinor: cents, currency }
}
