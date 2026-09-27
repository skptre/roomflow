import { describe, expect, it } from 'vitest'
import fixtureText from '../fixtures/synthetic-bedroom.roomplan.json?raw'
import { makeZip, type ZipEntry } from '../test/zipWriter'
import { isWallHung } from '../domain/categories'
import { hostWall } from '../domain/layout'
import { isZipArchive, parseRoomflowPackage } from './roomflowPackage'

const CAPTURE = 'AE251557-DC8F-48F1-9352-60220A5490A4'
const PHOTO = '8F0D1E2C-3B4A-4C5D-8E6F-708192A3B4C5'
const ART = 'C0FFEE00-1111-4222-8333-444455556666'
const NOW = '2026-09-26T12:00:00.000Z'
const firstObjectId = (JSON.parse(fixtureText) as { objects: { identifier: string }[] }).objects[0]!.identifier
const firstWallId = (JSON.parse(fixtureText) as { walls: { identifier: string }[] }).walls[0]!.identifier

async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

type Options = {
  withPhoto?: boolean
  mutateManifest?: (manifest: Record<string, any>) => void
  extraEntries?: ZipEntry[]
  folder?: string
  skipFile?: string
  mutateAppearance?: (appearance: Record<string, any>) => void
  /** wallArt.json contents (an object, or raw text for malformed files); omitted = no wall art (old packages). */
  wallArt?: Record<string, any> | string
  /** Include art/<ART>.jpg (default true when wallArt is given). */
  withArtPhoto?: boolean
}

/** One piece on the north wall (native z = 4.2, facing -z into the room), face 1 cm off the wall. */
function wallArtFile(): Record<string, any> {
  return {
    schemaVersion: 1, captureId: CAPTURE,
    items: [{
      artId: ART, wallSourceId: 'WALL-C-NORTH', center: [3.2, 1.0, 4.19], normal: [0, 0, -2], width: 0.38, height: 0.95,
      standoff: 0.01, sightingCount: 7, photoPath: `art/${ART}.jpg`, method: 'rectangle-lidar-v1', provenance: 'measured-estimate',
    }],
  }
}

/** Builds a package the way the iOS app does, optionally broken in one specific way. */
async function makePackage(options: Options = {}): Promise<Uint8Array> {
  const enc = (s: string) => new TextEncoder().encode(s)
  const appearance: Record<string, any> = {
    schemaVersion: 1, captureId: CAPTURE,
    colors: [
      { sourceId: firstObjectId, hex: '#E4DED3', sampleCount: 30, provenance: 'camera-estimate' },
      { sourceId: firstWallId, hex: '#F0EBE3', sampleCount: 40, provenance: 'camera-estimate' },
      { sourceId: 'not-in-scan', hex: '#000000', sampleCount: 5, provenance: 'camera-estimate' },
    ],
    floorColor: { hex: '#4A4B50', sampleCount: 120 },
    annotations: [{ sourceId: firstObjectId, label: 'guest bed', provenance: 'user-supplied' }],
  }
  options.mutateAppearance?.(appearance)
  const files: Record<string, Uint8Array> = {
    'capture.roomplan.json': enc(fixtureText),
    'editable.roomflow.json': enc('{"revision":0}'),
    'appearance.json': enc(JSON.stringify(appearance)),
  }
  if (options.withPhoto !== false) files[`photos/${PHOTO}.jpg`] = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  if (options.wallArt !== undefined) {
    files['wallArt.json'] = enc(typeof options.wallArt === 'string' ? options.wallArt : JSON.stringify(options.wallArt))
    if (options.withArtPhoto !== false) files[`art/${ART}.jpg`] = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])
  }
  const manifest: Record<string, any> = {
    schemaVersion: 1, packageId: '5B1C9C2E-0000-4000-8000-000000000001', captureId: CAPTURE,
    capturedAt: '2026-09-26T21:02:00Z', units: 'meters', coordinateSpace: 'roomplan-native-v1',
    selectionRevision: 1, omittedPhotoCount: 0,
    files: await Promise.all(Object.entries(files).map(async ([path, data]) => ({
      path, mediaType: path.endsWith('.jpg') ? 'image/jpeg' : 'application/json', byteCount: data.length, sha256: await sha256(data),
    }))),
    photos: options.withPhoto === false ? [] : [{
      photoId: PHOTO, path: `photos/${PHOTO}.jpg`, sessionId: '11111111-2222-4333-8444-555555555555', timestamp: 3.5,
      pixelWidth: 1280, pixelHeight: 960, cameraToWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      intrinsics: [1000, 0, 0, 0, 1000, 0, 640, 480, 1], pixelOrientation: 'sensor-native', trackingContinuous: true,
    }],
    associations: options.withPhoto === false ? [] : [{ sourceId: firstObjectId, photoId: PHOTO, rect: [0.1, 0.2, 0.3, 0.4], method: 'projected-bounds' }],
  }
  options.mutateManifest?.(manifest)
  const folder = options.folder ?? `${CAPTURE}.roomflow`
  const entries: ZipEntry[] = [
    { name: `${folder}/manifest.json`, data: JSON.stringify(manifest) },
    ...Object.entries(files).filter(([path]) => path !== options.skipFile).map(([path, data]) => ({ name: `${folder}/${path}`, data, deflate: true })),
    ...(options.extraEntries ?? []),
  ]
  return makeZip(entries)
}

async function load(bytes: Uint8Array) {
  const result = await parseRoomflowPackage(bytes, { now: NOW })
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`)
  return result
}

describe('parseRoomflowPackage', () => {
  it('recognizes zip archives by their signature', async () => {
    expect(isZipArchive(await makePackage())).toBe(true)
    expect(isZipArchive(new TextEncoder().encode(fixtureText))).toBe(false)
  })

  it('imports the room from the raw scan inside, with the same geometry as the .json import', async () => {
    const { room } = await load(await makePackage())
    expect(room.id).toBe(`room-${CAPTURE}`)
    expect(room.walls).toHaveLength(4)
    expect(room.source.kind).toBe('synthetic')
  })

  it('keeps photos, regions, colors, and names as evidence without changing measurements', async () => {
    const { room, evidence } = await load(await makePackage())
    expect(evidence.photos.map((p) => p.photoId)).toEqual([PHOTO])
    expect(evidence.photos[0]!.blob.type).toBe('image/jpeg')
    expect(evidence.associations).toEqual([{ sourceId: firstObjectId, photoId: PHOTO, rect: [0.1, 0.2, 0.3, 0.4], method: 'projected-bounds' }])
    expect(evidence.colors.map((c) => c.sourceId)).toEqual([firstObjectId, firstWallId]) // unknown ids dropped
    expect(evidence.colors[0]!.provenance).toBe('camera-estimate')
    const labelled = room.objects.find((o) => o.id === firstObjectId)!
    // The user's name is shown; the scan's category and measurements are untouched.
    expect(labelled.name).toBe('guest bed')
    expect(labelled.category).toBe('bed')
    expect(labelled.dimensions.source).toBe('captured')
  })

  it('uses the scanned floor color as a plain floor when the phone sampled it enough', async () => {
    const { room } = await load(await makePackage())
    expect(room.finishes.floor).toBe('#4a4b50')
    expect(room.finishes.floorTexture).toBe('plain')
  })

  it('keeps the default wood floor when the floor color is missing or barely sampled', async () => {
    const thin = await makePackage({ mutateAppearance: (a) => { a.floorColor = { hex: '#123456', sampleCount: 2 } } })
    const none = await makePackage({ mutateAppearance: (a) => { a.floorColor = null } })
    for (const bytes of [thin, none]) {
      const { room } = await load(bytes)
      expect(room.finishes.floor).toBe('#c9a882')
      expect(room.finishes.floorTexture).toBeUndefined()
    }
  })

  it('accepts a geometry-only package', async () => {
    const { evidence } = await load(await makePackage({ withPhoto: false }))
    expect(evidence.photos).toEqual([])
  })

  it('rejects a file whose checksum does not match the manifest', async () => {
    const bytes = await makePackage({ mutateManifest: (m) => { m.files[0].sha256 = '0'.repeat(64) } })
    const result = await parseRoomflowPackage(bytes)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/checksum|changed/i)
  })

  it('rejects files the manifest does not list, and listed files that are missing', async () => {
    const extra = await parseRoomflowPackage(await makePackage({ extraEntries: [{ name: `${CAPTURE}.roomflow/notes.txt`, data: 'hi' }] }))
    expect(extra.ok).toBe(false)
    const missing = await parseRoomflowPackage(await makePackage({ skipFile: 'editable.roomflow.json' }))
    expect(missing.ok).toBe(false)
  })

  it('rejects paths outside the allowed layout', async () => {
    const bytes = await makePackage({ mutateManifest: (m) => { m.files.push({ path: 'scripts/run.js', mediaType: 'text/javascript', byteCount: 1, sha256: 'x' }) } })
    expect((await parseRoomflowPackage(bytes)).ok).toBe(false)
  })

  it('rejects an unknown schema or coordinate space', async () => {
    expect((await parseRoomflowPackage(await makePackage({ mutateManifest: (m) => { m.schemaVersion = 2 } }))).ok).toBe(false)
    expect((await parseRoomflowPackage(await makePackage({ mutateManifest: (m) => { m.coordinateSpace = 'app' } }))).ok).toBe(false)
  })

  it('rejects a package whose folder does not match its capture ID', async () => {
    expect((await parseRoomflowPackage(await makePackage({ folder: 'other.roomflow' }))).ok).toBe(false)
  })

  it('rejects a zip that is not a RoomFlow package', async () => {
    const result = await parseRoomflowPackage(await makeZip([{ name: 'readme.txt', data: 'hello' }]))
    expect(result.ok).toBe(false)
  })

  it('drops photo regions that point at unknown photos or objects, with a warning', async () => {
    const bytes = await makePackage({ mutateManifest: (m) => { m.associations.push({ sourceId: 'no-such-object', photoId: PHOTO, rect: [0, 0, 0.5, 0.5], method: 'projected-bounds' }) } })
    const { evidence, warnings } = await load(bytes)
    expect(evidence.associations).toHaveLength(1)
    expect(warnings.join(' ')).toMatch(/photo region/)
  })

  describe('wall art', () => {
    it('adds each piece as locked wall art on its wall, with its photo in the evidence', async () => {
      const { room, evidence, warnings } = await load(await makePackage({ wallArt: wallArtFile() }))
      const art = room.objects.find((o) => o.id === ART)!
      expect(art).toMatchObject({
        category: 'wall-art', name: 'Wall art', sourceKind: 'captured', fidelity: 'approximate', keep: true, lockPlacement: true, quantity: 1,
        asset: { kind: 'recipe', recipeId: 'default:wall-art' },
      })
      expect(art.dimensions).toEqual({ width: 0.38, height: 0.95, depth: 0.03, source: 'captured' })
      // nativeToApp for the fixture is (-3.2, 1.4, -2.45). A 1 cm visual gap keeps the frame clear of the wall.
      expect(art.pose.position.x).toBeCloseTo(0, 6)
      expect(art.pose.position.y).toBeCloseTo(1.0 + 1.4 - 0.95 / 2, 6)
      expect(art.pose.position.z).toBeCloseTo(4.2 - 0.025 - 2.45, 6)
      expect(Math.abs(art.pose.yaw)).toBeCloseTo(Math.PI, 6) // faces -z (normal was normalized)
      expect(hostWall(room, art)).toBe('WALL-C-NORTH')
      expect(isWallHung(art)).toBe(true) // so it hides with its wall in the cutaway
      expect(evidence.artPhotos).toHaveLength(1)
      expect(evidence.artPhotos[0]!.artId).toBe(ART)
      expect(evidence.artPhotos[0]!.blob.type).toBe('image/jpeg')
      expect(warnings.join(' ')).not.toMatch(/wall art/)
    })

    it('keeps a piece without a photo (photoPath null, or omitted as Swift Codable writes it)', async () => {
      for (const clear of [(item: Record<string, any>) => { item.photoPath = null }, (item: Record<string, any>) => { delete item.photoPath }]) {
        const file = wallArtFile()
        clear(file.items[0])
        const { room, evidence } = await load(await makePackage({ wallArt: file, withArtPhoto: false }))
        expect(room.objects.some((o) => o.id === ART)).toBe(true)
        expect(evidence.artPhotos).toEqual([])
      }
    })

    it('drops invalid pieces with one warning and keeps the valid ones', async () => {
      const file = wallArtFile()
      file.items.push(
        { ...file.items[0], artId: 'D0000000-1111-4222-8333-444455556666', width: 9, photoPath: null },
        { ...file.items[0], artId: 'E0000000-1111-4222-8333-444455556666', normal: [0, 0, 0], photoPath: null },
        { ...file.items[0], artId: 'F0000000-1111-4222-8333-444455556666', photoPath: 'art/F0000000-1111-4222-8333-444455556666.jpg' }, // not listed
      )
      const { room, warnings } = await load(await makePackage({ wallArt: file }))
      expect(room.objects.filter((o) => o.category === 'wall-art').map((o) => o.id)).toEqual([ART])
      expect(warnings.filter((w) => /wall art/.test(w))).toEqual(["3 pieces of wall art couldn't be read and were left out."])
    })

    it('imports without wall art, with a warning, when wallArt.json is malformed', async () => {
      for (const wallArt of ['{not json', { ...wallArtFile(), schemaVersion: 2 }, { ...wallArtFile(), captureId: PHOTO }]) {
        const { room, evidence, warnings } = await load(await makePackage({ wallArt }))
        expect(room.objects.some((o) => o.category === 'wall-art')).toBe(false)
        expect(room.walls).toHaveLength(4)
        expect(evidence.artPhotos).toEqual([])
        expect(warnings).toContain("The package's wall art couldn't be read, so it was left out.")
      }
    })

    it('leaves a package without wallArt.json unchanged', async () => {
      const { room, evidence, warnings } = await load(await makePackage())
      expect(room.objects.some((o) => o.category === 'wall-art')).toBe(false)
      expect(evidence.artPhotos).toEqual([])
      expect(warnings.join(' ')).not.toMatch(/wall art/)
    })

    it('rejects art photos outside the art/<uuid>.jpg layout', async () => {
      const bytes = await makePackage({ mutateManifest: (m) => { m.files.push({ path: 'art/../x.jpg', mediaType: 'image/jpeg', byteCount: 1, sha256: '0'.repeat(64) }) } })
      expect((await parseRoomflowPackage(bytes)).ok).toBe(false)
    })
  })
})
