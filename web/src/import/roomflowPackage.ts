/**
 * RoomFlow room package import (`<capture-id>.roomflow.zip`, schema v1; contract: docs/ios-room-package.md).
 *
 * The package wraps the untouched RoomPlan capture with optional evidence from the phone: reference
 * photos with camera calibration, projected object regions, approximate colors, and user-supplied names.
 * Geometry always comes from `capture.roomplan.json` through the same importer as a plain .json file;
 * evidence never changes measurements or categories. Every listed file is checked against its SHA-256.
 * Optional `wallArt.json` adds wall art the phone measured (format: .superpowers/sdd/wall-art-package/format.md).
 */
import { z } from 'zod'
import { recipeAsset } from '../blocks/registry'
import { Room, type RoomObject } from '../domain/schema'
import type { Vec3 } from '../domain/units'
import { parseRoomPlanJson, type ImportOptions } from './roomplan'
import { DEFAULT_ZIP_LIMITS, readZip, ZipError } from './zip'

/** Whole-package cap: the raw scan plus up to 20 MiB of photos and small JSON files. */
export const MAX_PACKAGE_BYTES = 64 * 1024 * 1024
/** Fewer camera samples than this and the phone's floor color is too unreliable to show. */
export const MIN_FLOOR_SAMPLES = 3

const RAW_PATH = 'capture.roomplan.json'
const EDITABLE_PATH = 'editable.roomflow.json'
const APPEARANCE_PATH = 'appearance.json'
const MANIFEST_PATH = 'manifest.json'
const WALL_ART_PATH = 'wallArt.json'
const ART_PHOTO = /^art\/([0-9A-Fa-f-]{36})\.jpg$/
const WALL_ART_WARNING = "The package's wall art couldn't be read, so it was left out."
/** Wall art thinner than this is drawn this deep so the frame reads (format.md: depth = max(0.03, standoff)). */
const MIN_ART_DEPTH = 0.03
/** Visible clearance from the scanned wall face, avoiding depth-buffer occlusion of a flush art frame. */
const WALL_ART_GAP = 0.01

const Finite = z.number()
const Uuid = z.string().uuid()

const Manifest = z.object({
  schemaVersion: z.literal(1),
  packageId: Uuid,
  captureId: Uuid,
  capturedAt: z.string(),
  units: z.literal('meters'),
  coordinateSpace: z.literal('roomplan-native-v1'),
  selectionRevision: z.number().int().nonnegative(),
  omittedPhotoCount: z.number().int().nonnegative().default(0),
  files: z.array(z.object({
    path: z.string(),
    mediaType: z.string(),
    byteCount: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })).max(64),
  photos: z.array(z.object({
    photoId: Uuid,
    path: z.string(),
    sessionId: Uuid,
    timestamp: Finite,
    pixelWidth: z.number().int().positive(),
    pixelHeight: z.number().int().positive(),
    cameraToWorld: z.array(Finite).length(16),
    intrinsics: z.array(Finite).length(9),
    pixelOrientation: z.literal('sensor-native'),
    trackingContinuous: z.boolean(),
  })).max(64),
  associations: z.array(z.object({
    sourceId: z.string(),
    photoId: Uuid,
    rect: z.array(Finite).length(4),
    method: z.literal('projected-bounds'),
  })).max(10_000),
})

const Appearance = z.object({
  schemaVersion: z.literal(1),
  colors: z.array(z.object({ sourceId: z.string(), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), sampleCount: z.number().int().nonnegative(), provenance: z.string() })).default([]),
  floorColor: z.object({ hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), sampleCount: z.number().int().nonnegative() }).nullish(),
  annotations: z.array(z.object({ sourceId: z.string(), label: z.string().trim().min(1).max(80), provenance: z.literal('user-supplied') })).default([]),
})

const ArtSize = z.number().min(0.05).max(5)
const Vector = z.array(Finite).length(3)
const WallArtItem = z.object({
  artId: Uuid,
  wallSourceId: z.string().nullish(),
  center: Vector,
  normal: Vector.refine((n) => Math.hypot(n[0]!, n[1]!, n[2]!) > 1e-6, 'normal is zero'),
  width: ArtSize,
  height: ArtSize,
  standoff: z.number().min(0).max(1).default(0),
  sightingCount: z.number().int().nonnegative().optional(),
  photoPath: z.string().nullish(),
  method: z.string().optional(),
  provenance: z.string().optional(),
})
type WallArtItem = z.infer<typeof WallArtItem>
/** Items are checked one by one, so one bad item doesn't drop the rest. */
const WallArtFile = z.object({ schemaVersion: z.literal(1), captureId: z.string(), items: z.array(z.unknown()).max(200) })

/** A reference photo from the phone. Pixels are sensor-native; intrinsics describe exactly these pixels. */
export type PackagePhoto = {
  photoId: string
  blob: Blob
  pixelWidth: number
  pixelHeight: number
  /** Camera-to-world in RoomPlan native coordinates, 16 numbers, column-major. */
  cameraToWorld: number[]
  /** 9 numbers, column-major. */
  intrinsics: number[]
  trackingContinuous: boolean
}

/** Where a captured object should appear in a photo: a candidate region, not proof of visibility or identity. */
export type PhotoRegion = { sourceId: string; photoId: string; rect: [number, number, number, number]; method: 'projected-bounds' }

/** Appearance evidence kept beside the room. Room object ids equal RoomPlan source ids. */
export type PackageEvidence = {
  packageId: string
  captureId: string
  photos: PackagePhoto[]
  associations: PhotoRegion[]
  colors: Array<{ sourceId: string; hex: string; sampleCount: number; provenance: string }>
  floorColor: { hex: string; sampleCount: number } | null
  annotations: Array<{ sourceId: string; label: string }>
  /** Straight-on photos of wall art, keyed by the art's id (= its room object id). */
  artPhotos: Array<{ artId: string; blob: Blob }>
}

export type PackageImportResult =
  | { ok: true; room: Room; warnings: string[]; evidence: PackageEvidence }
  | { ok: false; error: string }

/** True when the bytes start with a ZIP local-file signature ("PK\x03\x04"). */
export function isZipArchive(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/** Paths a v1 package may contain (besides manifest.json): the three JSON files and photos/<uuid>.jpg. */
function isAllowedPath(path: string): boolean {
  if (path === RAW_PATH || path === EDITABLE_PATH || path === APPEARANCE_PATH || path === WALL_ART_PATH) return true
  const match = /^photos\/([0-9A-Fa-f-]{36})\.jpg$/.exec(path) ?? ART_PHOTO.exec(path)
  return match !== null && Uuid.safeParse(match[1]).success
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Wall art as room objects, per format.md: native center/normal (RoomPlan frame) moved by `nativeToApp`; a small
 * visual gap keeps its back clear of the wall, `y` is the bottom, and yaw turns local +Z (front) along the normal.
 * Measured estimates, approximate.
 */
function wallArtObject(item: WallArtItem, nativeToApp: Vec3): RoomObject {
  const [nx, ny, nz] = item.normal as [number, number, number]
  const length = Math.hypot(nx, ny, nz)
  const n = { x: nx / length, y: ny / length, z: nz / length }
  const [cx, cy, cz] = item.center as [number, number, number]
  const depth = Math.max(MIN_ART_DEPTH, item.standoff)
  // The wall surface behind the piece, then out by half the depth plus a small render-safe gap.
  const mid = { x: cx - n.x * item.standoff + n.x * (depth / 2 + WALL_ART_GAP), z: cz - n.z * item.standoff + n.z * (depth / 2 + WALL_ART_GAP) }
  return {
    id: item.artId,
    name: 'Wall art',
    category: 'wall-art',
    sourceKind: 'captured',
    dimensions: { width: item.width, height: item.height, depth, source: 'captured' },
    pose: {
      position: { x: mid.x + nativeToApp.x, y: cy + nativeToApp.y - item.height / 2, z: mid.z + nativeToApp.z },
      yaw: Math.atan2(n.x, n.z),
    },
    asset: recipeAsset('wall-art'),
    fidelity: 'approximate',
    quantity: 1,
    keep: true,
    lockPlacement: true,
  }
}

/**
 * Reads optional `wallArt.json`. A malformed file drops all wall art with one warning; invalid items (or ones whose
 * id is already used, or whose photo isn't listed) are dropped with one warning. Never fails the import.
 */
function readWallArt(
  bytes: Uint8Array | undefined,
  captureId: string,
  listed: ReadonlySet<string>,
  takenIds: ReadonlySet<string>,
  warnings: string[],
): WallArtItem[] {
  if (!bytes) return []
  let file: z.infer<typeof WallArtFile>
  try {
    const parsed = WallArtFile.safeParse(JSON.parse(new TextDecoder().decode(bytes)))
    if (!parsed.success || parsed.data.captureId.toLowerCase() !== captureId.toLowerCase()) {
      warnings.push(WALL_ART_WARNING)
      return []
    }
    file = parsed.data
  } catch {
    warnings.push(WALL_ART_WARNING)
    return []
  }
  const items: WallArtItem[] = []
  const seen = new Set(takenIds)
  let dropped = 0
  for (const raw of file.items) {
    const parsed = WallArtItem.safeParse(raw)
    const item = parsed.success ? parsed.data : null
    const photoOk = !item?.photoPath || (ART_PHOTO.test(item.photoPath) && listed.has(item.photoPath))
    if (!item || !photoOk || seen.has(item.artId)) {
      dropped += 1
      continue
    }
    seen.add(item.artId)
    items.push(item)
  }
  if (dropped > 0) warnings.push(`${dropped} piece${dropped === 1 ? '' : 's'} of wall art couldn't be read and ${dropped === 1 ? 'was' : 'were'} left out.`)
  return items
}

function fail(error: string): PackageImportResult {
  return { ok: false, error }
}

/** Opens a `.roomflow.zip`, verifies it against its manifest, and imports the room with its evidence. */
export async function parseRoomflowPackage(bytes: Uint8Array, options: ImportOptions = {}): Promise<PackageImportResult> {
  if (bytes.length > MAX_PACKAGE_BYTES) return fail(`This package is too large to import (limit ${MAX_PACKAGE_BYTES / (1024 * 1024)} MB).`)

  let entries: Map<string, Uint8Array>
  try {
    entries = await readZip(bytes, DEFAULT_ZIP_LIMITS)
  } catch (error) {
    return fail(error instanceof ZipError ? error.message : "This package couldn't be opened.")
  }

  // Everything lives in one "<capture-id>.roomflow/" folder.
  const roots = new Set([...entries.keys()].map((name) => name.split('/')[0]!))
  const root = roots.size === 1 ? [...roots][0]! : ''
  if (!root.endsWith('.roomflow') || !entries.has(`${root}/${MANIFEST_PATH}`)) {
    return fail("This zip isn't a RoomFlow room package.")
  }
  const files = new Map([...entries].map(([name, data]) => [name.slice(root.length + 1), data]))

  let manifestJson: unknown
  try {
    manifestJson = JSON.parse(new TextDecoder().decode(files.get(MANIFEST_PATH)))
  } catch {
    return fail("This package's manifest isn't valid JSON.")
  }
  const parsed = Manifest.safeParse(manifestJson)
  if (!parsed.success) return fail("This package's manifest isn't a supported RoomFlow package (v1, roomplan-native-v1).")
  const manifest = parsed.data
  if (root !== `${manifest.captureId}.roomflow`) return fail("This package's folder doesn't match its capture ID.")

  // The manifest must describe the archive exactly: allowed paths, no duplicates, nothing extra, nothing missing.
  const listed = new Set<string>()
  for (const file of manifest.files) {
    if (!isAllowedPath(file.path)) return fail(`This package lists a file outside the allowed layout (${file.path}).`)
    if (listed.has(file.path)) return fail(`This package lists ${file.path} twice.`)
    listed.add(file.path)
  }
  if (!listed.has(RAW_PATH)) return fail('This package has no RoomPlan scan (capture.roomplan.json).')
  for (const name of files.keys()) {
    if (name !== MANIFEST_PATH && !listed.has(name)) return fail(`This package contains a file its manifest doesn't list (${name}).`)
  }
  for (const file of manifest.files) {
    const data = files.get(file.path)
    if (!data) return fail(`This package is missing ${file.path}.`)
    if (data.length !== file.byteCount || (await sha256Hex(data)) !== file.sha256) {
      return fail(`${file.path} doesn't match its checksum; the package was damaged or changed after export.`)
    }
  }

  // Geometry: the raw scan, through the same importer as a plain .json file.
  const imported = parseRoomPlanJson(new TextDecoder().decode(files.get(RAW_PATH)), {
    ...options,
    id: options.id ?? `room-${manifest.captureId}`,
  })
  if (!imported.ok) return imported
  const warnings = [...imported.warnings]

  let appearance: z.infer<typeof Appearance> = { schemaVersion: 1, colors: [], floorColor: null, annotations: [] }
  const appearanceBytes = files.get(APPEARANCE_PATH)
  if (appearanceBytes) {
    try {
      const result = Appearance.safeParse(JSON.parse(new TextDecoder().decode(appearanceBytes)))
      if (result.success) appearance = result.data
      else warnings.push("The package's colors and names couldn't be read, so they were ignored.")
    } catch {
      warnings.push("The package's colors and names couldn't be read, so they were ignored.")
    }
  }

  // User-supplied names become display names; categories and measurements stay as scanned.
  const objectIds = new Set(imported.room.objects.map((object) => object.id))
  const surfaceIdsForArt = new Set([...objectIds, ...imported.room.walls.map((wall) => wall.id), ...imported.room.openings.map((o) => o.id)])
  // The importer always records nativeToApp; without it the art's position would be unknown, so it is left out.
  const nativeToApp = imported.room.source.nativeToApp
  const art = nativeToApp ? readWallArt(files.get(WALL_ART_PATH), manifest.captureId, listed, surfaceIdsForArt, warnings) : []
  const surfaceIds = new Set([...objectIds, ...imported.room.walls.map((wall) => wall.id)])
  const labels = new Map(appearance.annotations.filter((a) => objectIds.has(a.sourceId)).map((a) => [a.sourceId, a.label]))
  // A floor color the phone sampled often enough replaces the default wood (approximate: lighting affects it).
  const floor = appearance.floorColor && appearance.floorColor.sampleCount >= MIN_FLOOR_SAMPLES ? appearance.floorColor.hex.toLowerCase() : null
  const labelled = Room.safeParse({
    ...imported.room,
    finishes: floor ? { ...imported.room.finishes, floor, floorTexture: 'plain' } : imported.room.finishes,
    objects: [
      ...imported.room.objects.map((object) => (labels.has(object.id) ? { ...object, name: labels.get(object.id)! } : object)),
      ...(nativeToApp ? art.map((item) => wallArtObject(item, nativeToApp)) : []),
    ],
  })
  if (!labelled.success) return fail("This package's names couldn't be applied.")

  const photos: PackagePhoto[] = manifest.photos.flatMap((photo) => {
    const data = files.get(photo.path)
    if (!data || !listed.has(photo.path)) return []
    return [{
      photoId: photo.photoId,
      blob: new Blob([data as BlobPart], { type: 'image/jpeg' }),
      pixelWidth: photo.pixelWidth,
      pixelHeight: photo.pixelHeight,
      cameraToWorld: photo.cameraToWorld,
      intrinsics: photo.intrinsics,
      trackingContinuous: photo.trackingContinuous,
    }]
  })
  const photoIds = new Set(photos.map((photo) => photo.photoId))
  const associations = manifest.associations.filter(
    (a) => photoIds.has(a.photoId) && objectIds.has(a.sourceId) && a.rect.every((v) => v >= 0 && v <= 1),
  ) as PhotoRegion[]
  const dropped = manifest.associations.length - associations.length
  if (dropped > 0) warnings.push(`${dropped} photo region${dropped === 1 ? '' : 's'} pointed at a missing photo or object and ${dropped === 1 ? 'was' : 'were'} ignored.`)

  return {
    ok: true,
    room: labelled.data,
    warnings,
    evidence: {
      packageId: manifest.packageId,
      captureId: manifest.captureId,
      photos,
      associations,
      colors: appearance.colors.filter((c) => surfaceIds.has(c.sourceId)),
      floorColor: appearance.floorColor ?? null,
      annotations: [...labels].map(([sourceId, label]) => ({ sourceId, label })),
      artPhotos: art.flatMap((item) => {
        const data = item.photoPath ? files.get(item.photoPath) : undefined
        return data ? [{ artId: item.artId, blob: new Blob([data as BlobPart], { type: 'image/jpeg' }) }] : []
      }),
    },
  }
}
