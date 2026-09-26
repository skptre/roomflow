/**
 * Authoring helpers for hand-made assemblies. Positions are given by their
 * BOTTOM (y) so stacked parts line up exactly; the helper converts to the
 * part center. Unit box: x, z in [-0.5, 0.5], y in [0, 1]; front faces +Z.
 */
import type { Assembly, Part, PartMaterial, PartTexture } from '../../domain/assembly'

type Extra = { rotation?: [number, number, number]; texture?: PartTexture }

function make(shape: Part['shape']) {
  return (
    name: string,
    size: [number, number, number],
    [x, bottom, z]: [number, number, number],
    color: string,
    material: PartMaterial,
    extra: Extra = {},
  ): Part => ({
    name,
    shape,
    size,
    position: [x, bottom + size[1] / 2, z],
    color,
    material,
    ...extra,
  })
}

export const box = make('box')
export const cyl = make('cylinder')
export const ball = make('sphere')

export function assembly(id: string, category: string, parts: Part[]): Assembly {
  return { id, category, generatorVersion: 'hand-v1', parts }
}

/** Shared placeholder palette for authored pieces (aesthetic TBD). */
export const c = {
  oak: '#b48c62',
  oakLight: '#c9a67c',
  walnut: '#7b5a41',
  linen: '#e9e2d6',
  white: '#f3f0ea',
  cream: '#e3d8c6',
  sand: '#d2c1a6',
  charcoal: '#595b61',
  sage: '#9fae96',
  clay: '#c27b58',
  rust: '#a85f42',
  ink: '#34373d',
  brass: '#b8955a',
  blackMetal: '#2f2f31',
  ceramic: '#efebe4',
  leaf: '#5d7f4d',
  leafDark: '#4a6a3e',
  leafLight: '#7b9a62',
  soil: '#4b3b2e',
  mirror: '#c9d3d6',
  bookBlue: '#4f6b8a',
  bookGreen: '#6e8a6a',
  bookOchre: '#c9a24f',
  bookRed: '#a3553f',
  bookGray: '#8f8a84',
} as const
