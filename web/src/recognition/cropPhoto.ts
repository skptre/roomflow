import type { Room } from '../domain/schema'
import type { PackagePhoto, PhotoRegion } from '../import/roomflowPackage'
import { paddedCrop, planAutoMatch, uprightQuarterTurns, type PreparedItem } from './autoMatch'

/**
 * Everything the auto-match offer needs, or null when there's nothing to offer: photo matching isn't
 * configured, no item has a usable photo, or no crop could be drawn. Sends nothing to Google.
 */
export async function prepareAutoMatch(
  room: Room,
  regionsFor: Parameters<typeof planAutoMatch>[1],
): Promise<{ items: PreparedItem[]; model: string } | null> {
  const plan = planAutoMatch(room, regionsFor)
  if (plan.length === 0) return null
  let model = ''
  try {
    const status: unknown = await (await fetch('/api/recognize/status')).json()
    if (typeof status !== 'object' || status === null || !('ready' in status) || status.ready !== true) return null
    model = 'model' in status && typeof status.model === 'string' ? status.model : 'Gemini'
  } catch {
    return null
  }
  const items: PreparedItem[] = []
  for (const item of plan) {
    const image = await cropPhotoRegion(item.photo, item.rect)
    if (image) items.push({ ...item, image })
  }
  return items.length > 0 ? { items, model } : null
}

/** Longest edge of the image sent for matching, same as the manual photo dialog. */
const MAX_EDGE = 1024

/**
 * JPEG data URL of the item's region in a phone photo: padded, turned upright from the photo's
 * camera pose, at most 1024 px, on white, re-encoded (so no file metadata survives). This exact image
 * is shown for consent and sent. Returns null if the browser cannot decode or draw the photo.
 */
export async function cropPhotoRegion(photo: PackagePhoto, rect: PhotoRegion['rect']): Promise<string | null> {
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(photo.blob)
    const [x, y, w, h] = paddedCrop(rect)
    const sx = x * bitmap.width, sy = y * bitmap.height, sw = w * bitmap.width, sh = h * bitmap.height
    if (sw < 1 || sh < 1) return null
    const turns = uprightQuarterTurns(photo.cameraToWorld)
    const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh))
    const outW = Math.max(1, Math.round(sw * scale)), outH = Math.max(1, Math.round(sh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = turns % 2 === 0 ? outW : outH
    canvas.height = turns % 2 === 0 ? outH : outW
    const context = canvas.getContext('2d')
    if (!context) return null
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate((turns * Math.PI) / 2)
    context.drawImage(bitmap, sx, sy, sw, sh, -outW / 2, -outH / 2, outW, outH)
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return null
  } finally {
    bitmap?.close()
  }
}
