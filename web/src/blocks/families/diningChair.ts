/** Dining chairs, desk chairs, and stools: a seat on a frame, with an optional back. */
import { Vector3 } from 'three'
import { defineFamily } from '../family'
import { align, arcBand, cushion, cylinder, lathe, place, slab, sphere, tube } from '../kit'
import { HARD, leg, type LegStyle } from './shared'

export const diningChair = defineFamily({
  id: 'dining-chair',
  label: 'Dining chair',
  blocks: {
    seat: { options: ['flat', 'cushion', 'upholstered'], default: 'flat' },
    back: { options: ['slats', 'spindle', 'solid', 'upholstered', 'open-frame', 'none'], default: 'slats' },
    base: { options: ['four-legs', 'sled', 'pedestal', 'pedestal-star'], default: 'four-legs' },
    legStyle: { options: ['tapered', 'straight', 'block', 'metal'], default: 'tapered' },
  },
  params: {
    // Backless stools sit at their full height; chairs at a standard 46 cm (bar/counter stools set it).
    seatHeight: { min: 0.3, max: 0.85, default: (size, blocks) => (blocks.back === 'none' ? size.height : Math.min(0.46, size.height - 0.3)) },
    seatThickness: { min: 0.015, max: 0.1, default: 0.035 },
  },
  slots: {
    seat: { kind: 'wood', color: '#b08a62' },
    frame: { kind: 'wood', color: '#b08a62' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const backStyle = ctx.block('back')
    const seatStyle = ctx.block('seat')
    const base = ctx.block('base')
    const legStyle = ctx.block('legStyle') as LegStyle
    if (seatStyle !== 'flat') ctx.suggest('seat', 'fabric', '#c9bfae')
    if (base === 'sled' || base === 'pedestal-star' || legStyle === 'metal') ctx.suggest('frame', 'metal', '#2b2b2c')

    const hasBack = backStyle !== 'none' && h > 0.2
    const seatH = hasBack ? Math.min(ctx.param('seatHeight'), h - 0.18) : h
    const st = Math.min(ctx.param('seatThickness'), seatH * 0.2)
    const seatBottom = seatH - st - (seatStyle === 'flat' ? 0 : 0.02)
    const backT = hasBack ? Math.min(0.04, d * 0.1) : 0
    const zBack = -d / 2
    const seatZ0 = zBack + (hasBack ? backT * 0.6 : 0)

    // Seat.
    if (seatStyle === 'flat') {
      ctx.add('seat', slab(-w / 2, w / 2, seatH - st, seatH, seatZ0, d / 2, 0.008))
    } else {
      const padT = seatStyle === 'upholstered' ? Math.min(0.08, seatH * 0.15) : Math.min(0.05, seatH * 0.1)
      ctx.add('frame', slab(-w / 2 + 0.01, w / 2 - 0.01, seatH - padT - 0.02, seatH - padT + 0.002, seatZ0 + 0.01, d / 2 - 0.01, HARD))
      ctx.add('seat', align(cushion(w, padT, d / 2 - seatZ0, Math.min(0.025, padT / 2.5), 0.01), { cx: 0, y0: seatH - padT, z0: seatZ0 }))
    }

    // Base.
    const post = legStyle === 'metal' ? 0.009 : 0.02
    const lx = w / 2 - 0.03
    const zf = d / 2 - 0.035
    const zr = zBack + 0.03
    // Rear legs rise into back posts when the back style needs posts.
    const posts = hasBack && (backStyle === 'slats' || backStyle === 'spindle' || backStyle === 'open-frame')
    if (base === 'four-legs') {
      for (const x of [-lx, lx]) {
        ctx.add('frame', leg(legStyle, seatBottom + 0.002, x, zf))
        ctx.add('frame', leg(legStyle, posts ? h : seatBottom + 0.002, x, zr))
      }
      if (seatH > 0.6) {
        // Stools: a footrest ring of rails.
        const y = Math.min(0.3, seatH * 0.4)
        ctx.add('frame', slab(-lx, lx, y, y + 0.018, zf - 0.008, zf + 0.008, 0.003))
        ctx.add('frame', slab(-lx, lx, y, y + 0.018, zr - 0.008, zr + 0.008, 0.003))
        ctx.add('frame', slab(-lx - 0.008, -lx + 0.008, y, y + 0.018, zr, zf, 0.003))
        ctx.add('frame', slab(lx - 0.008, lx + 0.008, y, y + 0.018, zr, zf, 0.003))
      }
    } else if (base === 'sled') {
      const r = 0.01
      for (const x of [-lx, lx]) {
        ctx.add('frame', tube([new Vector3(x, seatBottom, zf), new Vector3(x, r, zf), new Vector3(x, r, zr), new Vector3(x, posts ? h - r : seatBottom, zr)], r, 10))
      }
    } else if (base === 'pedestal') {
      const footR = Math.min(w, d) / 2 - 0.02
      ctx.add('frame', lathe([[0, 0], [footR, 0], [footR, 0.012], [footR * 0.3, 0.06], [0.03, 0.2], [0.035, seatBottom + 0.002], [0, seatBottom + 0.002]], 40))
    } else {
      // Office base: five spokes on casters, a gas column.
      const reach = Math.min(w, d) / 2 - 0.028
      ctx.add('frame', place(cylinder(0.025, 0.03, seatBottom - 0.06, 20), { y: 0.06 + (seatBottom - 0.06) / 2 }))
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 2
        const spoke = place(slab(0, reach, 0.06, 0.09, -0.018, 0.018, 0.008), { ry: -a })
        ctx.add('frame', spoke)
        ctx.add('frame', place(sphere(0.026, 0.026, 0.026, 12, 8), { x: Math.cos(a) * (reach - 0.002), y: 0.026, z: Math.sin(a) * (reach - 0.002) }))
      }
    }

    if (!hasBack) return
    const backTop = h
    const backBottom = seatH + 0.02
    const px = lx
    switch (backStyle) {
      case 'slats':
      case 'spindle':
      case 'open-frame': {
        if (base !== 'four-legs' && base !== 'sled') {
          // Posts rising from the seat when the base doesn't provide them.
          for (const x of [-px, px]) ctx.add('frame', place(cylinder(post, post, backTop - seatH, 12), { x, y: seatH + (backTop - seatH) / 2, z: zr }))
        }
        const railH = Math.min(0.07, (backTop - backBottom) * 0.3)
        ctx.add('frame', slab(-px, px, backTop - railH, backTop - 0.004, zr - 0.012, zr + 0.012, 0.006))
        if (backStyle === 'open-frame') {
          ctx.add('frame', slab(-px, px, backBottom + 0.06, backBottom + 0.1, zr - 0.01, zr + 0.01, 0.005))
        } else if (backStyle === 'slats') {
          const count = w < 0.5 ? 3 : 4
          const pitch = (2 * px) / (count + 1)
          for (let i = 1; i <= count; i++) ctx.add('frame', slab(-px + i * pitch - 0.018, -px + i * pitch + 0.018, backBottom, backTop - railH + 0.002, zr - 0.008, zr + 0.008, 0.004))
        } else {
          const count = w < 0.5 ? 5 : 7
          const pitch = (2 * px) / (count + 1)
          for (let i = 1; i <= count; i++) ctx.add('frame', place(cylinder(0.007, 0.007, backTop - railH - backBottom + 0.004, 10), { x: -px + i * pitch, y: backBottom + (backTop - railH - backBottom) / 2, z: zr }))
        }
        break
      }
      case 'solid': {
        // Bent back: a shallow curve across the rear, on two short posts.
        const halfChord = w / 2 - 0.01
        const R = Math.max(w * 0.9, halfChord + 0.05)
        const sweep = Math.asin(Math.min(0.99, halfChord / R))
        const top = backTop
        const bottom = seatH + Math.min(0.14, (top - seatH) * 0.35)
        ctx.add('seat', place(arcBand(R, 0.018, Math.PI / 2 - sweep, Math.PI / 2 + sweep, top - bottom, 0.006), { y: bottom, z: zBack + R }))
        if (base !== 'four-legs') for (const x of [-px, px]) ctx.add('frame', place(cylinder(post, post, bottom - seatH + 0.03, 12), { x, y: seatH + (bottom - seatH + 0.03) / 2 - 0.01, z: zr + 0.012 }))
        else for (const x of [-px, px]) ctx.add('frame', leg(legStyle, bottom + 0.03, x, zr))
        break
      }
      case 'upholstered': {
        const thickness = Math.min(0.07, d * 0.14)
        ctx.add('seat', align(place(cushion(w - 0.02, thickness, backTop - backBottom, 0.025, 0.012), { rx: Math.PI / 2 - 0.08 }), { cx: 0, y1: backTop, z0: zBack }))
        if (base !== 'four-legs') for (const x of [-px + 0.04, px - 0.04]) ctx.add('frame', place(cylinder(post, post, 0.12, 12), { x, y: seatH + 0.04, z: zBack + thickness / 2 }))
        break
      }
    }
  },
})
