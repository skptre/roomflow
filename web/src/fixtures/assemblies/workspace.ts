import type { Part } from '../../domain/assembly'
import { assembly, box, c, cyl } from './parts'

export const desk = assembly('desk', 'desk', [
  box('leg-fl', [0.03, 0.94, 0.05], [-0.47, 0, 0.42], c.blackMetal, 'metal'),
  box('leg-fr', [0.03, 0.94, 0.05], [0.47, 0, 0.42], c.blackMetal, 'metal'),
  box('leg-bl', [0.03, 0.94, 0.05], [-0.47, 0, -0.42], c.blackMetal, 'metal'),
  box('leg-br', [0.03, 0.94, 0.05], [0.47, 0, -0.42], c.blackMetal, 'metal'),
  box('rail-l', [0.03, 0.03, 0.84], [-0.47, 0.1, 0], c.blackMetal, 'metal'),
  box('rail-r', [0.03, 0.03, 0.84], [0.47, 0.1, 0], c.blackMetal, 'metal'),
  box('apron', [0.9, 0.08, 0.86], [0, 0.86, -0.02], c.oak, 'wood', { texture: 'woodgrain' }),
  box('drawer', [0.36, 0.06, 0.02], [0.2, 0.87, 0.42], c.oakLight, 'wood', { texture: 'woodgrain' }),
  box('top', [1, 0.06, 1], [0, 0.94, 0], c.oak, 'wood', { texture: 'woodgrain' }),
])

export const deskChair = assembly('desk-chair', 'desk-chair', [
  cyl('leg-fl', [0.06, 0.46, 0.06], [-0.4, 0, 0.38], c.oak, 'wood'),
  cyl('leg-fr', [0.06, 0.46, 0.06], [0.4, 0, 0.38], c.oak, 'wood'),
  cyl('leg-bl', [0.06, 0.46, 0.06], [-0.4, 0, -0.38], c.oak, 'wood'),
  cyl('leg-br', [0.06, 0.46, 0.06], [0.4, 0, -0.38], c.oak, 'wood'),
  box('stretcher', [0.8, 0.03, 0.04], [0, 0.16, 0], c.oak, 'wood'),
  box('seat-frame', [0.9, 0.04, 0.88], [0, 0.46, 0], c.oak, 'wood', { texture: 'woodgrain' }),
  box('seat-pad', [0.84, 0.06, 0.8], [0, 0.5, 0.03], c.charcoal, 'fabric', { texture: 'weave' }),
  cyl('post-l', [0.06, 0.46, 0.06], [-0.4, 0.5, -0.4], c.oak, 'wood'),
  cyl('post-r', [0.06, 0.46, 0.06], [0.4, 0.5, -0.4], c.oak, 'wood'),
  box('back', [0.86, 0.26, 0.06], [0, 0.7, -0.41], c.oak, 'wood', { texture: 'woodgrain', rotation: [-0.08, 0, 0] }),
])

const BOOK_COLORS = [c.bookBlue, c.bookGreen, c.bookOchre, c.bookRed, c.bookGray, c.cream, c.ink, c.sand]

/** Deterministic rows of books so the shelf reads as lived-in, not empty. */
function books(shelf: number, bottom: number, count: number, start: number): Part[] {
  const parts: Part[] = []
  let x = start
  for (let i = 0; i < count; i++) {
    const seed = (shelf * 7 + i * 13) % 17
    const width = 0.045 + (seed % 4) * 0.008
    const height = 0.13 + (seed % 5) * 0.012
    const color = BOOK_COLORS[(shelf * 3 + i) % BOOK_COLORS.length]!
    parts.push(box(`book-${shelf}-${i}`, [width, height, 0.7], [x + width / 2, bottom, 0.05], color, 'matte'))
    x += width + 0.004
  }
  return parts
}

/** Bottom of each shelf board; boards are 0.025 thick. */
const SHELF_LEVELS = [0, 0.245, 0.49, 0.735]

export const bookshelf = assembly('bookshelf', 'bookshelf', [
  box('side-l', [0.04, 1, 1], [-0.48, 0, 0], c.oak, 'wood', { texture: 'woodgrain' }),
  box('side-r', [0.04, 1, 1], [0.48, 0, 0], c.oak, 'wood', { texture: 'woodgrain' }),
  box('back', [0.92, 1, 0.03], [0, 0, -0.485], c.oakLight, 'wood', { texture: 'woodgrain' }),
  ...SHELF_LEVELS.map((y, i) => box(`shelf-${i}`, [0.92, 0.025, 0.96], [0, y, 0.01], c.oak, 'wood', { texture: 'woodgrain' })),
  box('top', [1, 0.025, 1], [0, 0.975, 0], c.oak, 'wood', { texture: 'woodgrain' }),
  ...books(0, 0.025, 9, -0.44),
  ...books(1, 0.27, 7, -0.44),
  ...books(2, 0.515, 5, -0.05),
  ...books(3, 0.76, 8, -0.44),
  box('storage-box', [0.26, 0.1, 0.6], [-0.3, 0.515, 0.1], c.sand, 'matte', { texture: 'weave' }),
])
