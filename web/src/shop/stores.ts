/**
 * Stores whose public product feeds were verified on 2026-09-26. The harvest
 * reads only these, and the server's offer refresh may only contact these.
 */

export type StoreInfo = {
  domain: string
  name: string
  currency: 'USD'
  /**
   * false when the feed's prices are placeholders, not what a shopper pays
   * (Loloi lists every variant at 99999.00 and sells through retailers).
   * Its offers are then unknown-price, never the placeholder.
   */
  listsPrices: boolean
}

export const STORES: readonly StoreInfo[] = [
  { domain: 'www.burrow.com', name: 'Burrow', currency: 'USD', listsPrices: true },
  { domain: 'polyandbark.com', name: 'Poly & Bark', currency: 'USD', listsPrices: true },
  { domain: 'albanypark.com', name: 'Albany Park', currency: 'USD', listsPrices: true },
  { domain: 'floydhome.com', name: 'Floyd', currency: 'USD', listsPrices: true },
  { domain: 'thuma.co', name: 'Thuma', currency: 'USD', listsPrices: true },
  { domain: 'maidenhome.com', name: 'Maiden Home', currency: 'USD', listsPrices: true },
  { domain: 'sixpenny.com', name: 'Sixpenny', currency: 'USD', listsPrices: true },
  { domain: 'luluandgeorgia.com', name: 'Lulu and Georgia', currency: 'USD', listsPrices: true },
  { domain: 'schoolhouse.com', name: 'Schoolhouse', currency: 'USD', listsPrices: true },
  { domain: 'loloirugs.com', name: 'Loloi', currency: 'USD', listsPrices: false },
  { domain: 'halfpricedrapes.com', name: 'Half Price Drapes', currency: 'USD', listsPrices: true },
  { domain: 'juniperprintshop.com', name: 'Juniper Print Shop', currency: 'USD', listsPrices: true },
  { domain: 'thesill.com', name: 'The Sill', currency: 'USD', listsPrices: true },
  { domain: 'brooklinen.com', name: 'Brooklinen', currency: 'USD', listsPrices: true },
  { domain: 'parachutehome.com', name: 'Parachute', currency: 'USD', listsPrices: true },
  { domain: 'bollandbranch.com', name: 'Boll & Branch', currency: 'USD', listsPrices: true },
  { domain: 'tuftandneedle.com', name: 'Tuft & Needle', currency: 'USD', listsPrices: true },
]

export function storeByDomain(domain: string): StoreInfo | undefined {
  return STORES.find((store) => store.domain === domain)
}
