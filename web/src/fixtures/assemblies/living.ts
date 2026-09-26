import { assembly, box, c, cyl } from './parts'

export const sofa = assembly('sofa', 'sofa', [
  cyl('leg-fl', [0.03, 0.1, 0.05], [-0.45, 0, 0.4], c.walnut, 'wood'),
  cyl('leg-fr', [0.03, 0.1, 0.05], [0.45, 0, 0.4], c.walnut, 'wood'),
  cyl('leg-bl', [0.03, 0.1, 0.05], [-0.45, 0, -0.4], c.walnut, 'wood'),
  cyl('leg-br', [0.03, 0.1, 0.05], [0.45, 0, -0.4], c.walnut, 'wood'),
  box('base', [0.96, 0.26, 0.92], [0, 0.1, 0.02], c.charcoal, 'fabric', { texture: 'weave' }),
  box('back', [0.92, 0.52, 0.17], [0, 0.34, -0.405], c.charcoal, 'fabric', { texture: 'weave' }),
  box('arm-l', [0.07, 0.6, 0.94], [-0.465, 0.1, 0.01], c.charcoal, 'fabric', { texture: 'weave' }),
  box('arm-r', [0.07, 0.6, 0.94], [0.465, 0.1, 0.01], c.charcoal, 'fabric', { texture: 'weave' }),
  box('seat-l', [0.29, 0.13, 0.7], [-0.29, 0.36, 0.1], c.charcoal, 'fabric', { texture: 'weave' }),
  box('seat-c', [0.29, 0.13, 0.7], [0, 0.36, 0.1], c.charcoal, 'fabric', { texture: 'weave' }),
  box('seat-r', [0.29, 0.13, 0.7], [0.29, 0.36, 0.1], c.charcoal, 'fabric', { texture: 'weave' }),
  box('back-l', [0.29, 0.36, 0.13], [-0.29, 0.48, -0.26], c.charcoal, 'fabric', { texture: 'weave', rotation: [-0.12, 0, 0] }),
  box('back-c', [0.29, 0.36, 0.13], [0, 0.48, -0.26], c.charcoal, 'fabric', { texture: 'weave', rotation: [-0.12, 0, 0] }),
  box('back-r', [0.29, 0.36, 0.13], [0.29, 0.48, -0.26], c.charcoal, 'fabric', { texture: 'weave', rotation: [-0.12, 0, 0] }),
  box('pillow-l', [0.15, 0.27, 0.07], [-0.34, 0.49, -0.12], c.clay, 'fabric', { rotation: [-0.2, 0.15, 0] }),
  box('pillow-r', [0.15, 0.27, 0.07], [0.34, 0.49, -0.12], c.cream, 'fabric', { texture: 'knit', rotation: [-0.2, -0.15, 0] }),
])

export const loungeChair = assembly('lounge-chair', 'lounge-chair', [
  cyl('leg-fl', [0.06, 0.2, 0.06], [-0.42, 0, 0.4], c.walnut, 'wood'),
  cyl('leg-fr', [0.06, 0.2, 0.06], [0.42, 0, 0.4], c.walnut, 'wood'),
  cyl('leg-bl', [0.06, 0.2, 0.06], [-0.42, 0, -0.38], c.walnut, 'wood'),
  cyl('leg-br', [0.06, 0.2, 0.06], [0.42, 0, -0.38], c.walnut, 'wood'),
  box('frame', [0.94, 0.08, 0.92], [0, 0.2, 0], c.walnut, 'wood', { texture: 'woodgrain' }),
  box('arm-l', [0.08, 0.3, 0.86], [-0.46, 0.28, 0.02], c.walnut, 'wood', { texture: 'woodgrain' }),
  box('arm-r', [0.08, 0.3, 0.86], [0.46, 0.28, 0.02], c.walnut, 'wood', { texture: 'woodgrain' }),
  box('seat', [0.82, 0.15, 0.78], [0, 0.28, 0.06], c.cream, 'fabric', { texture: 'knit' }),
  box('back', [0.82, 0.56, 0.16], [0, 0.4, -0.35], c.cream, 'fabric', { texture: 'knit', rotation: [-0.16, 0, 0] }),
  box('lumbar', [0.5, 0.16, 0.08], [0, 0.44, -0.2], c.sage, 'fabric', { rotation: [-0.16, 0, 0] }),
])

export const coffeeTable = assembly('coffee-table', 'coffee-table', [
  box('leg-fl', [0.05, 0.88, 0.08], [-0.44, 0, 0.4], c.walnut, 'wood'),
  box('leg-fr', [0.05, 0.88, 0.08], [0.44, 0, 0.4], c.walnut, 'wood'),
  box('leg-bl', [0.05, 0.88, 0.08], [-0.44, 0, -0.4], c.walnut, 'wood'),
  box('leg-br', [0.05, 0.88, 0.08], [0.44, 0, -0.4], c.walnut, 'wood'),
  box('shelf', [0.88, 0.06, 0.84], [0, 0.2, 0], c.oak, 'wood', { texture: 'woodgrain' }),
  box('book-a', [0.24, 0.1, 0.36], [-0.22, 0.26, 0.05], c.bookBlue, 'matte'),
  box('book-b', [0.2, 0.09, 0.32], [-0.22, 0.36, 0.06], c.cream, 'matte', { rotation: [0, 0.2, 0] }),
  box('basket', [0.26, 0.26, 0.4], [0.24, 0.26, 0], c.sand, 'fabric', { texture: 'weave' }),
  box('top', [1, 0.12, 1], [0, 0.88, 0], c.oak, 'wood', { texture: 'woodgrain' }),
])
