import { assembly, box } from './parts'

/** Neutral measured-box substitutes: no invented throw pillows or accessories. */
function seating(id: string, seats: number) {
  const parts = [
    box('base', [0.96, 0.27, 0.92], [0, 0.02, 0], '#52677d', 'fabric', { texture: 'weave' }),
    box('arm-l', [0.14, 0.58, 0.94], [-0.43, 0.04, 0], '#52677d', 'fabric', { texture: 'weave' }),
    box('arm-r', [0.14, 0.58, 0.94], [0.43, 0.04, 0], '#52677d', 'fabric', { texture: 'weave' }),
    box('back', [0.72, 0.64, 0.18], [0, 0.36, -0.39], '#8091a0', 'fabric', { texture: 'weave' }),
  ]
  for (let i = 0; i < seats; i++) {
    parts.push(box(`seat-${i}`, [0.70 / seats - 0.01, 0.14, 0.70], [-0.35 + (i + 0.5) * 0.70 / seats, 0.27, 0.06], '#52677d', 'fabric', { texture: 'weave' }))
  }
  return assembly(id, seats === 1 ? 'lounge-chair' : 'sofa', parts)
}
export const scannedSeating = [seating('scan-armchair', 1), seating('scan-loveseat', 2), seating('scan-sofa', 3)]
