/**
 * The one way out (plan D11): every request our server or scripts send goes
 * through `guardedFetch`, which only reaches the stores we read, Shopify's
 * image CDN, and the Gemini API — over https, following redirects only to those
 * same hosts. Anything else is refused before a byte is sent.
 */
import { STORES } from '../shop/stores'
import type { FetchLike } from './gemini'

const FIXED_HOSTS = ['cdn.shopify.com', 'generativelanguage.googleapis.com']
const MAX_REDIRECTS = 3

/** Store hosts (with and without www, since stores redirect between them), the image CDN and Gemini. */
export function allowedHosts(): ReadonlySet<string> {
  const hosts = new Set(FIXED_HOSTS)
  for (const store of STORES) {
    const bare = store.domain.replace(/^www\./, '')
    hosts.add(bare)
    hosts.add(`www.${bare}`)
  }
  return hosts
}

export class EgressBlocked extends Error {
  constructor(url: string) {
    let host = 'an invalid address'
    try {
      host = new URL(url).host
    } catch {
      // keep the placeholder
    }
    super(`Outbound request to ${host} blocked: not an allowed destination`)
    this.name = 'EgressBlocked'
  }
}

function allowed(url: string, hosts: ReadonlySet<string>): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && hosts.has(parsed.hostname)
  } catch {
    return false
  }
}

/**
 * A fetch that refuses any destination outside `hosts`. Redirects are followed
 * by hand, and only to allowed hosts; a caller that handles redirects itself
 * (redirect: 'manual') gets the 3xx response as before.
 */
export function guardedFetch(inner: FetchLike, hosts: ReadonlySet<string> = allowedHosts()): FetchLike {
  return async (url, init = {}) => {
    if (!allowed(url, hosts)) throw new EgressBlocked(url)
    if (init.redirect === 'manual' || init.redirect === 'error') return inner(url, init)
    let next = url
    for (let hop = 0; ; hop++) {
      const response = await inner(next, { ...init, redirect: 'manual' })
      const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
      if (!location) return response
      if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects from ${new URL(url).host}`)
      next = new URL(location, next).toString()
      if (!allowed(next, hosts)) throw new EgressBlocked(next)
    }
  }
}
