import { describe, expect, it } from 'vitest'
import { resolvePaletteName } from './palette'

describe('resolvePaletteName', () => {
  it('accepts the defined palettes', () => {
    expect(resolvePaletteName('stone')).toBe('stone')
    expect(resolvePaletteName('clay')).toBe('clay')
  })

  it('falls back to warm for anything else, including inherited object keys', () => {
    expect(resolvePaletteName(null)).toBe('warm')
    expect(resolvePaletteName('constructor')).toBe('warm')
    expect(resolvePaletteName('toString')).toBe('warm')
    expect(resolvePaletteName('__proto__')).toBe('warm')
  })
})
