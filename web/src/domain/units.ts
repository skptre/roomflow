/**
 * Application coordinate conventions (single source of truth):
 *
 * - Units are meters.
 * - Right-handed frame, +Y up. The floor is the XZ plane at y = 0.
 * - Yaw is a rotation in radians about +Y. Positive yaw is counter-clockwise
 *   when seen from above (it turns +X toward -Z). Stored yaw is in (-π, π].
 * - An object's origin is the bottom-center of its footprint.
 * - Dimensions are { width: along local X, height: along Y, depth: along local Z }.
 * - An object's front faces local +Z (a bed's headboard and a desk's back are at -Z).
 *
 * RoomPlan data is converted into this frame only in src/import/roomplan.ts.
 */

export type Vec3 = { x: number; y: number; z: number }

/** Position of an object's bottom-center plus its yaw about +Y. */
export type Pose = { position: Vec3; yaw: number }

const TWO_PI = Math.PI * 2

/** Wrap an angle in radians into (-π, π]. */
export function normalizeYaw(rad: number): number {
  if (!Number.isFinite(rad)) throw new RangeError(`yaw must be finite, got ${rad}`)
  const wrapped = rad - TWO_PI * Math.ceil((rad - Math.PI) / TWO_PI)
  // Avoid returning -0 so equality checks stay predictable.
  return wrapped === 0 ? 0 : wrapped
}

/**
 * Convert a column-major 4×4 transform whose translation is the object's
 * geometric center (as RoomPlan exports) into a bottom-center pose.
 * Only the rotation about +Y is kept; RoomPlan objects stand upright.
 */
export function poseFromColumnMajor(m: readonly number[], height: number): Pose {
  if (m.length !== 16 || !m.every(Number.isFinite)) {
    throw new RangeError('transform must be 16 finite numbers')
  }
  if (!Number.isFinite(height) || height < 0) {
    throw new RangeError(`height must be finite and non-negative, got ${height}`)
  }
  // Column 0 is local +X, column 2 is local +Z. For a rotation θ about +Y,
  // m[0] = cos θ and m[8] = sin θ.
  const yaw = normalizeYaw(Math.atan2(m[8]!, m[0]!))
  return {
    position: { x: m[12]!, y: m[13]! - height / 2, z: m[14]! },
    yaw,
  }
}
