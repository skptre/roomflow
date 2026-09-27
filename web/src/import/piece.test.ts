import { expect, it, vi } from 'vitest'
import { parsePiece, pieceObject, verifyPiecePhotos, MAX_PIECE_BYTES } from './piece'
import { sampleRoom } from '../test/rooms'
import { createDesignStore, purchaseLines } from '../domain/designStore'
const input = { format: 'roomflow-piece', version: 1, id: 'phone-piece-1', name: 'My find', category: 'chair', dimensions: { width: .4, height: .8, depth: .4, source: 'captured' }, photos: [] }
it('imports only a piece with meter dimensions, no original room pose or AI attribution', () => {
  const piece = parsePiece(JSON.stringify(input))
  const object = pieceObject(sampleRoom(), piece, false)
  expect(object.dimensions).toEqual(input.dimensions)
  expect(object.sourceKind).toBe('found')
  expect(object.appearance).toBeUndefined()
  expect(object.foundItemId).toBe(input.id)
  expect(object.asset.kind).toBe('parametric')
})
it('rejects raw rooms, invalid values, oversized files and non-JPEG photo content', () => {
  for (const value of [{}, { ...input, version: 2 }, { ...input, pose: {} }, { ...input, dimensions: { ...input.dimensions, width: 0 } }, { ...input, dimensions: { ...input.dimensions, height: 21 } }, { ...input, photos: [{ mimeType: 'image/jpeg', data: btoa('not a jpeg') }] }]) expect(() => parsePiece(JSON.stringify(value))).toThrow()
  expect(() => parsePiece(' '.repeat(MAX_PIECE_BYTES + 1))).toThrow()
})
it('isolates preview, detects staleness, and reverses additions and unknown costs with undo', () => {
  const room = sampleRoom(); const store = createDesignStore(); store.getState().loadRoom(room)
  const revision = store.getState().committed!.revision
  const object = pieceObject(room, parsePiece(JSON.stringify(input)), false)
  const commands = [{ type: 'add' as const, object }]
  expect(store.getState().startPreview(commands, { actor: 'auto', baseRevision: revision }).ok).toBe(true)
  expect(store.getState().committed!.room).toEqual(room)
  store.getState().cancelPreview(); expect(store.getState().committed!.room).toEqual(room)
  store.getState().startPreview(commands, { actor: 'auto', baseRevision: revision }); store.getState().commitPreview()
  expect(purchaseLines(store.getState().committed!.room, { offers: new Map() }).at(-1)).toMatchObject({ owned: false, unitPrice: null })
  store.getState().undo(); expect(store.getState().committed!.room).toEqual(room)
  expect(store.getState().startPreview(commands, { actor: 'auto', baseRevision: revision }).ok).toBe(false)
})
it('uses a labeled placeholder for unknown categories and does not invent a model', () => {
  const object = pieceObject(sampleRoom(), parsePiece(JSON.stringify({ ...input, category: 'mystery' })), true)
  expect(object.asset.kind).toBe('placeholder'); expect(object.fidelity).toBe('placeholder')
  expect(object.foundItem?.owned).toBe(true)
})
it('bounds photo count and decoded pixels, and keeps placement identity separate from capture identity', () => {
  const header = (width: number, height: number) => btoa(String.fromCharCode(255,216,255,192,0,17,8,height >> 8,height & 255,width >> 8,width & 255,3,1,17,0,2,17,0,3,17,0,255,217))
  const photo = { mimeType: 'image/jpeg', data: header(1024,768) }
  expect(parsePiece(JSON.stringify({ ...input, photos: [photo] })).photos).toHaveLength(1)
  expect(() => parsePiece(JSON.stringify({ ...input, photos: Array(4).fill(photo) }))).toThrow()
  expect(() => parsePiece(JSON.stringify({ ...input, photos: [{ ...photo, data: header(16000,16000) }] }))).toThrow()
  const piece = parsePiece(JSON.stringify(input))
  expect(pieceObject(sampleRoom(), piece, false).id).not.toBe(pieceObject(sampleRoom(), piece, false).id)
})
it('does not place a piece that exceeds the available room', () => {
  const piece = parsePiece(JSON.stringify({ ...input, dimensions: { ...input.dimensions, width: 20, depth: 20 } }))
  expect(() => pieceObject(sampleRoom(), piece, false)).toThrow('No free spot')
})
it('accepts the synthetic fixture emitted by the native Swift encoder', async () => {
  const { default: nativeJSON } = await import('../fixtures/synthetic-native-piece.json?raw')
  const piece = parsePiece(nativeJSON)
  expect(piece.name).toBe('Native chair fixture')
  expect(piece.dimensions).toEqual({ width: .6, height: .9, depth: .7, source: 'captured' })
  expect(pieceObject(sampleRoom(), piece, true).foundItem?.owned).toBe(true)
})

it('requires local decoding of reference photos and releases decoded resources', async () => {
  const piece = parsePiece(JSON.stringify(input))
  piece.photos = [{ mimeType: 'image/jpeg', data: btoa('bounded bytes') }]
  const close = vi.fn()
  await verifyPiecePhotos(piece, async () => ({ close }))
  expect(close).toHaveBeenCalledOnce()
  await expect(verifyPiecePhotos(piece, async () => { throw new Error('bad pixels') })).rejects.toThrow('could not be opened')
})
