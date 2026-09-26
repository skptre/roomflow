import { describe, expect, it } from 'vitest'
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { Part } from '../domain/assembly'
import { bevelRadius, disposePartGeometries, partGeometry, partMesh } from './partGeometry'

function uvSpan(geometry: ReturnType<typeof partGeometry>) {
  const uv = geometry.getAttribute('uv')
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (let i = 0; i < uv.count; i++) {
    minU = Math.min(minU, uv.getX(i))
    maxU = Math.max(maxU, uv.getX(i))
    minV = Math.min(minV, uv.getY(i))
    maxV = Math.max(maxV, uv.getY(i))
  }
  return { u: maxU - minU, v: maxV - minV }
}

describe('partGeometry', () => {
  it('builds a box of the requested size in meters', () => {
    const geometry = partGeometry('box', [2, 0.5, 1], 0.004)
    geometry.computeBoundingBox()
    const size = geometry.boundingBox!.max.clone().sub(geometry.boundingBox!.min)
    expect(size.x).toBeCloseTo(2)
    expect(size.y).toBeCloseTo(0.5)
    expect(size.z).toBeCloseTo(1)
  })

  it('maps UVs in meters so textures keep their scale on any size', () => {
    const span = uvSpan(partGeometry('box', [2, 0.5, 1], 0.004))
    // The largest face (2 m × 1 m) spans 2 m in U.
    expect(span.u).toBeCloseTo(2, 1)
    expect(span.v).toBeGreaterThan(0.9)
  })

  it('reuses one geometry per shape and size', () => {
    expect(partGeometry('cylinder', [0.1, 0.4, 0.1], 0)).toBe(partGeometry('cylinder', [0.1, 0.4, 0.1], 0))
    expect(partGeometry('cylinder', [0.1, 0.4, 0.1], 0)).not.toBe(partGeometry('cylinder', [0.1, 0.5, 0.1], 0))
    disposePartGeometries()
  })
})

describe('bevelRadius', () => {
  it('rounds fabric softly and hard materials by about 4 mm, never beyond the part', () => {
    expect(bevelRadius('fabric', [0.9, 0.2, 0.8])).toBeCloseTo(0.03)
    expect(bevelRadius('wood', [0.9, 0.2, 0.8])).toBeCloseTo(0.004)
    expect(bevelRadius('fabric', [0.9, 0.01, 0.8])).toBeLessThanOrEqual(0.005)
    expect(bevelRadius('leaf', [0.3, 0.3, 0.3])).toBe(0)
  })
})

describe('partMesh', () => {
  function renderedBounds(part: Part, dims: { width: number; height: number; depth: number }) {
    const { geometry, position, rotation } = partMesh(part, dims)
    const matrix = new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(1, 1, 1))
    return new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never).applyMatrix4(matrix)
  }

  const part = (overrides: Partial<Part>): Part => ({
    name: 'p',
    shape: 'box',
    size: [0.8, 0.1, 0.1],
    position: [0, 0.5, 0],
    color: '#aa8866',
    material: 'wood',
    ...overrides,
  })

  it('keeps a rotated part inside the object box at non-uniform dimensions (matches the validator)', () => {
    const dims = { width: 2, height: 1, depth: 0.5 }
    const bounds = renderedBounds(part({ rotation: [0, 0, Math.PI / 2] }), dims)
    expect(bounds.min.y).toBeGreaterThanOrEqual(-1e-6)
    expect(bounds.max.y).toBeLessThanOrEqual(1 + 1e-6)
    expect(bounds.min.x).toBeGreaterThanOrEqual(-1 - 1e-6)
    expect(bounds.max.x).toBeLessThanOrEqual(1 + 1e-6)
  })

  it('places an unrotated part at its authoritative size and position', () => {
    const bounds = renderedBounds(part({}), { width: 2, height: 1, depth: 0.5 })
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(1.6)
    expect((bounds.max.y + bounds.min.y) / 2).toBeCloseTo(0.5)
  })

  it('maps UVs in meters for rotated parts too', () => {
    const { geometry } = partMesh(part({ size: [0.5, 0.5, 0.5], rotation: [0, 0.1, 0] }), { width: 2, height: 1, depth: 1 })
    const uv = geometry.getAttribute('uv')
    let maxU = -Infinity
    let minU = Infinity
    for (let i = 0; i < uv.count; i++) {
      maxU = Math.max(maxU, uv.getX(i))
      minU = Math.min(minU, uv.getX(i))
    }
    // The part is about 1 m wide after scaling, so U spans about 1, not 0.5.
    expect(maxU - minU).toBeGreaterThan(0.9)
    disposePartGeometries()
  })
})
