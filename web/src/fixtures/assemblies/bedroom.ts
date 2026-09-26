import { assembly, ball, box, c, cyl } from './parts'

export const bed = assembly('bed', 'bed', [
  cyl('leg-fl', [0.04, 0.08, 0.03], [-0.46, 0, 0.46], c.walnut, 'wood'),
  cyl('leg-fr', [0.04, 0.08, 0.03], [0.46, 0, 0.46], c.walnut, 'wood'),
  cyl('leg-bl', [0.04, 0.08, 0.03], [-0.46, 0, -0.42], c.walnut, 'wood'),
  cyl('leg-br', [0.04, 0.08, 0.03], [0.46, 0, -0.42], c.walnut, 'wood'),
  box('frame', [1, 0.2, 0.95], [0, 0.08, 0.025], c.oak, 'wood', { texture: 'woodgrain' }),
  box('mattress', [0.96, 0.18, 0.92], [0, 0.28, 0.03], c.white, 'fabric'),
  box('duvet', [0.98, 0.07, 0.64], [0, 0.44, 0.17], c.sage, 'fabric', { texture: 'knit' }),
  box('throw', [0.99, 0.035, 0.17], [0, 0.51, 0.3], c.clay, 'fabric', { texture: 'weave' }),
  box('sheet-fold', [0.97, 0.03, 0.1], [0, 0.46, -0.18], c.linen, 'fabric'),
  box('pillow-l', [0.42, 0.09, 0.15], [-0.235, 0.46, -0.34], c.white, 'fabric', { rotation: [-0.25, 0, 0] }),
  box('pillow-r', [0.42, 0.09, 0.15], [0.235, 0.46, -0.34], c.white, 'fabric', { rotation: [-0.25, 0, 0] }),
  box('cushion', [0.3, 0.14, 0.05], [0, 0.46, -0.24], c.cream, 'fabric', { rotation: [-0.3, 0, 0] }),
  box('headboard', [1, 0.92, 0.05], [0, 0.08, -0.475], c.oak, 'wood', { texture: 'woodgrain' }),
])

export const nightstand = assembly('nightstand', 'nightstand', [
  cyl('leg-fl', [0.07, 0.16, 0.07], [-0.4, 0, 0.38], c.walnut, 'wood'),
  cyl('leg-fr', [0.07, 0.16, 0.07], [0.4, 0, 0.38], c.walnut, 'wood'),
  cyl('leg-bl', [0.07, 0.16, 0.07], [-0.4, 0, -0.4], c.walnut, 'wood'),
  cyl('leg-br', [0.07, 0.16, 0.07], [0.4, 0, -0.4], c.walnut, 'wood'),
  box('body', [1, 0.76, 0.96], [0, 0.16, -0.02], c.oak, 'wood', { texture: 'woodgrain' }),
  box('drawer', [0.9, 0.3, 0.02], [0, 0.56, 0.47], c.oakLight, 'wood', { texture: 'woodgrain' }),
  box('shelf-shadow', [0.9, 0.26, 0.02], [0, 0.22, 0.46], c.walnut, 'matte'),
  ball('knob', [0.08, 0.06, 0.02], [0, 0.68, 0.48], c.brass, 'metal'),
  box('top', [1, 0.08, 1], [0, 0.92, 0], c.oak, 'wood', { texture: 'woodgrain' }),
])

function drawerRow(row: number, bottom: number) {
  return [
    box(`drawer-${row}-l`, [0.47, 0.25, 0.02], [-0.245, bottom, 0.47], c.oakLight, 'wood', { texture: 'woodgrain' }),
    box(`drawer-${row}-r`, [0.47, 0.25, 0.02], [0.245, bottom, 0.47], c.oakLight, 'wood', { texture: 'woodgrain' }),
    box(`pull-${row}-l`, [0.14, 0.02, 0.02], [-0.245, bottom + 0.2, 0.48], c.brass, 'metal'),
    box(`pull-${row}-r`, [0.14, 0.02, 0.02], [0.245, bottom + 0.2, 0.48], c.brass, 'metal'),
  ]
}

export const dresser = assembly('dresser', 'dresser', [
  cyl('leg-fl', [0.05, 0.1, 0.06], [-0.45, 0, 0.4], c.walnut, 'wood'),
  cyl('leg-fr', [0.05, 0.1, 0.06], [0.45, 0, 0.4], c.walnut, 'wood'),
  cyl('leg-bl', [0.05, 0.1, 0.06], [-0.45, 0, -0.4], c.walnut, 'wood'),
  cyl('leg-br', [0.05, 0.1, 0.06], [0.45, 0, -0.4], c.walnut, 'wood'),
  box('body', [1, 0.86, 0.96], [0, 0.1, -0.02], c.oak, 'wood', { texture: 'woodgrain' }),
  ...drawerRow(0, 0.12),
  ...drawerRow(1, 0.39),
  ...drawerRow(2, 0.66),
  box('top', [1, 0.04, 1], [0, 0.96, 0], c.walnut, 'wood', { texture: 'woodgrain' }),
])
