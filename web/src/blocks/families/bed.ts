/** Beds: a frame, a headboard, and made-up bedding (mattress, duvet with a folded edge, pillows). */
import { Shape } from 'three'
import { defineFamily } from '../family'
import { align, cushion, extrudeShape, pillowForm, place, slab } from '../kit'
import { HARD, leg, legGrid } from './shared'

/** Headboard outline (x across, y up) for the shaped styles. */
function headboardShape(style: 'arched' | 'rounded', w: number, h: number, bottom: number): Shape {
  const shape = new Shape().moveTo(-w / 2, bottom).lineTo(w / 2, bottom)
  if (style === 'arched') {
    const rise = Math.min(w * 0.3, (h - bottom) * 0.4)
    shape.lineTo(w / 2, h - rise)
    shape.absellipse(0, h - rise, w / 2, rise, 0, Math.PI, false, 0)
  } else {
    const r = Math.min(0.28, w / 4, (h - bottom) / 2)
    shape.lineTo(w / 2, h - r).quadraticCurveTo(w / 2, h, w / 2 - r, h).lineTo(-w / 2 + r, h).quadraticCurveTo(-w / 2, h, -w / 2, h - r)
  }
  return shape.closePath()
}

export const bed = defineFamily({
  id: 'bed',
  label: 'Bed',
  blocks: {
    headboard: { options: ['panel', 'channel', 'wingback', 'slatted', 'arched', 'rounded', 'none'], default: 'panel' },
    frame: { options: ['legged', 'platform', 'upholstered'], default: 'legged' },
    footboard: { options: ['none', 'low'], default: 'none' },
    pillows: { options: ['2', '4'], default: '2' },
  },
  params: {
    frameHeight: { min: 0.12, max: 0.5, default: 0.3 },
    mattressThickness: { min: 0.12, max: 0.35, default: 0.24 },
    headboardThickness: { min: 0.03, max: 0.15, default: 0.07 },
  },
  slots: {
    frame: { kind: 'wood', color: '#9a7452' },
    headboard: { kind: 'wood', color: '#9a7452' },
    bedding: { kind: 'fabric', color: '#efebe4' },
    pillows: { kind: 'fabric', color: '#f5f2ec' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const style = ctx.block('headboard')
    const frameStyle = ctx.block('frame')
    if (frameStyle === 'upholstered') ctx.suggest('frame', 'fabric', '#c9bfae')
    if (frameStyle === 'upholstered' || style === 'channel' || style === 'wingback') ctx.suggest('headboard', 'fabric', '#c9bfae')
    const soft = frameStyle === 'upholstered' || style === 'channel' || style === 'wingback'

    const hbD = style === 'none' ? 0 : Math.min(ctx.param('headboardThickness'), d * 0.1)
    const back = -d / 2 + hbD
    // Bedding needs room below the listed height; a low headboard caps it.
    const frameH = Math.min(ctx.param('frameHeight'), h * 0.45)
    const mattTop = Math.min(frameH + ctx.param('mattressThickness'), h - 0.06)
    const footboard = ctx.block('footboard') === 'low'
    const front = footboard ? d / 2 - 0.05 : d / 2
    const side = style === 'wingback' ? 0.09 : 0.025

    // Frame.
    if (frameStyle === 'platform') {
      ctx.add('frame', slab(-w / 2 + 0.04, w / 2 - 0.04, 0, 0.05, back + 0.04, front - 0.04, HARD))
      ctx.add('frame', slab(-w / 2, w / 2, 0.05, frameH, back, front, 0.006))
    } else if (frameStyle === 'upholstered') {
      ctx.add('frame', slab(-w / 2 + 0.04, w / 2 - 0.04, 0, 0.05, back + 0.04, front - 0.04, HARD))
      ctx.add('frame', slab(-w / 2, w / 2, 0.05, frameH, back, front, 0.03))
    } else {
      const railBottom = Math.max(0.06, frameH - 0.16)
      ctx.add('frame', slab(-w / 2, w / 2, railBottom, frameH, back, front, 0.006))
      for (const [x, z] of legGrid(-w / 2, w / 2, back, front, 'tapered', 0.02)) ctx.add('frame', leg('tapered', railBottom + 0.002, x, z))
    }

    // Mattress, sunk slightly into the frame so the seam reads as one piece.
    const mattFront = front - 0.02
    ctx.add('bedding', slab(-w / 2 + side, w / 2 - side, frameH - 0.03, mattTop, back + 0.01, mattFront, 0.04))
    // Duvet: covers the lower two thirds, draping a little over the sides and foot; a rolled fold at its head.
    const duvetStart = back + Math.min(0.62, (mattFront - back) * 0.32)
    const drape = Math.min(0.2, mattTop - frameH + 0.02)
    ctx.add('bedding', align(cushion(w - 2 * side + 0.02, drape + 0.035, mattFront - duvetStart + 0.012, 0.035, 0.015), { cx: 0, y0: mattTop - drape, z1: mattFront + 0.012 }))
    ctx.add('bedding', slab(-w / 2 + side - 0.008, w / 2 - side + 0.008, mattTop - 0.02, mattTop + 0.055, duvetStart - 0.06, duvetStart + 0.04, 0.035))

    // Pillows lean against the headboard.
    const across = w < 1.2 ? 1 : 2
    const rows = ctx.block('pillows') === '4' ? 2 : 1
    const pw = Math.min(0.66, (w - 2 * side - 0.04) / across - 0.02)
    const ph = Math.min(0.42, h - mattTop - 0.02)
    if (ph > 0.12) {
      for (let row = 0; row < rows; row++) {
        const height = row === 0 ? ph : ph * 0.82
        for (let i = 0; i < across; i++) {
          const x = across === 1 ? 0 : (i === 0 ? -1 : 1) * (pw / 2 + 0.01)
          const pillow = place(pillowForm(pw, height, 0.14, 'square'), { rx: -0.32 })
          ctx.add('pillows', align(pillow, { cx: x, y0: mattTop - 0.03, z0: back + 0.015 + row * 0.12 }))
        }
      }
    }

    // Footboard.
    if (footboard) ctx.add('frame', slab(-w / 2, w / 2, 0, Math.min(mattTop + 0.1, h), d / 2 - 0.045, d / 2, 0.008))

    // Headboard.
    if (style === 'none') return
    const hb = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, r: number) => ctx.add('headboard', slab(x0, x1, y0, y1, z0, z1, r))
    const z0 = -d / 2
    switch (style) {
      case 'panel':
        hb(-w / 2, w / 2, 0, h, z0, back, soft ? 0.025 : 0.008)
        break
      case 'channel': {
        hb(-w / 2, w / 2, 0, h, z0, z0 + hbD * 0.45, 0.012)
        const count = Math.max(4, Math.round(w / 0.16))
        const pitch = w / count
        for (let i = 0; i < count; i++) hb(-w / 2 + i * pitch + 0.003, -w / 2 + (i + 1) * pitch - 0.003, frameH, h, z0 + hbD * 0.3, back, Math.min(0.04, pitch / 2 - 0.004))
        break
      }
      case 'wingback': {
        hb(-w / 2 + 0.06, w / 2 - 0.06, 0, h - 0.01, z0, back, 0.03)
        for (const sign of [-1, 1]) {
          const x0 = sign < 0 ? -w / 2 : w / 2 - 0.08
          hb(x0, x0 + 0.08, 0, h, z0, Math.min(back + 0.16, front), 0.035)
        }
        break
      }
      case 'slatted': {
        const post = 0.05
        hb(-w / 2, -w / 2 + post, 0, h, z0, back, HARD)
        hb(w / 2 - post, w / 2, 0, h, z0, back, HARD)
        hb(-w / 2 + post - 0.005, w / 2 - post + 0.005, h - 0.08, h - 0.005, z0 + 0.004, back - 0.004, HARD)
        const inner = w - 2 * post
        const slats = Math.max(5, Math.round(inner / 0.1))
        const pitch = inner / slats
        for (let i = 0; i < slats; i++) {
          const cx = -w / 2 + post + (i + 0.5) * pitch
          hb(cx - pitch * 0.3, cx + pitch * 0.3, frameH - 0.02, h - 0.08, z0 + hbD * 0.3, back - hbD * 0.3, 0.003)
        }
        break
      }
      case 'arched':
      case 'rounded':
        ctx.add('headboard', place(extrudeShape(headboardShape(style, w, h, 0), hbD, soft ? 0.02 : 0.008), { z: z0 }))
        break
    }
  },
})
