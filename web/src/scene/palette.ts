/**
 * 3D scene colors. Aesthetic TBD — change here only.
 * Each palette mirrors a set of UI tokens in src/index.css (the default in
 * `@theme`, alternates under `[data-palette=…]`). Components never hard-code colors.
 * Dev toggle: add ?palette=stone or ?palette=clay to the URL.
 */
const warm = {
  background: '#efe9e1',
  ground: '#e6dfd5',
  wall: '#f4efe8',
  wallSection: '#ddd4c8',
  floor: '#c9a882',
  trim: '#d8cfc3',
  glass: '#cfe0e8',
  selection: '#b5673f',
  hover: '#d99a74',
  invalid: '#b53f3f',
  placeholder: '#b9ada0',
  lightKey: '#fff0e1',
  shadow: '#5a4a3c',
  lightSky: '#fdf8f1',
  lightGround: '#b8a592',
}

type ScenePalette = typeof warm

const stone: ScenePalette = {
  background: '#e7e8e5',
  ground: '#dcdedb',
  wall: '#f1f1ee',
  wallSection: '#d3d6d2',
  floor: '#bca78d',
  trim: '#cfd2cf',
  glass: '#d3e2e6',
  selection: '#4f6f64',
  hover: '#86a397',
  invalid: '#b53f3f',
  placeholder: '#aab0ab',
  lightKey: '#fff6ec',
  shadow: '#48504d',
  lightSky: '#f5f8fa',
  lightGround: '#a6aaa4',
}

const clay: ScenePalette = {
  background: '#ecdfd3',
  ground: '#e2d3c4',
  wall: '#f4e9de',
  wallSection: '#dcc8b6',
  floor: '#a97a52',
  trim: '#d9c5b2',
  glass: '#d8e2e0',
  selection: '#a4512e',
  hover: '#cf8b65',
  invalid: '#b53f3f',
  placeholder: '#bba797',
  lightKey: '#ffecd8',
  shadow: '#5e4434',
  lightSky: '#fdf5ec',
  lightGround: '#b39a82',
}

export const palettes = { warm, stone, clay } as const
export type PaletteName = keyof typeof palettes

/** A requested palette name if it is one of ours (own keys only), otherwise warm. */
export function resolvePaletteName(value: string | null): PaletteName {
  return value !== null && Object.hasOwn(palettes, value) ? (value as PaletteName) : 'warm'
}

/** The palette chosen for this page load (dev toggle via ?palette=…; defaults to warm). */
export const paletteName: PaletteName =
  typeof window === 'undefined' ? 'warm' : resolvePaletteName(new URLSearchParams(window.location.search).get('palette'))

export const palette: ScenePalette = palettes[paletteName]
export type Palette = ScenePalette
