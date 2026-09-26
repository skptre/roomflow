/**
 * 3D scene colors. Aesthetic TBD — change here only.
 * Mirrors the warm neutral tokens in src/index.css; components never hard-code colors.
 */
export const palette = {
  background: '#efe9e1',
  ground: '#e6dfd5',
  wall: '#f4efe8',
  wallCut: '#e9e2d8',
  floor: '#c9a882',
  trim: '#d8cfc3',
  glass: '#cfe0e8',
  selection: '#b5673f',
  hover: '#d99a74',
  invalid: '#b53f3f',
  placeholder: '#b9ada0',
  lightKey: '#fff1e0',
  lightSky: '#fdf8f1',
  lightGround: '#b8a592',
} as const

export type Palette = typeof palette
