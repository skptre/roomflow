import { z } from 'zod'
import { type Room, type RoomObject, type AssetRef } from '../domain/schema'
import { freeSpot, surfaceSpot } from '../domain/layout'
import { appearanceAsset } from '../recognition/appearanceAsset'
import type { Appearance } from '../recognition/contract'

export const MAX_PIECE_BYTES = 7_000_000
const Photo = z.strictObject({ mimeType: z.literal('image/jpeg'), data: z.string().min(1).max(2_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/) })
/** A transport-only object: meters and evidence, with no room geometry or native world pose. */
export const PiecePackage = z.strictObject({
  format: z.literal('roomflow-piece'), version: z.literal(1), id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120), category: z.string().min(1).max(80),
  dimensions: z.strictObject({ width: z.number().positive().max(20), height: z.number().positive().max(20), depth: z.number().positive().max(20), source: z.enum(['captured', 'user', 'estimated']) }),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), photos: z.array(Photo).max(3),
})
export type PiecePackage = z.infer<typeof PiecePackage>

/** Bound JPEG size and declared pixel dimensions before allowing browser decoding. */
function validPhoto(data: string): boolean {
  let bytes: string
  try { bytes = atob(data) } catch { return false }
  if (bytes.length > 1_500_000 || bytes.charCodeAt(0) !== 255 || bytes.charCodeAt(1) !== 216) return false
  const byte = (index: number) => bytes.charCodeAt(index)
  const word = (index: number) => byte(index) * 256 + byte(index + 1)
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (byte(offset++) !== 255) return false
    while (byte(offset) === 255) offset++
    const marker = byte(offset++)
    if (marker === 0xda || marker === 0xd9) return false
    const length = word(offset)
    if (length < 2 || offset + length > bytes.length) return false
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const height = word(offset + 3), width = word(offset + 5)
      return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 16_000_000
    }
    offset += length
  }
  return false
}
/** Validate a bounded package without loading photos, replacing the room, or making network requests. */
export function parsePiece(text: string): PiecePackage {
  if (text.length > MAX_PIECE_BYTES || new TextEncoder().encode(text).length > MAX_PIECE_BYTES) throw new Error('Choose a piece package smaller than 7 MB.')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('This file is not valid JSON. Export the piece again from Roomflow.') }
  const result = PiecePackage.safeParse(value)
  if (!result.success) throw new Error('Choose a valid .roomflow-piece.json export from Scan a piece. Room scans belong on the home screen.')
  if (result.data.photos.some((photo) => !validPhoto(photo.data))) throw new Error('A reference photo is invalid or too large. Export the piece again without photos.')
  return result.data
}

const templates: Readonly<Record<string, Appearance['template']>> = { chair: 'armchair', sofa: 'sofa', bed: 'bed', table: 'desk', storage: 'dresser', armchair: 'armchair', loveseat: 'loveseat', desk: 'desk', 'floor-lamp': 'floor-lamp', 'table-lamp': 'table-lamp', 'coffee-table': 'coffee-table', bookshelf: 'bookshelf', nightstand: 'nightstand', dresser: 'dresser', 'desk-chair': 'desk-chair' }
/** Category-only approximation. This does not claim AI analysis or exact product identity. */
export function pieceAsset(piece: PiecePackage): AssetRef {
  const template = Object.hasOwn(templates, piece.category) ? templates[piece.category]! : 'unsupported'
  if (template === 'unsupported') return { kind: 'placeholder' }
  const color = piece.color ?? '#b7afa5'
  return appearanceAsset({ template, color, backColor: color, confidence: 'low', explanation: 'Approximate shape from the scanned category' })
}
/** Place one piece with a new placement ID; retained source ID enables duplicate notices. */
export function pieceObject(room: Room, piece: PiecePackage, owned: boolean): RoomObject {
  const asset = pieceAsset(piece)
  const object: RoomObject = {
    id: crypto.randomUUID(), name: piece.name, category: piece.category, sourceKind: 'found', dimensions: piece.dimensions,
    pose: { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, asset, fidelity: asset.kind === 'placeholder' ? 'placeholder' : 'approximate',
    quantity: 1, keep: false, lockPlacement: false, foundItemId: piece.id,
    foundItem: { id: piece.id, name: piece.name, category: piece.category, dimensions: piece.dimensions, price: null, owned },
  }
  if (piece.category === 'table-lamp') {
    const placed = surfaceSpot(room, object)
    if (!placed) throw new Error('No free tabletop is large enough for this piece.')
    return placed
  }
  const pose = freeSpot(room, piece.dimensions)
  if (!pose) throw new Error('No free spot is large enough. Make room first or check the dimensions on your phone.')
  return { ...object, pose }
}

/** Decode bounded photo bytes locally before display; a JPEG header alone is not a usable image. */
export async function verifyPiecePhotos(piece: PiecePackage, decode: (blob: Blob) => Promise<Pick<ImageBitmap, 'close'>> = (blob) => createImageBitmap(blob)): Promise<void> {
  for (const photo of piece.photos) {
    const bytes = Uint8Array.from(atob(photo.data), (character) => character.charCodeAt(0))
    try {
      const image = await decode(new Blob([bytes], { type: 'image/jpeg' }))
      image.close()
    } catch { throw new Error('A reference photo could not be opened. Export the piece again without photos.') }
  }
}
