import { describe, expect, it } from 'vitest'
import { bedSizeEstimate, completeDimensions, parseOverallDimensions, parseSizeOption, reestimate } from './dimensions'

const IN = 0.0254
const FT = 0.3048

function expectSize(actual: { width?: number; depth?: number; height?: number } | null, inches: { width?: number; depth?: number; height?: number }) {
  expect(actual).not.toBeNull()
  for (const axis of ['width', 'depth', 'height'] as const) {
    if (inches[axis] === undefined) expect(actual![axis], axis).toBeUndefined()
    else expect(actual![axis], axis).toBeCloseTo(inches[axis]! * IN, 6)
  }
}

describe('parseOverallDimensions (real merchant description text)', () => {
  it('reads Poly & Bark overall W × D × H and ignores the detail lines after it', () => {
    const text =
      'Minimal assembly required. Overall Product Dimensions: 113.5" W × 66.25" D × 35" H Product Depth (Mattress Extended): 90.5" Loveseat Depth: 39.5" Inner Storage Dimensions: 52"W x 30.5"D x 6.5"H Seating Dimensions (Inside Arm to Arm): 104.5" W × 19.75" H'
    expectSize(parseOverallDimensions(text), { width: 113.5, depth: 66.25, height: 35 })
  })

  it('reads axes by their letters, not their order (Albany Park lists W × H × D)', () => {
    const text = 'General Dimensions: 85.5"W x 39"H x 79"D Seat Height: 19" Seat Depth: 29" Arm Height: 31" Total Weight(lbs): 381'
    expectSize(parseOverallDimensions(text), { width: 85.5, depth: 79, height: 39 })
  })

  it('never reads box, package, or shipping dimensions', () => {
    const text = 'Box Dimensions: Corner Box 1 (2): 43.5" x 43.5" x 15" Ottoman Box (1): 37.5"W x 37.5"D x 13.25"H'
    expect(parseOverallDimensions(text)).toBeNull()
    expect(parseOverallDimensions('Package Dimensions: 40"W x 20"D x 10"H')).toBeNull()
    expect(parseOverallDimensions('Shipping Dimensions: 40"W x 20"D x 10"H')).toBeNull()
  })

  it('skips inside and seating measurements when an overall line follows', () => {
    const text = 'Seating Dimensions (Inside Arm to Arm): 76.5" W × 19" H Overall Dimensions: 84"W × 40"D × 35"H'
    expectSize(parseOverallDimensions(text), { width: 84, depth: 40, height: 35 })
  })

  it('reads letter-first labels and a diameter', () => {
    expectSize(parseOverallDimensions('Dimensions: W 84" D 38" H 32"'), { width: 84, depth: 38, height: 32 })
    expectSize(parseOverallDimensions('Overall Dimensions: 19.5"Diam x 22"H'), { width: 19.5, depth: 19.5, height: 22 })
  })

  it('keeps a partial listing partial', () => {
    expectSize(parseOverallDimensions('Overall Product Dimensions: 21"D × 23"H Tabletop Thickness: 0.75"'), { depth: 21, height: 23 })
  })

  it('reads centimeters', () => {
    const size = parseOverallDimensions('Dimensions: 200cm W x 90 cm D x 75 cm H')
    expect(size!.width).toBeCloseTo(2.0, 6)
    expect(size!.depth).toBeCloseTo(0.9, 6)
    expect(size!.height).toBeCloseTo(0.75, 6)
  })

  it('treats an unlabeled triple as unknown: stores disagree on axis order', () => {
    expect(parseOverallDimensions('Dimensions: 27" x 25" x 25"')).toBeNull()
  })

  it('returns null when there are no dimensions', () => {
    expect(parseOverallDimensions('Loose bolster cushions cradle the broad seat of the Giorgio accent chair.')).toBeNull()
    expect(parseOverallDimensions('')).toBeNull()
  })
})

describe('parseSizeOption (variant size values)', () => {
  it('reads curtain panels as width × length', () => {
    expectSize(parseSizeOption('50W X 84L', 'curtain'), { width: 50, height: 84 })
    expectSize(parseSizeOption('25W X 120L', 'curtain'), { width: 25, height: 120 })
  })

  it('reads print sizes in inches as width × height', () => {
    expectSize(parseSizeOption('8x10', 'art'), { width: 8, height: 10 })
    expectSize(parseSizeOption('18x24', 'art'), { width: 18, height: 24 })
  })

  it('reads rug sizes in feet and inches as width × depth', () => {
    const cases: [string, number, number][] = [
      ["5' x 8'", 5 * FT, 8 * FT],
      ["2'6\" x 8'", 2.5 * FT, 8 * FT],
      ["1'-9\" x 2'-10\"", 21 * IN, 34 * IN],
      ["5'3\"x7'", 63 * IN, 84 * IN],
      ['6x9', 6 * FT, 9 * FT],
      ['2.5x9', 2.5 * FT, 9 * FT],
    ]
    for (const [text, width, depth] of cases) {
      const size = parseSizeOption(text, 'rug')
      expect(size, text).not.toBeNull()
      expect(size!.width, text).toBeCloseTo(width, 6)
      expect(size!.depth, text).toBeCloseTo(depth, 6)
      expect(size!.height, text).toBeUndefined()
    }
  })

  it('reads round rugs as a diameter', () => {
    const size = parseSizeOption("8' Round", 'rug')
    expect(size!.width).toBeCloseTo(8 * FT, 6)
    expect(size!.depth).toBeCloseTo(8 * FT, 6)
    const small = parseSizeOption("2'-6\" x 2'-6\" Round", 'rug')
    expect(small!.width).toBeCloseTo(30 * IN, 6)
  })

  it('reads pillow sizes written with doubled single quotes as inches', () => {
    expectSize(parseSizeOption("20'' x 20''", 'pillow'), { width: 20, height: 20 })
    expectSize(parseSizeOption('11"x11"', 'pillow'), { width: 11, height: 11 })
  })

  it('reads furniture width options', () => {
    expectSize(parseSizeOption('85" Width', 'furniture'), { width: 85 })
    expectSize(parseSizeOption('Left-Facing, Width: 119.5", Depth: 71.5"', 'furniture'), { width: 119.5, depth: 71.5 })
  })

  it('returns null for names that are not sizes', () => {
    for (const value of ['Standard Pillow', 'Medium', 'Bar', 'Test 1', 'Nested Pair']) {
      expect(parseSizeOption(value, 'furniture'), value).toBeNull()
    }
    expect(parseSizeOption('Queen', 'rug')).toBeNull()
  })
})

describe('bedSizeEstimate', () => {
  it('estimates a frame footprint from the mattress size name', () => {
    const queen = bedSizeEstimate('Queen')!
    expect(queen.width).toBeCloseTo(60 * IN + 0.1, 6)
    expect(queen.depth).toBeCloseTo(80 * IN + 0.15, 6)
  })

  it('picks the larger size in each direction for combined names', () => {
    const size = bedSizeEstimate('King/Cal King')!
    expect(size.width).toBeCloseTo(76 * IN + 0.1, 6)
    expect(size.depth).toBeCloseTo(84 * IN + 0.15, 6)
    expect(bedSizeEstimate('Queen + Headboard')!.width).toBeCloseTo(60 * IN + 0.1, 6)
    expect(bedSizeEstimate('Twin XL')!.depth).toBeCloseTo(80 * IN + 0.15, 6)
  })

  it('returns null when no bed size is named', () => {
    expect(bedSizeEstimate('Walnut')).toBeNull()
  })
})

describe('completeDimensions', () => {
  const typical = { width: 2.0, height: 0.85, depth: 0.9 }

  it('is merchant-sourced only when every axis was listed', () => {
    expect(completeDimensions({ width: 2.2, depth: 1.0, height: 0.8 }, typical)).toEqual({ width: 2.2, depth: 1.0, height: 0.8, source: 'merchant' })
  })

  it('fills missing axes from the typical size and marks the whole size estimated', () => {
    expect(completeDimensions({ width: 2.2 }, typical)).toEqual({ width: 2.2, depth: 0.9, height: 0.85, source: 'estimated' })
    expect(completeDimensions(null, typical)).toEqual({ ...typical, source: 'estimated' })
  })

  it('a thickness no store lists (a print, a rug) does not make a listed face size an estimate', () => {
    const print = { width: 0.6, height: 0.8, depth: 0.04 }
    expect(completeDimensions({ width: 0.254, height: 0.2032 }, print, ['depth'])).toEqual({ width: 0.254, height: 0.2032, depth: 0.04, source: 'merchant' })
    expect(completeDimensions({ width: 0.254 }, print, ['depth'])).toMatchObject({ source: 'estimated' })
  })
})

describe('reestimate', () => {
  const sofa = { width: 2.0, height: 0.85, depth: 0.9 }
  const sectional = { width: 2.8, height: 0.85, depth: 1.7 }

  it('moves only the axes filled from the old typical size', () => {
    expect(reestimate({ ...sofa, source: 'estimated' }, sofa, sectional)).toEqual({ ...sectional, source: 'estimated' })
    expect(reestimate({ ...sofa, width: 2.54, source: 'estimated' }, sofa, sectional)).toEqual({ ...sectional, width: 2.54, source: 'estimated' })
  })

  it('never changes a merchant size', () => {
    expect(reestimate({ ...sofa, source: 'merchant' }, sofa, sectional)).toEqual({ ...sofa, source: 'merchant' })
  })
})
