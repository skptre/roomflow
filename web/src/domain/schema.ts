/**
 * Runtime schemas for data crossing boundaries (imports, saves, catalog data).
 * Types are derived with z.infer so validation and types cannot drift.
 * Coordinate conventions are documented in ./units.ts.
 */
import { z } from 'zod'

const Id = z.string().min(1)
/** Zod 4 numbers already reject NaN and ±Infinity. */
const Meters = z.number()
const PositiveMeters = z.number().positive()
const IsoTimestamp = z.iso.datetime()
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const MeasurementSource = z.enum(['captured', 'merchant', 'user', 'estimated', 'unknown'])
export type MeasurementSource = z.infer<typeof MeasurementSource>

/** Physical size. width = local X, height = Y, depth = local Z (meters). */
export const Dimensions = z.object({
  width: PositiveMeters,
  height: PositiveMeters,
  depth: PositiveMeters,
  source: MeasurementSource,
})
export type Dimensions = z.infer<typeof Dimensions>

/** Price in integer minor units (e.g. cents) with an ISO 4217 currency code. */
export const Money = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
})
export type Money = z.infer<typeof Money>

export const Vec2 = z.object({ x: Meters, z: Meters })
export type Vec2 = z.infer<typeof Vec2>

export const Vec3 = z.object({ x: Meters, y: Meters, z: Meters })

/** Bottom-center position and yaw about +Y (radians, counter-clockwise from above). */
export const Pose = z.object({ position: Vec3, yaw: z.number() })

/** A wall as a floor-plan segment. thickness 0 means "not captured"; renderers pick a default. */
export const Wall = z.object({
  id: Id,
  start: Vec2,
  end: Vec2,
  height: PositiveMeters,
  thickness: z.number().nonnegative(),
  /** True when one side faces outside the floor polygon (eligible for cutaway). */
  exterior: z.boolean(),
})
export type Wall = z.infer<typeof Wall>

/**
 * A door, window, or open passage in a wall. offsetAlongWall is the distance
 * from the wall's start point to the opening's center; bottom is its sill
 * height above the floor.
 */
export const Opening = z.object({
  id: Id,
  kind: z.enum(['door', 'window', 'opening']),
  wallId: Id,
  offsetAlongWall: Meters,
  bottom: z.number().nonnegative(),
  width: PositiveMeters,
  height: PositiveMeters,
})
export type Opening = z.infer<typeof Opening>

export const AssetRef = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('parametric'),
    assemblyId: Id,
    /** Color swaps for a finish variant or a photographed item's tint: { '#authored': '#shown' } (lowercase). */
    recolor: z.record(HexColor, HexColor).optional(),
  }),
  z.object({ kind: z.literal('glb'), url: z.string().min(1), attribution: z.string().optional() }),
  z.object({ kind: z.literal('placeholder') }),
])
export type AssetRef = z.infer<typeof AssetRef>

/** How closely the rendered model matches the real object (separate from measurement provenance). */
export const Fidelity = z.enum(['exact', 'approximate', 'placeholder'])
export type Fidelity = z.infer<typeof Fidelity>

export const SourceKind = z.enum(['captured', 'product', 'owned', 'found'])
export type SourceKind = z.infer<typeof SourceKind>

export const RoomObject = z.object({
  id: Id,
  name: z.string(),
  category: z.string().min(1),
  sourceKind: SourceKind,
  dimensions: Dimensions,
  pose: Pose,
  asset: AssetRef,
  fidelity: Fidelity,
  variantId: Id.optional(),
  offerId: Id.optional(),
  quantity: z.number().int().positive(),
  /** Keep: preserve in future proposals (may still move). */
  keep: z.boolean(),
  /** Lock placement: automated changes may not move or rotate it. */
  lockPlacement: z.boolean(),
  foundItemId: Id.optional(),
})
export type RoomObject = z.infer<typeof RoomObject>

export const Finishes = z.object({
  wall: HexColor,
  floor: HexColor,
  accent: HexColor.optional(),
})
export type Finishes = z.infer<typeof Finishes>

export const Room = z
  .object({
    id: Id,
    name: z.string(),
    floorPolygon: z.array(Vec2).min(3),
    walls: z.array(Wall),
    openings: z.array(Opening),
    objects: z.array(RoomObject),
    finishes: Finishes,
    source: z.object({
      kind: z.enum(['roomplan', 'synthetic']),
      importedAt: IsoTimestamp,
      /** Original capture payload, kept untouched for recovery. */
      raw: z.unknown(),
      /** Translation applied to native capture coordinates: app = native + nativeToApp. */
      nativeToApp: Vec3.optional(),
    }),
  })
  .superRefine((room, ctx) => {
    const wallIds = new Set(room.walls.map((wall) => wall.id))
    room.openings.forEach((opening, index) => {
      if (!wallIds.has(opening.wallId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['openings', index, 'wallId'],
          message: `opening ${opening.id} references unknown wall ${opening.wallId}`,
        })
      }
    })
    const seen = new Set<string>()
    room.objects.forEach((object, index) => {
      if (seen.has(object.id)) {
        ctx.addIssue({ code: 'custom', path: ['objects', index, 'id'], message: `duplicate object id ${object.id}` })
      }
      seen.add(object.id)
    })
  })
export type Room = z.infer<typeof Room>

export const Product = z.object({
  id: Id,
  name: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()),
  images: z.array(z.string()).optional(),
})
export type Product = z.infer<typeof Product>

/** A purchasable configuration. A different size or finish is a different variant. */
export const Variant = z.object({
  id: Id,
  productId: Id,
  label: z.string(),
  dimensions: Dimensions,
  asset: AssetRef,
})
export type Variant = z.infer<typeof Variant>

/** One merchant's price for a variant at a point in time. price null = unknown, never zero. */
export const Offer = z.object({
  id: Id,
  variantId: Id,
  merchant: z.string().min(1),
  url: z.url().optional(),
  price: Money.nullable(),
  retrievedAt: IsoTimestamp,
  isSample: z.boolean(),
})
export type Offer = z.infer<typeof Offer>

/** Something the user found in person. No merchant link or price is invented. */
export const FoundItem = z.object({
  id: Id,
  name: z.string().min(1),
  category: z.string().min(1),
  photoRef: z.string().optional(),
  dimensions: Dimensions,
  price: Money.nullable(),
  store: z.string().optional(),
  link: z.url().optional(),
  owned: z.boolean(),
})
export type FoundItem = z.infer<typeof FoundItem>
