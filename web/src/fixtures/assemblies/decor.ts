import { assembly, ball, box, c, cyl } from './parts'

export const rug = assembly('rug', 'rug', [
  box('field', [1, 0.6, 1], [0, 0, 0], c.cream, 'fabric', { texture: 'weave' }),
  box('border', [0.9, 0.2, 0.86], [0, 0.6, 0], c.sand, 'fabric', { texture: 'weave' }),
  box('center', [0.7, 0.2, 0.62], [0, 0.8, 0], c.cream, 'fabric', { texture: 'weave' }),
])

export const plant = assembly('plant', 'plant', [
  cyl('pot', [0.6, 0.3, 0.6], [0, 0, 0], c.ceramic, 'ceramic'),
  cyl('pot-rim', [0.64, 0.03, 0.64], [0, 0.28, 0], c.ceramic, 'ceramic'),
  cyl('soil', [0.54, 0.02, 0.54], [0, 0.295, 0], c.soil, 'matte'),
  cyl('stem', [0.05, 0.3, 0.05], [0, 0.3, 0], c.walnut, 'wood'),
  ball('leaves-a', [0.62, 0.34, 0.62], [0, 0.45, 0], c.leaf, 'leaf'),
  ball('leaves-b', [0.5, 0.3, 0.5], [0.2, 0.63, 0.1], c.leafLight, 'leaf'),
  ball('leaves-c', [0.5, 0.3, 0.5], [-0.2, 0.64, -0.1], c.leafDark, 'leaf'),
  ball('leaves-d', [0.44, 0.28, 0.44], [0.05, 0.71, -0.18], c.leaf, 'leaf'),
  ball('leaves-e', [0.4, 0.26, 0.4], [-0.14, 0.58, 0.22], c.leafLight, 'leaf'),
  ball('leaves-f', [0.34, 0.22, 0.34], [0.12, 0.78, 0.12], c.leafDark, 'leaf'),
])

export const wallArt = assembly('wall-art', 'wall-art', [
  box('frame', [1, 1, 0.8], [0, 0, -0.1], c.walnut, 'wood', { texture: 'woodgrain' }),
  box('canvas', [0.86, 0.88, 0.15], [0, 0.06, 0.37], c.white, 'matte'),
  box('shape-sun', [0.34, 0.3, 0.05], [-0.14, 0.52, 0.47], c.clay, 'matte'),
  box('shape-hill', [0.62, 0.22, 0.05], [0.08, 0.16, 0.47], c.sage, 'matte'),
  box('shape-line', [0.5, 0.05, 0.05], [0.1, 0.4, 0.47], c.ink, 'matte'),
])

export const mirror = assembly('mirror', 'mirror', [
  box('frame', [1, 1, 0.7], [0, 0, -0.15], c.brass, 'metal'),
  box('glass', [0.86, 0.92, 0.3], [0, 0.04, 0.35], c.mirror, 'glass'),
])

export const vase = assembly('vase', 'vase', [
  ball('body', [1, 0.62, 1], [0, 0, 0], c.clay, 'ceramic'),
  cyl('neck', [0.44, 0.34, 0.44], [0, 0.56, 0], c.clay, 'ceramic'),
  cyl('lip', [0.54, 0.1, 0.54], [0, 0.9, 0], c.rust, 'ceramic'),
])
