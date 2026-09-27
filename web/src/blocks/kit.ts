/**
 * Geometry primitives for the building-block library. Everything is in meters,
 * centered on the origin unless a helper says otherwise, and comes out
 * "finished": indexed, position + normal only (no UVs — blocks carry flat
 * colors, see plan D6), no groups — so any set of blocks can be merged into
 * one geometry per material slot.
 */
import {
  BufferAttribute,
  BoxGeometry,
  BufferGeometry,
  CurvePath,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  LatheGeometry,
  LineCurve3,
  Matrix4,
  QuadraticBezierCurve3,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  type Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type Geo = BufferGeometry

/** Surfaces meeting at more than this angle keep a hard edge. */
const CREASE = Math.PI / 4

/**
 * Base shapes are pure functions of their sizes, and a model repeats them
 * (four legs, three cushions), so each is built once and cloned after that.
 * Keys use 0.1 mm steps; the memo is bounded and simply cleared when full.
 */
const memo = new Map<string, Geo>()
const MEMO_LIMIT = 600

function memoized(key: string, make: () => Geo): Geo {
  let base = memo.get(key)
  if (!base) {
    if (memo.size >= MEMO_LIMIT) {
      for (const geometry of memo.values()) geometry.dispose()
      memo.clear()
    }
    base = make()
    memo.set(key, base)
  }
  return base.clone()
}

const k = (...values: number[]) => values.map((v) => Math.round(v * 1e4)).join(',')

function positive(...values: number[]) {
  for (const value of values) {
    if (!(Number.isFinite(value) && value > 0)) throw new Error(`Block size must be a positive number, got ${value}`)
  }
}

/** Strip UVs and groups and index the geometry (merging only identical vertices, so hard edges stay hard). */
export function finish(geometry: Geo): Geo {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name)
  }
  geometry.clearGroups()
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  if (geometry.index) return geometry
  const indexed = mergeVertices(geometry)
  geometry.dispose()
  return indexed
}

/** Smooth normals everywhere (for soft, fully rounded forms). */
function smooth(geometry: Geo): Geo {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position') geometry.deleteAttribute(name)
  }
  geometry.clearGroups()
  const indexed = mergeVertices(geometry)
  geometry.dispose()
  indexed.computeVertexNormals()
  return indexed
}

/** Smooth normals across gentle curves, hard edges where surfaces meet at an angle. */
function creased(geometry: Geo): Geo {
  const result = toCreasedNormals(geometry, CREASE)
  if (result !== geometry) geometry.dispose()
  return finish(result)
}

export type Placement = { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number }

/** Rotate (Euler XYZ about the origin), then translate. Mutates and returns the geometry. */
export function place(geometry: Geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 }: Placement): Geo {
  if (rx || ry || rz) geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(rx, ry, rz)))
  if (x || y || z) geometry.translate(x, y, z)
  return geometry
}

/** Box with rounded edges; the radius is clamped so it always fits. */
export function roundedBox(width: number, height: number, depth: number, radius: number, segments = 3): Geo {
  positive(width, height, depth)
  const r = Math.max(0, Math.min(radius, Math.min(width, height, depth) / 2 - 1e-5))
  return memoized(`box|${k(width, height, depth, r, segments)}`, () => finish(new RoundedBoxGeometry(width, height, depth, r > 0 ? segments : 1, r)))
}

/** Rounded box given by its extents: [x0,x1] × [y0,y1] × [z0,z1]. */
export function slab(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, radius: number, segments?: number): Geo {
  return place(roundedBox(x1 - x0, y1 - y0, z1 - z0, radius, segments), { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 })
}

/**
 * Rounded box with vertices spread over its flat faces too (RoundedBoxGeometry
 * only has vertices in the rounded bands), so the surface can be deformed.
 * Smooth normals. Each axis gets `segments` steps, a third of them in each
 * rounded band.
 */
function softBox(width: number, height: number, depth: number, radius: number, segments = 12): Geo {
  const half = [width / 2, height / 2, depth / 2]
  const inner = half.map((h) => Math.max(0, h - radius))
  const box = new BoxGeometry(2, 2, 2, segments, segments, segments)
  const position = box.getAttribute('position')
  const BAND = 1 / 3
  const p = [0, 0, 0]
  for (let i = 0; i < position.count; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const s = position.getComponent(i, axis)
      const a = Math.abs(s)
      // Inner two thirds of the steps cover the flat part, the outer third the rounded band.
      const t = a <= 1 - BAND ? (a / (1 - BAND)) * inner[axis]! : inner[axis]! + ((a - (1 - BAND)) / BAND) * radius
      p[axis] = Math.sign(s) * t
    }
    // Project the band onto the rounded surface around the inner box.
    const c = p.map((v, axis) => Math.max(-inner[axis]!, Math.min(inner[axis]!, v)))
    const dx = p[0]! - c[0]!
    const dy = p[1]! - c[1]!
    const dz = p[2]! - c[2]!
    const length = Math.hypot(dx, dy, dz)
    if (length > 1e-9) {
      p[0] = c[0]! + (dx / length) * radius
      p[1] = c[1]! + (dy / length) * radius
      p[2] = c[2]! + (dz / length) * radius
    }
    position.setXYZ(i, p[0]!, p[1]!, p[2]!)
  }
  return smooth(box)
}

/**
 * Upholstered cushion: a soft rounded box whose top crowns up by `puff` in
 * the middle. The flat bottom stays put and the total height never exceeds
 * `height`.
 */
export function cushion(width: number, height: number, depth: number, radius: number, puff: number): Geo {
  positive(width, height, depth)
  return memoized(`cushion|${k(width, height, depth, radius, puff)}`, () => makeCushion(width, height, depth, radius, puff))
}

function makeCushion(width: number, height: number, depth: number, radius: number, puff: number): Geo {
  const crown = Math.max(0, Math.min(puff, height * 0.4))
  const body = height - crown
  const r = Math.max(0.001, Math.min(radius, Math.min(width, body, depth) / 2 - 1e-5))
  const geometry = softBox(width, body, depth, r)
  const position = geometry.getAttribute('position')
  const hw = width / 2
  const hd = depth / 2
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const lift = ((y + body / 2) / body) ** 2
    const dome = Math.max(0, 1 - (x / hw) ** 2) * Math.max(0, 1 - (z / hd) ** 2)
    position.setY(i, y + crown * dome * lift - crown / 2)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/** Surface of revolution about +Y from [radius, y] points (bottom to top). */
export function lathe(points: ReadonlyArray<readonly [number, number]>, segments = 48): Geo {
  return memoized(`lathe|${segments}|${k(...points.flat())}`, () => creased(new LatheGeometry(points.map(([r, y]) => new Vector2(Math.max(0, r), y)), segments)))
}

/** Cylinder (or cone frustum) centered on the origin, axis along Y. */
export function cylinder(radiusTop: number, radiusBottom: number, height: number, segments = 24): Geo {
  positive(height, Math.max(radiusTop, radiusBottom))
  return memoized(`cyl|${k(radiusTop, radiusBottom, height, segments)}`, () => finish(new CylinderGeometry(radiusTop, radiusBottom, height, segments)))
}

/** Ellipsoid with semi-axes rx, ry, rz. */
export function sphere(rx: number, ry: number, rz: number, widthSegments = 24, heightSegments = 16): Geo {
  positive(rx, ry, rz)
  return memoized(`sphere|${k(rx, ry, rz, widthSegments, heightSegments)}`, () => smooth(new SphereGeometry(1, widthSegments, heightSegments).scale(rx, ry, rz)))
}

/**
 * Round rod through the points: straight runs joined by rounded corners
 * (radius up to `corner`, never more than 45% of a neighboring run), so it
 * never overshoots the points the way a spline would. Rounded ends.
 */
export function tube(points: readonly Vector3[], radius: number, radialSegments = 10, corner = 0.03): Geo {
  positive(radius)
  const path = new CurvePath<Vector3>()
  let start = points[0]!.clone()
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!
    const at = points[i]!
    const next = points[i + 1]!
    const r = Math.min(corner, prev.distanceTo(at) * 0.45, next.distanceTo(at) * 0.45)
    const into = at.clone().add(prev.clone().sub(at).setLength(r))
    const out = at.clone().add(next.clone().sub(at).setLength(r))
    if (start.distanceTo(into) > 1e-6) path.add(new LineCurve3(start, into))
    path.add(new QuadraticBezierCurve3(into, at.clone(), out))
    start = out
  }
  path.add(new LineCurve3(start, points[points.length - 1]!.clone()))
  const body = finish(new TubeGeometry(path, Math.max(8, path.curves.length * 10), radius, radialSegments, false))
  const first = points[0]!
  const last = points[points.length - 1]!
  const caps = [first, last].map((p) => place(sphere(radius, radius, radius, 10, 6), { x: p.x, y: p.y, z: p.z }))
  const merged = mergeGeometries([body, ...caps])
  ;[body, ...caps].forEach((g) => g.dispose())
  if (!merged) throw new Error('tube: could not merge parts')
  return merged
}

/**
 * Extrude a 2D outline (in the XY plane) along +Z from 0 to `depth`. The
 * bevel rounds the edges inward, so the result keeps the outline and depth
 * exactly.
 */
export function extrudeShape(shape: Shape, depth: number, bevel: number, curveSegments = 32): Geo {
  positive(depth)
  const b = Math.max(0, Math.min(bevel, depth / 2 - 1e-4))
  const geometry = new ExtrudeGeometry(shape, {
    depth: depth - 2 * b,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 3,
    curveSegments,
  })
  geometry.translate(0, 0, b)
  return creased(geometry)
}

/**
 * A curved band standing on the floor: the part of a ring between
 * `outerRadius - thickness` and `outerRadius`, from angle a0 to a1, `height`
 * tall. Angles are measured in the floor plane: 0 = +X, π/2 = −Z (back),
 * −π/2 = +Z (front). Used for barrel backs and curved chair backs.
 */
export function arcBand(outerRadius: number, thickness: number, a0: number, a1: number, height: number, bevel: number): Geo {
  positive(outerRadius, thickness, height)
  const inner = Math.max(0.001, outerRadius - thickness)
  const shape = new Shape()
  shape.absarc(0, 0, outerRadius, a0, a1, false)
  shape.absarc(0, 0, inner, a1, a0, true)
  shape.closePath()
  // Shape XY → floor XZ (y → −z); extrusion Z → up (+Y).
  return extrudeShape(shape, height, bevel).rotateX(-Math.PI / 2)
}

/**
 * A stuffed pillow facing +Z: `width` × `height` outline, `thickness` at the
 * middle, tapering to a seam at the edges, with slightly pulled-in sides.
 */
export function pillowForm(width: number, height: number, thickness: number, shape: 'square' | 'round', resolution = 24): Geo {
  positive(width, height, thickness)
  return memoized(`pillow|${shape}|${k(width, height, thickness, resolution)}`, () => makePillow(width, height, thickness, shape, resolution))
}

function makePillow(width: number, height: number, thickness: number, shape: 'square' | 'round', n: number): Geo {
  const positions: number[] = []
  const index: number[] = []
  for (const side of [1, -1]) {
    const base = positions.length / 3
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * 2 - 1
        const v = (j / n) * 2 - 1
        let x: number
        let y: number
        let fill: number
        if (shape === 'round') {
          // Square grid → disk (elliptical mapping), thickness by radius.
          const du = u * Math.sqrt(1 - (v * v) / 2)
          const dv = v * Math.sqrt(1 - (u * u) / 2)
          x = (du * width) / 2
          y = (dv * height) / 2
          fill = Math.sqrt(Math.max(0, 1 - (du * du + dv * dv)))
        } else {
          x = ((u * width) / 2) * (1 - 0.05 * (1 - v * v))
          y = ((v * height) / 2) * (1 - 0.05 * (1 - u * u))
          fill = Math.sqrt(Math.max(0, 1 - Math.abs(u) ** 3)) * Math.sqrt(Math.max(0, 1 - Math.abs(v) ** 3))
        }
        positions.push(x, y, (side * thickness * fill) / 2)
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i
        const b = a + 1
        const c = a + n + 1
        const d = c + 1
        if (side > 0) index.push(a, b, d, a, d, c)
        else index.push(a, d, b, a, c, d)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(index)
  return smooth(geometry.toNonIndexed())
}

export type Align = { x0?: number; x1?: number; cx?: number; y0?: number; y1?: number; z0?: number; z1?: number; cz?: number }

/** Translate so the geometry's bounding box meets the given edges (x0 = min x, x1 = max x, cx = center x, …). */
export function align(geometry: Geo, edges: Align): Geo {
  geometry.computeBoundingBox()
  const { min, max } = geometry.boundingBox!
  const dx = edges.x0 !== undefined ? edges.x0 - min.x : edges.x1 !== undefined ? edges.x1 - max.x : edges.cx !== undefined ? edges.cx - (min.x + max.x) / 2 : 0
  const dy = edges.y0 !== undefined ? edges.y0 - min.y : edges.y1 !== undefined ? edges.y1 - max.y : 0
  const dz = edges.z0 !== undefined ? edges.z0 - min.z : edges.z1 !== undefined ? edges.z1 - max.z : edges.cz !== undefined ? edges.cz - (min.z + max.z) / 2 : 0
  geometry.translate(dx, dy, dz)
  return geometry
}
