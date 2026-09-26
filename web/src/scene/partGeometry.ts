/**
 * Geometry for assembly parts, built at real size (meters) with rounded edges
 * and box-projected UVs in meters, and cached by shape + size so identical
 * parts across objects share one buffer.
 */
import { BoxGeometry, CylinderGeometry, SphereGeometry, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Part, PartMaterial } from '../domain/assembly'

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
