/** Case goods: dressers, nightstands, credenzas, cabinets, bookcases. A carcass, fronts, pulls, and a base. */
import { defineFamily } from '../family'
import { slab } from '../kit'
import { HARD, handle, leg, legGrid, type HandleStyle, type LegStyle } from './shared'

const FRONT = 0.018
const REVEAL = 0.004

export const storage = defineFamily({
  id: 'storage',
  label: 'Storage',
  blocks: {
    layout: { options: ['drawers', 'doors', 'mixed', 'drawer-shelf', 'shelves'], default: 'drawers' },
    handles: { options: ['knob', 'bar', 'edge', 'none'], default: 'knob' },
    base: { options: ['legs', 'plinth', 'feet', 'none'], default: 'legs' },
    legStyle: { options: ['tapered', 'straight', 'block', 'metal'], default: 'tapered' },
  },
  params: {
    rows: { min: 1, max: 7, integer: true, default: (size) => Math.round((size.height - 0.15) / 0.22) },
    cols: { min: 1, max: 4, integer: true, default: (size) => Math.round(size.width / 0.55) },
    baseHeight: {
      min: 0,
      max: 0.35,
      default: (_, blocks) => (blocks.base === 'legs' ? 0.14 : blocks.base === 'plinth' ? 0.06 : blocks.base === 'feet' ? 0.04 : 0),
    },
    topThickness: { min: 0.012, max: 0.05, default: 0.022 },
  },
  slots: {
    body: { kind: 'wood', color: '#a7805b' },
    fronts: { kind: 'wood', color: '#a7805b' },
    handles: { kind: 'metal', color: '#b08d57' },
    base: { kind: 'wood', color: '#a7805b' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const layout = ctx.block('layout')
    const baseKind = ctx.block('base')
    const style = ctx.block('legStyle') as LegStyle
    const pulls = ctx.block('handles') as HandleStyle
    if (style === 'metal' && baseKind === 'legs') ctx.suggest('base', 'metal', '#2b2b2c')
    const baseH = baseKind === 'none' ? 0 : Math.min(ctx.param('baseHeight'), h * 0.4)
    const t = Math.min(ctx.param('topThickness'), (h - baseH) * 0.2)
    const top = h - t

    // Top slab and carcass (the carcass sits behind the fronts).
    ctx.add('body', slab(-w / 2, w / 2, top, h, -d / 2, d / 2, HARD))
    // Fronts sit back far enough that the pulls stay inside the listed depth.
    const face = d / 2 - (pulls === 'knob' ? 0.026 : pulls === 'bar' ? 0.03 : pulls === 'edge' ? 0.014 : 0.004)
    if (layout === 'shelves') {
      // Open bookcase: sides, bottom, back, and evenly spaced shelves.
      const side = 0.02
      ctx.add('body', slab(-w / 2 + 0.002, -w / 2 + 0.002 + side, baseH, top + 0.001, -d / 2, face, HARD))
      ctx.add('body', slab(w / 2 - 0.002 - side, w / 2 - 0.002, baseH, top + 0.001, -d / 2, face, HARD))
      ctx.add('body', slab(-w / 2 + 0.002 + side - 0.001, w / 2 - 0.002 - side + 0.001, baseH, baseH + side, -d / 2 + 0.01, face, HARD))
      ctx.add('body', slab(-w / 2 + 0.004, w / 2 - 0.004, baseH, top + 0.001, -d / 2, -d / 2 + 0.01, 0.002))
      const rows = ctx.param('rows')
      const pitch = (top - baseH - side) / rows
      for (let i = 1; i < rows; i++) {
        const y = baseH + side + i * pitch
        ctx.add('body', slab(-w / 2 + 0.002 + side - 0.001, w / 2 - 0.002 - side + 0.001, y - 0.018, y, -d / 2 + 0.01, face - 0.01, HARD))
      }
    } else {
      // A drawer over an open cubby builds its own carcass (below) so the cubby stays open.
      if (layout !== 'drawer-shelf') ctx.add('body', slab(-w / 2 + 0.003, w / 2 - 0.003, baseH, top + 0.001, -d / 2, face - FRONT, HARD))
      // Fronts fill the carcass face, leaving a thin frame at the sides and bottom.
      const x0 = -w / 2 + 0.012
      const x1 = w / 2 - 0.012
      const y0 = baseH + 0.012
      const y1 = top - REVEAL
      const drawer = (fx0: number, fx1: number, fy0: number, fy1: number, vertical = false, pullX?: number) => {
        ctx.add('fronts', slab(fx0, fx1, fy0, fy1, face - FRONT, face, 0.003))
        const px = pullX ?? (fx0 + fx1) / 2
        const py = vertical ? (fy0 + fy1) / 2 + Math.min(0.1, (fy1 - fy0) * 0.15) : fy1 - Math.min(0.06, (fy1 - fy0) * 0.35)
        const length = vertical ? Math.min(0.2, (fy1 - fy0) * 0.35) : Math.min(0.14, (fx1 - fx0) * 0.35)
        const pull = handle(pulls, px, py, face, vertical, pulls === 'edge' ? Math.min(0.08, (fx1 - fx0) * 0.3) : length)
        if (pull) ctx.add('handles', pull)
      }
      const grid = (gx0: number, gx1: number, gy0: number, gy1: number, rows: number, cols: number) => {
        const cw = (gx1 - gx0 - REVEAL * (cols - 1)) / cols
        const rh = (gy1 - gy0 - REVEAL * (rows - 1)) / rows
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const fx0 = gx0 + c * (cw + REVEAL)
            const fy0 = gy0 + r * (rh + REVEAL)
            drawer(fx0, fx0 + cw, fy0, fy0 + rh)
          }
        }
      }
      const doors = (gx0: number, gx1: number, gy0: number, gy1: number, count: number) => {
        const cw = (gx1 - gx0 - REVEAL * (count - 1)) / count
        for (let c = 0; c < count; c++) {
          const fx0 = gx0 + c * (cw + REVEAL)
          // Pulls sit near the meeting edge of each pair of doors.
          const pullX = count === 1 ? fx0 + cw - 0.05 : c % 2 === 0 ? fx0 + cw - 0.04 : fx0 + 0.04
          drawer(fx0, fx0 + cw, gy0, gy1, true, pullX)
        }
      }
      const rows = ctx.param('rows')
      const cols = ctx.param('cols')
      const drawerRow = Math.min(0.2, (y1 - y0) * 0.3)
      switch (layout) {
        case 'drawers':
          grid(x0, x1, y0, y1, rows, cols)
          break
        case 'doors':
          doors(x0, x1, y0, y1, Math.max(1, cols))
          break
        case 'mixed':
          grid(x0, x1, y1 - drawerRow, y1, 1, cols)
          doors(x0, x1, y0, y1 - drawerRow - REVEAL, Math.max(1, cols))
          break
        case 'drawer-shelf': {
          // One drawer between the side panels, over an open cubby: sides, floor and back, open at the front.
          const side = 0.02
          const ix0 = -w / 2 + 0.002 + side
          const ix1 = w / 2 - 0.002 - side
          const split = y1 - drawerRow - REVEAL
          ctx.add('body', slab(-w / 2 + 0.002, ix0, baseH, top + 0.001, -d / 2, face, HARD))
          ctx.add('body', slab(ix1, w / 2 - 0.002, baseH, top + 0.001, -d / 2, face, HARD))
          ctx.add('body', slab(ix0 - 0.001, ix1 + 0.001, split, top + 0.001, -d / 2, face - FRONT, HARD))
          ctx.add('body', slab(ix0 - 0.001, ix1 + 0.001, baseH, baseH + side, -d / 2 + 0.01, face, HARD))
          ctx.add('body', slab(-w / 2 + 0.004, w / 2 - 0.004, baseH, split + 0.001, -d / 2, -d / 2 + 0.01, 0.002))
          grid(ix0 + REVEAL, ix1 - REVEAL, y1 - drawerRow, y1, 1, 1)
          break
        }
      }
    }

    // Base.
    if (baseH <= 0.004) return
    if (baseKind === 'plinth') {
      ctx.add('base', slab(-w / 2 + 0.03, w / 2 - 0.03, 0, baseH + 0.001, -d / 2 + 0.03, d / 2 - 0.03, HARD))
    } else if (baseKind === 'feet') {
      for (const [x, z] of legGrid(-w / 2, w / 2, -d / 2, d / 2, 'block', 0.01)) ctx.add('base', slab(x - 0.03, x + 0.03, 0, baseH + 0.001, z - 0.03, z + 0.03, HARD))
    } else {
      for (const [x, z] of legGrid(-w / 2, w / 2, -d / 2, d / 2, style, 0.02)) ctx.add('base', leg(style, baseH + 0.001, x, z))
    }
  },
})
