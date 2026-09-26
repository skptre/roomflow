/**
 * Geometry for assembly parts, built at real size (meters) with rounded edges
 * and box-projected UVs in meters, and cached by shape + size so identical
 * parts across objects share one buffer.
 */
import { BoxGeometry, CylinderGeometry, Euler, Matrix4, SphereGeometry, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Part, PartMaterial } from '../domain/assembly'
import type { Dimensions } from '../domain/schema'

type Size = readonly [number, number, number]

const cache = new Map<string, BufferGeometry>()
const mm = (value: number) => Math.round(value * 1000)

/** Edge rounding in meters: soft for fabric, ~4 mm for hard materials, bounded by the part. */
export function bevelRadius(material: PartMaterial, size: Size): number {
  const smallest = Math.min(...size)
  switch (material) {
    case 'fabric':
      return Math.min(0.03, smallest * 0.25)
    case 'wood':
    case 'matte':
    case 'ceramic':
      return Math.min(0.004, smallest * 0.25)
    case 'metal':
    case 'glass':
      return Math.min(0.002, smallest * 0.25)
    case 'leaf':
      return 0
  }
}

/** Replace UVs with a box projection in meters, choosing the plane each vertex faces. */
function meterUVs(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i))
    const ny = Math.abs(normal.getY(i))
    const nz = Math.abs(normal.getZ(i))
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    if (nx >= ny && nx >= nz) uv.setXY(i, z, y)
    else if (ny >= nz) uv.setXY(i, x, z)
    else uv.setXY(i, x, y)
  }
  uv.needsUpdate = true
}

function build(shape: Part['shape'], [x, y, z]: Size, radius: number): BufferGeometry {
  let geometry: BufferGeometry
  if (shape === 'box') {
    geometry = radius > 0 ? new RoundedBoxGeometry(x, y, z, 2, radius) : new BoxGeometry(x, y, z)
  } else if (shape === 'cylinder') {
    geometry = new CylinderGeometry(0.5, 0.5, 1, 28).scale(x, y, z)
  } else {
    geometry = new SphereGeometry(0.5, 28, 18).scale(x, y, z)
  }
  meterUVs(geometry)
  return geometry
}

/** Cached geometry for a part of the given real size (meters). Do not dispose; see disposePartGeometries. */
export function partGeometry(shape: Part['shape'], size: Size, radius: number): BufferGeometry {
  const key = `${shape}|${mm(size[0])}|${mm(size[1])}|${mm(size[2])}|${mm(radius * 10)}`
  let geometry = cache.get(key)
  if (!geometry) {
    geometry = build(shape, size, radius)
    cache.set(key, geometry)
  }
  return geometry
}

export function disposePartGeometries() {
  for (const geometry of cache.values()) geometry.dispose()
  cache.clear()
}

type ObjectSize = Pick<Dimensions, 'width' | 'height' | 'depth'>

export type PartMesh = {
  geometry: BufferGeometry
  position: [number, number, number]
  rotation: [number, number, number]
}

/**
 * Geometry and placement for one assembly part inside an object of the given
 * size. Unrotated parts are built at real size and positioned (exact, crisp
 * bevels). Rotated parts are rotated in the normalized unit box first and then
 * scaled to the object — the same order the validator checks — with the whole
 * transform baked into the geometry, so a part that validates inside the unit
 * box also renders inside the object's authoritative dimensions.
 */
export function partMesh(part: Part, dims: ObjectSize): PartMesh {
  const scale = [dims.width, dims.height, dims.depth] as const
  const worldSize = [part.size[0] * scale[0], part.size[1] * scale[1], part.size[2] * scale[2]] as const
  const radius = part.shape === 'box' ? bevelRadius(part.material, worldSize) : 0
  const position: [number, number, number] = [part.position[0] * scale[0], part.position[1] * scale[1], part.position[2] * scale[2]]
  if (!part.rotation || part.rotation.every((angle) => angle === 0)) {
    return { geometry: partGeometry(part.shape, worldSize, radius), position, rotation: [0, 0, 0] }
  }

  const key = `baked|${part.shape}|${part.size.join(',')}|${part.position.join(',')}|${part.rotation.join(',')}|${mm(dims.width)}|${mm(dims.height)}|${mm(dims.depth)}|${part.material}`
  let geometry = cache.get(key)
  if (!geometry) {
    // Bevel in unit space so that, once scaled, the rounding stays about as large as the real-size one.
    const unitRadius = radius / Math.max(...scale)
    const [x, y, z] = part.size
    geometry =
      part.shape === 'box'
        ? unitRadius > 0
          ? new RoundedBoxGeometry(x, y, z, 2, Math.min(unitRadius, Math.min(x, y, z) / 2))
          : new BoxGeometry(x, y, z)
        : part.shape === 'cylinder'
          ? new CylinderGeometry(0.5, 0.5, 1, 28).scale(x, y, z)
          : new SphereGeometry(0.5, 28, 18).scale(x, y, z)
    geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...part.rotation)))
    geometry.translate(...part.position)
    geometry.scale(...scale)
    meterUVs(geometry)
    cache.set(key, geometry)
  }
  return { geometry, position: [0, 0, 0], rotation: [0, 0, 0] }
}
