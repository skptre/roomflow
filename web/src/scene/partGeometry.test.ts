import { describe, expect, it } from 'vitest'
import { bevelRadius, disposePartGeometries, partGeometry } from './partGeometry'

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
