import { RoomObject, type Room, type Money } from '../domain/schema'
import { freeSpot, surfaceSpot } from '../domain/layout'
import { appearanceAsset } from './appearanceAsset'
import type { Appearance } from './contract'

/** User supplied facts; photos never establish absolute dimensions or price. */
export interface DiscoveryDetails {
  name: string; width: string; height: string; depth: string; unit: 'cm' | 'in'; estimated: boolean
  price: string; currency: string; store: string; owned: boolean
}
/** Parse supported two-decimal currencies without accepting fractional cents. */
export function discoveryPrice(value: string, currency: string): Money | null {
  if (!['USD', 'EUR', 'GBP'].includes(currency)) throw new Error('Choose a supported currency.')
  if (!value.trim()) return null
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a price with at most two decimal places, or leave it blank.')
  const [whole, fraction = ''] = value.trim().split('.')
  const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amountMinor) || amountMinor > 100_000_000) throw new Error('Enter a price of 1,000,000 or less, or leave it unknown.')
  return { amountMinor, currency }
}
/** Build one approximate discovery in a free spot, without changing existing furniture. */
export function discoveryObject(room: Room, appearance: Appearance, model: string, details: DiscoveryDetails): RoomObject {
  if (appearance.template === 'unsupported') throw new Error('This shape is not supported yet. Try another photo.')
  if (!details.name.trim()) throw new Error('Give this piece a name.')
  const factor = details.unit === 'cm' ? 0.01 : 0.0254
  const values = [Number(details.width), Number(details.height), Number(details.depth)] as const
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error('Enter width, height and depth from the assembled furniture label, or mark your estimates.')
  const dimensions = { width: values[0] * factor, height: values[1] * factor, depth: values[2] * factor, source: details.estimated ? 'estimated' as const : 'user' as const }
  const id = crypto.randomUUID()
  const category = appearance.template === 'loveseat' ? 'sofa' : appearance.template === 'armchair' ? 'lounge-chair' : appearance.template
  const foundItem = { id, name: details.name.trim(), category, dimensions, price: discoveryPrice(details.price, details.currency), store: details.store.trim() || undefined, owned: details.owned }
  const object = RoomObject.parse({ id, name: foundItem.name, category, sourceKind: 'found', dimensions, pose: { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, asset: appearanceAsset(appearance), fidelity: 'approximate', quantity: 1, keep: false, lockPlacement: false, foundItemId: id, foundItem, appearance: { description: appearance, model, source: 'ai-estimated' } })
  if (category === 'table-lamp') {
    const placed = surfaceSpot(room, object)
    if (!placed) throw new Error('There is no suitable free tabletop for this piece.')
    return placed
  }
  const pose = freeSpot(room, dimensions)
  if (!pose) throw new Error('There is no free spot for this size. Check the dimensions or make space in your room first.')
  return { ...object, pose }
}
