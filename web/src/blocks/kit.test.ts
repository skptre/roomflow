import { Box3, Shape, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { arcBand, cushion, cylinder, extrudeShape, finish, lathe, pillowForm, place, roundedBox, slab, sphere, tube } from './kit'
import type { BufferGeometry } from 'three'

function bounds(geometry: BufferGeometry) {
  geometry.computeBoundingBox()
  return geometry.boundingBox!
}

function expectBox(box: Box3, min: [number, number, number], max: [number, number, number], tolerance = 1e-4) {
  expect(box.min.x).toBeCloseTo(min[0], 4)
  expect(box.min.y).toBeGreaterThanOrEqual(min[1] - tolerance)
  expect(box.min.z).toBeGreaterThanOrEqual(min[2] - tolerance)
  expect(box.max.x).toBeLessThanOrEqual(max[0] + tolerance)
  expect(box.max.y).toBeLessThanOrEqual(max[1] + tolerance)
  expect(box.max.z).toBeLessThanOrEqual(max[2] + tolerance)
}

describe('kit primitives', () => {
  it('produce indexed geometry with only position and normal', () => {
    const shapes = [
      roundedBox(1, 0.5, 0.4, 0.03),
      cushion(0.6, 0.15, 0.6, 0.03, 0.02),
      lathe([[0, 0], [0.1, 0], [0.12, 0.2], [0, 0.3]]),
      cylinder(0.02, 0.015, 0.3),
      sphere(0.1, 0.1, 0.1),
      tube([new Vector3(0, 0, 0), new Vector3(0, 0.5, 0), new Vector3(0.3, 0.6, 0)], 0.01),
      pillowForm(0.5, 0.5, 0.15, 'square'),
    ]
    for (const geometry of shapes) {
      expect(geometry.index).not.toBeNull()
      expect(Object.keys(geometry.attributes).sort()).toEqual(['normal', 'position'])
      expect(geometry.groups).toHaveLength(0)
    }
  })

  it('roundedBox and slab keep exact real-size extents', () => {
    expectBox(bounds(roundedBox(1, 0.5, 0.4, 0.03)), [-0.5, -0.25, -0.2], [0.5, 0.25, 0.2])
    const box = bounds(slab(-0.3, 0.2, 0.1, 0.4, -0.05, 0.05, 0.004))
    expect(box.min.x).toBeCloseTo(-0.3, 5)
    expect(box.max.x).toBeCloseTo(0.2, 5)
    expect(box.min.y).toBeCloseTo(0.1, 5)
    expect(box.max.y).toBeCloseTo(0.4, 5)
  })

  it('cushion crowns its top without growing past its height', () => {
    const geometry = cushion(0.6, 0.15, 0.6, 0.03, 0.02)
    const box = bounds(geometry)
    expect(box.max.y).toBeLessThanOrEqual(0.075 + 1e-6)
    expect(box.max.y).toBeGreaterThan(0.07)
    expect(box.min.y).toBeCloseTo(-0.075, 5)
    // The crown is highest in the middle: a vertex near the center sits above one near an edge.
    const position = geometry.getAttribute('position')
    let center = -Infinity
    let edge = -Infinity
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i)
      const z = position.getZ(i)
      if (Math.abs(x) < 0.05 && Math.abs(z) < 0.05) center = Math.max(center, position.getY(i))
      if (Math.abs(x) > 0.25 && Math.abs(z) < 0.05) edge = Math.max(edge, position.getY(i))
    }
    expect(center).toBeGreaterThan(edge + 0.005)
  })

  it('extrudeShape keeps the outline and depth even with a bevel', () => {
    const shape = new Shape().moveTo(-0.4, 0).lineTo(0.4, 0).lineTo(0.4, 1).lineTo(-0.4, 1).closePath()
    const box = bounds(extrudeShape(shape, 0.05, 0.01))
    expect(box.min.x).toBeCloseTo(-0.4, 3)
    expect(box.max.x).toBeCloseTo(0.4, 3)
    expect(box.min.y).toBeCloseTo(0, 3)
    expect(box.max.y).toBeCloseTo(1, 3)
    expect(box.min.z).toBeCloseTo(0, 4)
    expect(box.max.z).toBeCloseTo(0.05, 4)
  })

  it('arcBand spans the requested radius and height', () => {
    const box = bounds(arcBand(0.4, 0.05, -Math.PI * 0.75, Math.PI * 0.75, 0.3, 0.01))
    expect(box.max.x).toBeLessThanOrEqual(0.4 + 1e-4)
    expect(box.min.y).toBeCloseTo(0, 3)
    expect(box.max.y).toBeCloseTo(0.3, 3)
  })

  it('pillowForm is thickest in the middle and thin at the seam', () => {
    const box = bounds(pillowForm(0.5, 0.5, 0.15, 'square'))
    expect(box.max.x).toBeLessThanOrEqual(0.25 + 1e-6)
    expect(box.max.y).toBeLessThanOrEqual(0.25 + 1e-6)
    expect(box.max.z).toBeCloseTo(0.075, 3)
    expect(box.min.z).toBeCloseTo(-0.075, 3)
  })

  it('place rotates then translates', () => {
    const geometry = place(roundedBox(1, 0.1, 0.2, 0.01), { y: 1, ry: Math.PI / 2 })
    const box = bounds(geometry)
    expect(box.max.x).toBeCloseTo(0.1, 4)
    expect(box.max.z).toBeCloseTo(0.5, 4)
    expect(box.min.y).toBeCloseTo(0.95, 4)
  })

  it('finish strips uv and groups and indexes the geometry', () => {
    const geometry = finish(extrudeShape(new Shape().moveTo(0, 0).lineTo(1, 0).lineTo(0, 1).closePath(), 0.1, 0))
    expect(geometry.getAttribute('uv')).toBeUndefined()
    expect(geometry.index).not.toBeNull()
  })

  it('rejects non-finite or non-positive sizes', () => {
    expect(() => roundedBox(0, 1, 1, 0.01)).toThrow()
    expect(() => roundedBox(Number.NaN, 1, 1, 0.01)).toThrow()
    expect(() => cylinder(0.1, 0.1, -1)).toThrow()
  })
})
