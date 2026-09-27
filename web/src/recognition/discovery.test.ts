import { expect, it } from 'vitest'
import { createDesignStore, purchaseLines } from '../domain/designStore'
import { sampleRoom } from '../test/rooms'
import { discoveryObject, discoveryPrice } from './discovery'
const appearance = { template: 'floor-lamp', color: '#654321', backColor: '#654321', confidence: 'medium', explanation: 'A lamp' } as const
const details = { name: 'Store lamp', width: '30', height: '140', depth: '30', unit: 'cm' as const, estimated: false, price: '49.99', currency: 'USD', store: 'IKEA', owned: false }
it('isolates previews and undoes spatial and financial changes together', () => {
  const store = createDesignStore(); const room = sampleRoom(); store.getState().loadRoom(room)
  const revision = store.getState().committed!.revision
  const object = discoveryObject(room, appearance, 'test-model', details)
  const commands = [{ type: 'add' as const, object }]
  expect(store.getState().startPreview(commands, { actor: 'auto', baseRevision: revision }).ok).toBe(true)
  expect(store.getState().committed!.room).toEqual(room)
  expect(store.getState().commitPreview().ok).toBe(true)
  const added = store.getState().committed!.room
  expect(added.objects.slice(0, -1)).toEqual(room.objects)
  expect(purchaseLines(added, { offers: new Map() }).at(-1)?.unitPrice).toEqual({ amountMinor: 4999, currency: 'USD' })
  store.getState().undo(); expect(store.getState().committed!.room).toEqual(room)
  expect(store.getState().startPreview(commands, { actor: 'auto', baseRevision: revision }).ok).toBe(false)
})
it('keeps unknown prices unknown and rejects invalid minor units', () => {
  expect(discoveryPrice('', 'USD')).toBeNull()
  expect(discoveryPrice('0', 'USD')?.amountMinor).toBe(0)
  for (const value of ['1.999', '-1', 'NaN', '90071992547409.91']) expect(() => discoveryPrice(value, 'USD')).toThrow()
  expect(() => discoveryPrice('10', 'JPY')).toThrow()
})
it('rejects missing size, unsupported shapes and items too large', () => {
  expect(() => discoveryObject(sampleRoom(), appearance, 'test', { ...details, width: '' })).toThrow()
  expect(() => discoveryObject(sampleRoom(), appearance, 'test', { ...details, width: '99999' })).toThrow()
  expect(() => discoveryObject(sampleRoom(), { ...appearance, template: 'unsupported' }, 'test', details)).toThrow()
})
it('cancels without changing purchases and excludes owned discoveries from new cost', () => {
  const store = createDesignStore(); const room = sampleRoom(); store.getState().loadRoom(room)
  const object = discoveryObject(room, appearance, 'test', { ...details, owned: true, unit: 'in', width: '12', depth: '12', height: '50' })
  expect(object.dimensions.width).toBeCloseTo(0.3048)
  expect(store.getState().startPreview([{ type: 'add', object }]).ok).toBe(true)
  store.getState().cancelPreview(); expect(store.getState().committed!.room).toEqual(room)
  expect(store.getState().apply([{ type: 'add', object }], { actor: 'user' }).ok).toBe(true)
  expect(purchaseLines(store.getState().committed!.room, { offers: new Map() }).at(-1)?.owned).toBe(true)
})
