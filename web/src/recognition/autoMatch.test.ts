import { describe, expect, it, vi } from 'vitest'
import type { PackagePhoto, PhotoRegion } from '../import/roomflowPackage'
import { sampleRoom } from '../test/rooms'
import {
  AUTO_MATCH_MAX_ITEMS, RATE_LIMIT_WAIT_MS, paddedCrop, planAutoMatch, reconcileMatches, runAutoMatch,
  uprightQuarterTurns, type ItemOutcome, type PreparedItem, type SendResult,
} from './autoMatch'
import type { RecognitionResponse } from './contract'

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.4, 0, 1]
const photo = (photoId: string, cameraToWorld = identity): PackagePhoto =>
  ({ photoId, blob: new Blob(), pixelWidth: 1280, pixelHeight: 960, cameraToWorld, intrinsics: [1, 0, 0, 0, 1, 0, 0, 0, 1] }) as PackagePhoto
const region = (sourceId: string, photoId: string, rect: PhotoRegion['rect']): PhotoRegion =>
  ({ sourceId, photoId, rect, method: 'projected-bounds' })
const response = (template: RecognitionResponse['appearance']['template'] = 'armchair'): RecognitionResponse => ({
  appearance: { template, color: '#52677d', backColor: '#8091a0', confidence: 'medium', explanation: 'One seat' },
  model: 'gemini-3.1-flash-lite',
  usage: { inputTokens: 1000, outputTokens: 50, estimatedCostUsd: 0.0001 },
})
const prepared = (objectId: string): PreparedItem =>
  ({ objectId, name: objectId, photo: photo('p'), rect: [0, 0, 1, 1], image: 'data:image/jpeg;base64,QUJD' })

describe('planAutoMatch', () => {
  it('picks scanned items without an appearance, using their largest usable region', () => {
    const room = sampleRoom()
    const [first, second, third] = room.objects
    expect(third).toBeDefined()
    third!.appearance = { description: response().appearance, model: 'm', source: 'ai-estimated' }
    const regions = new Map<string, Array<{ region: PhotoRegion; photo: PackagePhoto }>>([
      [first!.id, [{ region: region(first!.id, 'big', [0.1, 0.1, 0.5, 0.5]), photo: photo('big') }]],
      // Too small to show the item, so this item has no usable region.
      [second!.id, [{ region: region(second!.id, 'tiny', [0.5, 0.5, 0.05, 0.05]), photo: photo('tiny') }]],
      [third!.id, [{ region: region(third!.id, 'x', [0, 0, 1, 1]), photo: photo('x') }]],
    ])
    const plan = planAutoMatch(room, (id) => regions.get(id) ?? [])
    expect(plan.map((item) => item.objectId)).toEqual([first!.id])
    expect(plan[0]!.photo.photoId).toBe('big')
  })

  it('skips products and caps the run', () => {
    const room = sampleRoom()
    const template = room.objects[0]!
    room.objects = Array.from({ length: AUTO_MATCH_MAX_ITEMS + 3 }, (_, i) => ({ ...template, id: `obj-${i}` }))
    room.objects[0] = { ...room.objects[0]!, sourceKind: 'product' }
    const plan = planAutoMatch(room, (id) => [{ region: region(id, 'p', [0, 0, 0.5, 0.5]), photo: photo('p') }])
    expect(plan).toHaveLength(AUTO_MATCH_MAX_ITEMS)
    expect(plan[0]!.objectId).toBe('obj-1')
  })
})

describe('paddedCrop', () => {
  it('grows the region and clamps to the photo', () => {
    const [x, y, w, h] = paddedCrop([0.2, 0.3, 0.4, 0.2])
    expect(x).toBeCloseTo(0.16); expect(y).toBeCloseTo(0.28); expect(w).toBeCloseTo(0.48); expect(h).toBeCloseTo(0.24)
    expect(paddedCrop([0, 0.9, 1, 0.1])).toEqual([0, expect.closeTo(0.89), 1, expect.closeTo(0.11)])
  })
})

describe('uprightQuarterTurns', () => {
  // Camera-to-world whose camera X/Y axes are given in world coordinates (camera looks along -Z).
  const pose = (xAxis: [number, number, number], yAxis: [number, number, number]) =>
    [...xAxis, 0, ...yAxis, 0, 0, 0, 1, 0, 0, 1.4, 0, 1]
  it('leaves an upright sensor image alone', () => expect(uprightQuarterTurns(pose([1, 0, 0], [0, 1, 0]))).toBe(0))
  it('turns world-up-along-camera-+X (portrait) three times clockwise', () =>
    expect(uprightQuarterTurns(pose([0, 1, 0], [-1, 0, 0]))).toBe(3))
  it('turns world-up-along-camera--X once clockwise', () => expect(uprightQuarterTurns(pose([0, -1, 0], [1, 0, 0]))).toBe(1))
  it('flips an upside-down image', () => expect(uprightQuarterTurns(pose([-1, 0, 0], [0, -1, 0]))).toBe(2))
  it('ignores malformed poses', () => {
    expect(uprightQuarterTurns([1, 2, 3])).toBe(0)
    expect(uprightQuarterTurns(pose([Number.NaN, 0, 0], [0, 1, 0]))).toBe(0)
  })
})

describe('runAutoMatch', () => {
  const deps = (answers: SendResult[]) => {
    const send = vi.fn(async (_image: string) => answers.shift() ?? { ok: false as const, status: 500, error: 'none left' })
    const sleep = vi.fn(async () => {})
    return { send, sleep, signal: new AbortController().signal }
  }

  it('sends items one at a time without the data-URL prefix', async () => {
    const d = deps([{ ok: true, data: response() }, { ok: true, data: response('unsupported') }])
    const outcomes = await runAutoMatch([prepared('a'), prepared('b')], d)
    expect(d.send.mock.calls.map((call) => call[0])).toEqual(['QUJD', 'QUJD'])
    expect(outcomes.map((o) => o.status)).toEqual(['matched', 'unsupported'])
  })

  it('waits once after a rate-limit refusal, then sends that item again', async () => {
    const d = deps([{ ok: false, status: 429, error: 'limit' }, { ok: true, data: response() }])
    const outcomes = await runAutoMatch([prepared('a')], d)
    expect(d.sleep).toHaveBeenCalledWith(RATE_LIMIT_WAIT_MS, d.signal)
    expect(d.send).toHaveBeenCalledTimes(2)
    expect(outcomes[0]!.status).toBe('matched')
  })

  it('stops after a second rate-limit refusal and skips the rest', async () => {
    const d = deps([{ ok: false, status: 429, error: 'limit' }, { ok: false, status: 429, error: 'limit' }])
    const outcomes = await runAutoMatch([prepared('a'), prepared('b')], d)
    expect(outcomes.map((o) => o.status)).toEqual(['failed', 'skipped'])
    expect(d.send).toHaveBeenCalledTimes(2)
  })

  it('stops after two failures in a row but not after one', async () => {
    const fail = { ok: false as const, status: 502, error: 'upstream' }
    const d = deps([fail, { ok: true, data: response() }, fail, fail])
    const outcomes = await runAutoMatch(['a', 'b', 'c', 'd', 'e'].map(prepared), d)
    expect(outcomes.map((o) => o.status)).toEqual(['failed', 'matched', 'failed', 'failed', 'skipped'])
  })

  it('skips everything after an abort', async () => {
    const controller = new AbortController()
    const send = vi.fn(async (): Promise<SendResult> => { controller.abort(); return { ok: false, status: 0, error: 'Stopped.' } })
    const outcomes = await runAutoMatch([prepared('a'), prepared('b')], { send, sleep: async () => {}, signal: controller.signal })
    expect(outcomes.map((o) => o.status)).toEqual(['skipped', 'skipped'])
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('reconcileMatches', () => {
  it('applies matches only to items that still exist with the same look', () => {
    const start = sampleRoom()
    const [a, b, c] = start.objects
    const now = structuredClone(start)
    now.objects = now.objects.filter((object) => object.id !== b!.id)
    now.objects.find((object) => object.id === c!.id)!.appearance = { description: response('sofa').appearance, model: 'm', source: 'ai-estimated' }
    const outcomes: ItemOutcome[] = [
      { objectId: a!.id, status: 'matched', data: response() },
      { objectId: b!.id, status: 'matched', data: response() },
      { objectId: c!.id, status: 'matched', data: response() },
      { objectId: 'other', status: 'unsupported', data: response('unsupported') },
    ]
    const { commands, skipped } = reconcileMatches(start, now, outcomes)
    expect(commands).toEqual([{ type: 'setAppearance', id: a!.id, appearance: response().appearance, model: 'gemini-3.1-flash-lite' }])
    expect(skipped).toEqual([{ objectId: b!.id, reason: 'removed' }, { objectId: c!.id, reason: 'changed' }])
  })
})
