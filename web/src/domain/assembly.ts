/**
 * Parametric furniture: an object is a list of simple parts laid out in a
 * normalized unit box, then scaled to the product's authoritative dimensions.
 * Unit box: x and z in [-0.5, 0.5], y in [0, 1]; origin at the bottom-center,
 * front of the object faces +Z. Parts are plain data — never code — so hand
 * authored and (later) AI-generated assemblies share one validator.
 */
import { z } from 'zod'

export const MAX_PARTS = 64
/** Parts may overshoot the unit box by this fraction (rounding in authored/generated data). */
const TOLERANCE = 0.01

const Finite = z.number()
const Triple = z.tuple([Finite, Finite, Finite])
const PositiveTriple = z.tuple([z.number().positive(), z.number().positive(), z.number().positive()])

export const PartMaterial = z.enum(['matte', 'wood', 'metal', 'glass', 'fabric', 'ceramic', 'leaf'])
export type PartMaterial = z.infer<typeof PartMaterial>

export const PartTexture = z.enum(['plain', 'woodgrain', 'weave', 'plaster', 'knit'])
export type PartTexture = z.infer<typeof PartTexture>

export const Part = z.object({
  name: z.string().min(1).max(64),
  shape: z.enum(['box', 'cylinder', 'sphere']),
  /** Full extents along local x, y, z as fractions of the object's width, height, depth. */
  size: PositiveTriple,
  /** Center of the part in unit-box coordinates. */
  position: Triple,
  /** Euler XYZ rotation in radians, applied about the part's center. */
  rotation: Triple.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  material: PartMaterial,
  texture: PartTexture.optional(),
})
export type Part = z.infer<typeof Part>

export const Assembly = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  generatorVersion: z.literal('hand-v1'),
  parts: z.array(Part).min(1).max(MAX_PARTS),
})
export type Assembly = z.infer<typeof Assembly>

/** Absolute rotation matrix entries for Euler XYZ (R = Rx · Ry · Rz). */
function absRotation([x, y, zAngle]: readonly [number, number, number]): number[][] {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(zAngle), Math.sin(zAngle)]
  const m = [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ]
  return m.map((row) => row.map(Math.abs))
}

/** Half-extents of the part's axis-aligned bounds after rotation (conservative for round shapes). */
export function rotatedHalfExtents(part: Part): [number, number, number] {
  const half = part.size.map((s) => s / 2) as [number, number, number]
  if (!part.rotation) return half
  const r = absRotation(part.rotation)
  return [0, 1, 2].map((i) => r[i]![0]! * half[0] + r[i]![1]! * half[1] + r[i]![2]! * half[2]) as [number, number, number]
}

export type AssemblyResult = { ok: true; assembly: Assembly } | { ok: false; error: string }

/** Parse and check an assembly: schema, part count, finite numbers, and every part inside the unit box. */
export function validateAssembly(input: unknown): AssemblyResult {
  const parsed = Assembly.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    return { ok: false, error: `Invalid assembly at ${issue.path.join('.') || 'root'}: ${issue.message}` }
  }
  const lower = [-0.5 - TOLERANCE, -TOLERANCE, -0.5 - TOLERANCE]
  const upper = [0.5 + TOLERANCE, 1 + TOLERANCE, 0.5 + TOLERANCE]
  for (const part of parsed.data.parts) {
    const half = rotatedHalfExtents(part)
    for (let axis = 0; axis < 3; axis++) {
      const center = part.position[axis]!
      if (center - half[axis]! < lower[axis]! || center + half[axis]! > upper[axis]!) {
        return { ok: false, error: `Part "${part.name}" extends outside the object's bounds.` }
      }
    }
  }
  return { ok: true, assembly: parsed.data }
}
