import { assembly, ball, c, cyl } from './parts'

export const floorLamp = assembly('floor-lamp', 'floor-lamp', [
  cyl('base', [0.7, 0.025, 0.7], [0, 0, 0], c.blackMetal, 'metal'),
  cyl('pole', [0.05, 0.72, 0.05], [0, 0.025, 0], c.brass, 'metal'),
  cyl('shade', [1, 0.25, 1], [0, 0.72, 0], c.linen, 'fabric', { texture: 'weave' }),
  ball('bulb', [0.35, 0.08, 0.35], [0, 0.73, 0], c.white, 'glass'),
  cyl('finial', [0.08, 0.03, 0.08], [0, 0.97, 0], c.brass, 'metal'),
])

export const tableLamp = assembly('table-lamp', 'table-lamp', [
  ball('base', [0.62, 0.46, 0.62], [0, 0, 0], c.clay, 'ceramic'),
  cyl('neck', [0.12, 0.12, 0.12], [0, 0.44, 0], c.brass, 'metal'),
  cyl('shade', [1, 0.44, 1], [0, 0.56, 0], c.linen, 'fabric', { texture: 'weave' }),
])
