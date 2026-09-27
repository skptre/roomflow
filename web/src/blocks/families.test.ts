import { Box3 } from 'three'
import { describe, expect, it } from 'vitest'
import { buildParts } from './build'
import type { Size } from './family'
import { FAMILIES, FAMILY_SAMPLES } from './families'

const EXPECTED = ['sofa', 'bed', 'table', 'storage', 'chair', 'lamp', 'planter', 'rug', 'art', 'curtain', 'pillow', 'mirror', 'vase', 'dining-chair', 'throw']

/** Merged bounds of every part, checked against the object's box (±1% of each size, at least 1 mm). */
function expectInside(parts: ReturnType<typeof buildParts>['parts'], size: Size, label: string) {
  const box = new Box3()
  let count = 0
  for (const geometries of parts.values()) {
    for (const geometry of geometries) {
      const position = geometry.getAttribute('position')
      expect(Array.prototype.every.call(position.array, Number.isFinite), `${label}: non-finite vertex`).toBe(true)
      geometry.computeBoundingBox()
      box.union(geometry.boundingBox!)
      count += 1
    }
  }
  expect(count, `${label}: no geometry`).toBeGreaterThan(0)
  const tol = (v: number) => Math.max(0.001, v * 0.01)
  expect(box.min.x, `${label} min.x`).toBeGreaterThanOrEqual(-size.width / 2 - tol(size.width))
  expect(box.max.x, `${label} max.x`).toBeLessThanOrEqual(size.width / 2 + tol(size.width))
  expect(box.min.y, `${label} min.y`).toBeGreaterThanOrEqual(-tol(size.height))
  expect(box.max.y, `${label} max.y`).toBeLessThanOrEqual(size.height + tol(size.height))
  expect(box.min.z, `${label} min.z`).toBeGreaterThanOrEqual(-size.depth / 2 - tol(size.depth))
  expect(box.max.z, `${label} max.z`).toBeLessThanOrEqual(size.depth / 2 + tol(size.depth))
  return box
}

describe('block families', () => {
  it('cover every family in the plan', () => {
    expect(Object.keys(FAMILIES).sort()).toEqual([...EXPECTED].sort())
  })

  for (const id of EXPECTED) {
    describe(id, () => {
      it('has sample sizes, a default for every block and param, and slot colors', () => {
        const family = FAMILIES[id]!
        expect(FAMILY_SAMPLES[id]?.length).toBeGreaterThan(0)
        for (const [name, spec] of Object.entries(family.blocks)) {
          expect(spec.options.length, name).toBeGreaterThan(0)
          if (typeof spec.default === 'string') expect(spec.options, name).toContain(spec.default)
        }
        for (const [name, spec] of Object.entries(family.params)) {
          expect(spec.min, name).toBeLessThanOrEqual(spec.max)
          if (typeof spec.default === 'number') {
            expect(spec.default, name).toBeGreaterThanOrEqual(spec.min)
            expect(spec.default, name).toBeLessThanOrEqual(spec.max)
          }
        }
        for (const slot of Object.values(family.slots)) expect(slot.color).toMatch(/^#[0-9a-f]{6}$/)
      })

      it('stays inside its box for every block option at every sample size', () => {
        const family = FAMILIES[id]!
        for (const size of FAMILY_SAMPLES[id]!) {
          expectInside(buildParts(family, size, {}, {}).parts, size, `${id} default ${JSON.stringify(size)}`)
          for (const [name, spec] of Object.entries(family.blocks)) {
            for (const option of spec.options) {
              const label = `${id} ${name}=${option} ${size.width}×${size.height}×${size.depth}`
              const { parts } = buildParts(family, size, { [name]: option }, {})
              expectInside(parts, size, label)
              for (const slot of parts.keys()) expect(Object.keys(family.slots), label).toContain(slot)
            }
          }
        }
      }, 60_000)

      it('stays inside its box at the extremes of every param', () => {
        const family = FAMILIES[id]!
        const size = FAMILY_SAMPLES[id]![0]!
        for (const [name, spec] of Object.entries(family.params)) {
          for (const value of [spec.min, spec.max]) {
            expectInside(buildParts(family, size, {}, { [name]: value }).parts, size, `${id} ${name}=${value}`)
          }
        }
      }, 60_000)
    })
  }
})

describe('shapes keep their own proportions inside a looser box', () => {
  const extent = (family: string, size: Size, blocks: Record<string, string>) => {
    const box = new Box3()
    for (const geometries of buildParts(FAMILIES[family]!, size, blocks, {}).parts.values()) {
      for (const geometry of geometries) {
        geometry.computeBoundingBox()
        box.union(geometry.boundingBox!)
      }
    }
    return { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z }
  }

  it('a round table top is a circle, even in a long estimated box', () => {
    const e = extent('table', { width: 1.8, height: 0.75, depth: 0.9 }, { top: 'round', base: 'pedestal' })
    expect(e.x).toBeCloseTo(e.z, 2)
    expect(e.x).toBeLessThanOrEqual(0.9 + 0.001)
  })

  it('a round rug is a circle', () => {
    const e = extent('rug', { width: 2.4, height: 0.012, depth: 1.5 }, { shape: 'round' })
    expect(e.x).toBeCloseTo(e.z, 2)
  })

  it('a bowl stays low and a tray stays flat in a tall box', () => {
    const size = { width: 0.15, height: 0.2, depth: 0.15 }
    expect(extent('vase', size, { profile: 'bowl' }).y).toBeLessThanOrEqual(0.15 * 0.5 + 0.001)
    const tray = extent('vase', size, { profile: 'tray' })
    expect(tray.y).toBeLessThanOrEqual(0.06 + 0.001)
    expect(tray.x).toBeCloseTo(0.15, 2)
  })
})

describe('chair swivel base', () => {
  it('stands on one centered disc, not four legs at the corners', () => {
    const size = { width: 0.8, height: 0.8, depth: 0.82 }
    const cases: Record<string, string>[] = [{ base: 'swivel' }, { base: 'swivel', shell: 'barrel' }, { base: 'swivel', form: 'ottoman', top: 'round' }]
    for (const blocks of cases) {
      const legs = buildParts(FAMILIES.chair!, size, blocks, {}).parts.get('legs')!
      const box = new Box3()
      for (const geometry of legs) {
        geometry.computeBoundingBox()
        box.union(geometry.boundingBox!)
      }
      expect(box.max.x - box.min.x, JSON.stringify(blocks)).toBeLessThan(size.width * 0.8)
      expect(Math.abs((box.max.x + box.min.x) / 2), JSON.stringify(blocks)).toBeLessThan(0.02)
    }
  })
})
