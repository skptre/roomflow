/**
 * Matching the appearance of scanned furniture from the phone's own reference photos, for every
 * eligible item at once. Pure planning, pacing and reconciliation live here; cropping pixels is in
 * `cropPhoto.ts` and the consent/progress UI in `ui/AutoMatchDialog.tsx`.
 */
import type { Command } from '../domain/commands'
import type { Room, RoomObject } from '../domain/schema'
import type { PackagePhoto, PhotoRegion } from '../import/roomflowPackage'
import { appearanceCommand } from './appearance'
import { RecognitionResponse } from './contract'

/** At most this many items are sent in one run (the phone keeps at most 12 photos anyway). */
export const AUTO_MATCH_MAX_ITEMS = 12
/** Regions smaller than this fraction of the photo show too little of the item to be worth sending. */
export const MIN_REGION_AREA = 0.01
/** The local server allows 6 requests a minute; after a rate-limit answer we wait this long once. */
export const RATE_LIMIT_WAIT_MS = 61_000

export type AutoMatchItem = { objectId: string; name: string; photo: PackagePhoto; rect: PhotoRegion['rect'] }
/** An item plus the exact JPEG data URL shown for consent and sent for analysis. */
export type PreparedItem = AutoMatchItem & { image: string }

/**
 * Items worth matching: scanned furniture without an appearance yet that has a usable photo region.
 * Uses each item's best (largest) region; keeps room order; caps at `AUTO_MATCH_MAX_ITEMS`.
 */
export function planAutoMatch(
  room: Room,
  regionsFor: (objectId: string) => Array<{ region: PhotoRegion; photo: PackagePhoto }>,
): AutoMatchItem[] {
  const items: AutoMatchItem[] = []
  for (const object of room.objects) {
    if (items.length >= AUTO_MATCH_MAX_ITEMS) break
    if (object.sourceKind !== 'captured' || object.appearance) continue
    const best = regionsFor(object.id).find(({ region }) => region.rect[2] * region.rect[3] >= MIN_REGION_AREA)
    if (best) items.push({ objectId: object.id, name: object.name, photo: best.photo, rect: best.region.rect })
  }
  return items
}

/** The region grown by `pad` of its size on every side, clamped to the photo (normalized, top-left origin). */
export function paddedCrop(rect: PhotoRegion['rect'], pad = 0.1): PhotoRegion['rect'] {
  const [x, y, w, h] = rect
  const left = Math.max(0, x - w * pad), top = Math.max(0, y - h * pad)
  const right = Math.min(1, x + w * (1 + pad)), bottom = Math.min(1, y + h * (1 + pad))
  return [left, top, Math.max(0, right - left), Math.max(0, bottom - top)]
}

/**
 * Clockwise quarter turns that make a sensor-orientation photo upright, from its camera-to-world pose
 * (16 numbers, column-major, RoomPlan world with +Y up; camera +X is image right, +Y image up).
 * Returns 0 for a non-finite or malformed pose.
 */
export function uprightQuarterTurns(cameraToWorld: number[]): 0 | 1 | 2 | 3 {
  if (cameraToWorld.length !== 16 || !cameraToWorld.every(Number.isFinite)) return 0
  // World up expressed on the camera's X and Y axes (the y component of columns 0 and 1),
  // converted to image coordinates where y grows downward.
  let x = cameraToWorld[1]!, y = -cameraToWorld[5]!
  let best: 0 | 1 | 2 | 3 = 0, bestScore = -Infinity
  for (const turns of [0, 1, 2, 3] as const) {
    if (-y > bestScore) { best = turns; bestScore = -y } // how much "up" points at the image top
    ;[x, y] = [-y, x] // one clockwise turn in y-down image coordinates
  }
  return best
}

export type SendResult =
  | { ok: true; data: RecognitionResponse }
  | { ok: false; status: number; error: string }
export type ItemOutcome =
  | { objectId: string; status: 'matched' | 'unsupported'; data: RecognitionResponse }
  | { objectId: string; status: 'failed'; error: string }
  | { objectId: string; status: 'skipped' }

export type RunDeps = {
  /** Sends one base64 JPEG (no data-URL prefix) with consent. */
  send: (image: string, signal: AbortSignal) => Promise<SendResult>
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
  signal: AbortSignal
  onProgress?: (done: number, total: number, waiting: boolean) => void
}

/**
 * Sends items one at a time (the server analyzes one photo at a time). A rate-limit answer (429) is a
 * local refusal before anything reaches Google, so that item is sent once more after
 * `RATE_LIMIT_WAIT_MS`; a second refusal stops the run. Two failures in a row also stop it. Items not
 * reached (stopped or aborted) are reported as skipped. Nothing that got a real answer is resent.
 */
export async function runAutoMatch(items: PreparedItem[], deps: RunDeps): Promise<ItemOutcome[]> {
  const outcomes: ItemOutcome[] = []
  let failuresInRow = 0
  let stopped = false
  for (const [index, item] of items.entries()) {
    if (stopped || deps.signal.aborted) { outcomes.push({ objectId: item.objectId, status: 'skipped' }); continue }
    deps.onProgress?.(index, items.length, false)
    const image = item.image.slice(item.image.indexOf(',') + 1)
    let result = await deps.send(image, deps.signal)
    if (!result.ok && result.status === 429 && !deps.signal.aborted) {
      deps.onProgress?.(index, items.length, true)
      await deps.sleep(RATE_LIMIT_WAIT_MS, deps.signal)
      if (deps.signal.aborted) { outcomes.push({ objectId: item.objectId, status: 'skipped' }); continue }
      result = await deps.send(image, deps.signal)
      if (!result.ok && result.status === 429) stopped = true
    }
    if (result.ok) {
      failuresInRow = 0
      const status = result.data.appearance.template === 'unsupported' ? 'unsupported' : 'matched'
      outcomes.push({ objectId: item.objectId, status, data: result.data })
    } else if (deps.signal.aborted) {
      outcomes.push({ objectId: item.objectId, status: 'skipped' })
    } else {
      outcomes.push({ objectId: item.objectId, status: 'failed', error: result.error })
      if (++failuresInRow >= 2) stopped = true
    }
  }
  deps.onProgress?.(items.length, items.length, false)
  return outcomes
}

/** Browser `send` for `runAutoMatch`: POST /api/recognize, response validated at the boundary. */
export async function sendToRecognizer(image: string, signal: AbortSignal): Promise<SendResult> {
  try {
    const response = await fetch('/api/recognize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ image, consent: true }),
    })
    const body: unknown = await response.json()
    if (!response.ok) {
      const error = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error : 'Photo matching is unavailable.'
      return { ok: false, status: response.status, error }
    }
    const parsed = RecognitionResponse.safeParse(body)
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, status: 502, error: 'The match came back in an unexpected form.' }
  } catch {
    return { ok: false, status: 0, error: signal.aborted ? 'Stopped.' : 'Could not reach photo matching.' }
  }
}

/** Resolves after `ms`, or early when `signal` aborts. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
    signal.addEventListener('abort', done, { once: true })
  })
}

export type SkipReason = 'removed' | 'changed'

/**
 * Commands for matched items that are still safe to apply to `now`. An item is left alone when it was
 * removed or its look changed since `start` (a newer choice made while matching is never overwritten).
 */
export function reconcileMatches(start: Room, now: Room, outcomes: ItemOutcome[]): {
  commands: Command[]
  skipped: Array<{ objectId: string; reason: SkipReason }>
} {
  const before = new Map(start.objects.map((object) => [object.id, object]))
  const current = new Map(now.objects.map((object) => [object.id, object]))
  const commands: Command[] = []
  const skipped: Array<{ objectId: string; reason: SkipReason }> = []
  for (const outcome of outcomes) {
    if (outcome.status !== 'matched') continue
    const was = before.get(outcome.objectId), is = current.get(outcome.objectId)
    if (!is) { skipped.push({ objectId: outcome.objectId, reason: 'removed' }); continue }
    if (!was || !sameLook(was, is)) { skipped.push({ objectId: outcome.objectId, reason: 'changed' }); continue }
    commands.push(appearanceCommand(outcome.objectId, outcome.data.appearance, outcome.data.model))
  }
  return { commands, skipped }
}

function sameLook(a: RoomObject, b: RoomObject): boolean {
  return JSON.stringify([a.sourceKind, a.asset, a.appearance ?? null]) === JSON.stringify([b.sourceKind, b.asset, b.appearance ?? null])
}
