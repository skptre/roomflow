import { describe, expect, it } from 'vitest'
import { COLOR_LEXICON, colorsAgree, hueFamily, matchColor, matchColorParts } from './colors'

describe('color lexicon', () => {
  it('has at least 150 names, every one a valid sRGB hex', () => {
    const names = Object.keys(COLOR_LEXICON)
    expect(names.length).toBeGreaterThanOrEqual(150)
    for (const name of names) {
      expect(name).toBe(name.toLowerCase())
      const entry = COLOR_LEXICON[name]!
      expect(entry.hex).toMatch(/^#[0-9a-f]{6}$/)
      for (const hex of Object.values(entry.byKind ?? {})) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('matchColor', () => {
  it('matches real option values from the harvested catalog', () => {
    expect(matchColor('Walnut - Wood')?.name).toBe('walnut')
    expect(matchColor('Walnut - Wood')?.material).toBe('wood')
    expect(matchColor('Black - Metal')?.name).toBe('black')
    expect(matchColor('Brass - Metal')?.material).toBe('metal')
    expect(matchColor('Georgia Clay - Performance Chenille')?.name).toBe('clay')
    expect(matchColor('Navy Blue - Performance Chenille')?.name).toBe('navy blue')
    expect(matchColor('Oyster White Performance Chenille')?.name).toBe('oyster white')
    expect(matchColor('Midnight Navy Performance Chenille')?.name).toBe('midnight navy')
    expect(matchColor('Heather Charcoal')?.name).toBe('heather charcoal')
    expect(matchColor('Terra Cotta')?.name).toBe('terracotta')
    expect(matchColor('Camel - Top Grain Leather')?.name).toBe('camel')
    expect(matchColor('Natural Oak')?.name).toBe('natural oak')
    expect(matchColor('Blackened Oak')?.name).toBe('blackened oak')
  })

  it('prefers the longest phrase, then the earliest (a stain before its wood species)', () => {
    expect(matchColor('Charcoal Maple')?.name).toBe('charcoal')
    expect(matchColor('Pecan Ash')?.name).toBe('pecan')
    expect(matchColor('Dark Teal Performance Velvet')?.name).toBe('dark teal')
  })

  it('ignores fabric weights and material words when a real color is present', () => {
    expect(matchColor('Light Weight Linen Black Pepper')?.name).toBe('black')
    expect(matchColor('Washed Cotton Velvet Emerald City')?.name).toBe('emerald')
    // The material word is still a color when it is the only one.
    expect(matchColor('Linen')?.name).toBe('linen')
    expect(matchColor('Linen White')?.name).toBe('linen white')
    expect(matchColor('Natural - Wood')?.name).toBe('natural')
    // …but not when it only names the fabric line in front of an unknown color.
    expect(matchColor('Cotton Canvas Moon Dust')).toBeNull()
    expect(matchColor('Light Weight Linen Water Lily')).toBeNull()
    expect(matchColor('Stone Grey - Performance Flatweave')?.name).toBe('stone grey')
  })

  it('reads "natural" by material: pale oak for wood, oat for fabric', () => {
    expect(matchColor('Natural', 'wood')?.hex).toBe(COLOR_LEXICON.natural!.byKind!.wood)
    expect(matchColor('Natural', 'fabric')?.hex).toBe(COLOR_LEXICON.natural!.hex)
  })

  it('applies light/dark modifiers that have no entry of their own', () => {
    const olive = matchColor('Olive')!
    const deep = matchColor('Deep Olive')!
    expect(deep.name).toBe('olive')
    expect(deep.modifier).toBe('dark')
    expect(lightness(deep.hex)).toBeLessThan(lightness(olive.hex))
    const pale = matchColor('Pale Pink')!
    expect(pale.modifier).toBe('light')
    expect(lightness(pale.hex)).toBeGreaterThan(lightness(matchColor('Pink')!.hex))
  })

  it('returns null for names that are not colors', () => {
    for (const value of ['Water Lily', 'Hello Aloe', 'Digital Download', 'COM Fabric', 'Cover Only', 'Queen', '8x10', 'Standard', '']) {
      expect(matchColor(value)).toBeNull()
    }
  })
})

describe('matchColorParts', () => {
  it('splits a two-part value on "/" and matches each part', () => {
    const parts = matchColorParts('Heather Charcoal - Performance Basketweave / Walnut - Wood')
    expect(parts.map((p) => p?.name)).toEqual(['heather charcoal', 'walnut'])
    expect(matchColorParts('Ivory / Mystery').map((p) => p?.name ?? null)).toEqual(['ivory', null])
  })
})

describe('hue families and agreement', () => {
  it('classifies neutrals by lightness and chromatic colors by hue', () => {
    expect(hueFamily('#f2f0eb')).toBe('light-neutral')
    expect(hueFamily('#1d1d1f')).toBe('dark-neutral')
    expect(hueFamily('#25324a')).toBe('blue')
    expect(hueFamily('#5b3a24')).toBe('brown')
    expect(hueFamily('#6b7445')).toBe('green')
  })

  it('agrees on close readings and disagrees on clearly different ones', () => {
    expect(colorsAgree('#25324a', '#2f3b63')).toBe(true) // navy vs indigo-ish navy
    expect(colorsAgree('#5b3a24', '#6e4a30')).toBe(true) // two walnuts
    expect(colorsAgree('#d8ccb4', '#cfc3a8')).toBe(true) // oatmeal under different light
    expect(colorsAgree('#25324a', '#b8643e')).toBe(false) // navy vs terracotta
    expect(colorsAgree('#f2f0eb', '#1d1d1f')).toBe(false) // white vs black
    expect(colorsAgree('#9ca98c', '#b04040')).toBe(false) // sage vs red
    // A muted color next to a neutral of similar lightness is a fair reading.
    expect(colorsAgree('#b3aa9c', '#b8ab92')).toBe(true)
  })
})

function lightness(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510
}
