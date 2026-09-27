/**
 * "Refresh price" from the purchase list or a product card. The newer offer
 * replaces the old one in the catalog's offer map (not an undo step), and the
 * result is announced; on failure the saved price stays.
 */
import { catalogStore } from '../catalog/appCatalog'
import { refreshPrice } from '../catalog/refreshPrice'
import { noticeStore } from './noticeStore'

const pending = new Set<string>()

export async function refreshOfferPrice(offerId: string): Promise<void> {
  const offer = catalogStore.getState().offers.get(offerId)
  if (!offer || pending.has(offerId)) return
  pending.add(offerId)
  try {
    const result = await refreshPrice(offer, (url) => fetch(url))
    if (result.ok) catalogStore.getState().updateOffer(result.offer)
    noticeStore.getState().show(result.message, result.ok ? (result.changed ? 'warning' : 'info') : 'danger')
  } finally {
    pending.delete(offerId)
  }
}
