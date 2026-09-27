/** Lamps (floor and table): a shade, a stem, a base. Heights under 1 m read as table lamps. */
import { Vector3 } from 'three'
import { defineFamily } from '../family'
import { cylinder, lathe, place, slab, sphere, tube, type Geo } from '../kit'
import { HARD } from './shared'

const SHELL = 0.003

/** A thin shade shell from its outer profile [radius, y] (bottom → top), open at both ends. */
function shell(outer: Array<[number, number]>): Geo {
  const inner = [...outer].reverse().map(([r, y]): [number, number] => [Math.max(0.001, r - SHELL), y])
  return lathe([...outer, ...inner, outer[0]!], 56)
}

function shadeProfile(style: string, R: number, H: number, y0: number): Array<[number, number]> {
  switch (style) {
    case 'cone':
      return [[R, y0], [R * 0.58, y0 + H]]
    case 'empire':
      return [[R, y0], [R * 0.55, y0 + H]]
    case 'dome': {
      const points: Array<[number, number]> = []
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * (Math.PI / 2)
        points.push([Math.max(R * 0.08, Math.cos(a) * R), y0 + Math.sin(a) * H])
      }
      return points
    }
    default:
      return [[R, y0], [R, y0 + H]]
  }
}

export const lamp = defineFamily({
  id: 'lamp',
  label: 'Lamp',
  blocks: {
    shade: { options: ['drum', 'cone', 'empire', 'dome', 'globe', 'none'], default: 'drum' },
    stem: { options: ['straight', 'arc', 'tripod', 'stacked'], default: 'straight' },
    base: { options: ['round', 'disc', 'square'], default: 'round' },
  },
  params: {
    shadeHeight: { min: 0.08, max: 0.6, default: (size) => Math.min(0.34, size.height * (size.height < 1 ? 0.4 : 0.2)) },
    shadeWidth: { min: 0.1, max: 0.9, default: (size) => Math.min(size.width, size.depth) },
  },
  slots: {
    shade: { kind: 'paper', color: '#f1ebdf' },
    stem: { kind: 'metal', color: '#b08d57' },
    base: { kind: 'ceramic', color: '#e6dfd2' },
  },
  build(ctx) {
    const { w, h, d } = ctx
    const table = h < 1
    const shadeStyle = ctx.block('shade')
    let stemStyle = ctx.block('stem')
    const baseStyle = ctx.block('base')
    const reach = Math.min(w, d) / 2
    const H = shadeStyle === 'none' ? 0.08 : Math.min(ctx.param('shadeHeight'), h * 0.5)
    const R = Math.min(ctx.param('shadeWidth') / 2, reach)
    // An arc needs room to reach sideways; otherwise it stands straight.
    if (stemStyle === 'arc' && (table || w < 2 * R + 0.3)) stemStyle = 'straight'
    if (stemStyle === 'tripod') ctx.suggest('stem', 'wood', '#8b6a4c')
    if (!table || baseStyle === 'disc') ctx.suggest('base', 'metal', '#2b2b2c')

    const shadeX = stemStyle === 'arc' ? w / 2 - R : 0
    const shadeBottom = h - H

    // Shade (or a bare globe bulb).
    if (shadeStyle === 'globe') {
      const r = Math.min(R, H / 2)
      ctx.add('shade', place(sphere(r, r, r, 32, 20), { x: shadeX, y: h - r }))
    } else if (shadeStyle === 'none') {
      ctx.add('shade', place(sphere(0.04, 0.05, 0.04, 20, 14), { x: shadeX, y: h - 0.05 }))
    } else {
      ctx.add('shade', place(shell(shadeProfile(shadeStyle, R, H, shadeBottom)), { x: shadeX }))
    }
    const stemTop = shadeStyle === 'globe' ? h - 2 * Math.min(R, H / 2) + 0.01 : shadeStyle === 'none' ? h - 0.09 : shadeBottom + H * 0.55

    // Base.
    const baseX = stemStyle === 'arc' ? -w / 2 + Math.min(reach, 0.18) : 0
    let stemBottom = 0.03
    if (stemStyle !== 'tripod') {
      if (table && baseStyle === 'round') {
        // Gourd-shaped ceramic body.
        const bodyH = Math.max(0.08, (shadeBottom - 0.02) * 0.82)
        const r = Math.min(reach * 0.62, bodyH * 0.45)
        ctx.add('base', lathe([[0, 0], [r * 0.55, 0], [r * 0.62, bodyH * 0.04], [r, bodyH * 0.38], [r * 0.92, bodyH * 0.62], [r * 0.45, bodyH * 0.9], [r * 0.28, bodyH], [0, bodyH]], 48))
        stemBottom = bodyH
      } else if (table && baseStyle === 'square') {
        const bodyH = Math.max(0.08, (shadeBottom - 0.02) * 0.75)
        const s = Math.min(reach * 0.5, bodyH * 0.35)
        ctx.add('base', slab(-s, s, 0, bodyH, -s, s, HARD))
        stemBottom = bodyH
      } else if (baseStyle === 'square') {
        const s = Math.min(reach * 0.75, 0.16)
        ctx.add('base', slab(baseX - s, baseX + s, 0, 0.025, -s, s, HARD))
        stemBottom = 0.025
      } else {
        const r = Math.min(reach * (table ? 0.6 : 0.78), 0.18)
        ctx.add('base', place(lathe([[0, 0], [r, 0], [r, 0.012], [r * 0.85, 0.028], [0, 0.03]], 48), { x: baseX }))
        stemBottom = 0.028
      }
    }

    // Stem.
    const rod = 0.008
    switch (stemStyle) {
      case 'straight':
        ctx.add('stem', place(cylinder(rod, rod, stemTop - stemBottom + 0.004, 12), { y: (stemTop + stemBottom) / 2 }))
        break
      case 'stacked': {
        // Stacked ceramic spheres up to the shade.
        const count = 3
        const span = stemTop - stemBottom
        const r = Math.min(span / (2 * count), reach * 0.45)
        for (let i = 0; i < count; i++) ctx.add('base', place(sphere(r, r * 0.92, r, 24, 16), { y: stemBottom + r + i * ((span - 2 * r) / Math.max(1, count - 1)) }))
        break
      }
      case 'arc': {
        const top = h - H - 0.02
        const mid = new Vector3((baseX + shadeX) / 2, h - 0.01, 0)
        ctx.add('stem', tube([new Vector3(baseX, stemBottom, 0), new Vector3(baseX, top * 0.7, 0), mid, new Vector3(shadeX, h - 0.02, 0), new Vector3(shadeX, shadeBottom + H * 0.7, 0)], 0.01, 10, 0.35))
        break
      }
      case 'tripod': {
        const apex = shadeStyle === 'globe' ? stemTop : shadeBottom + 0.02
        const foot = reach - 0.015
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + Math.PI / 2
          ctx.add('stem', tube([new Vector3(Math.cos(a) * foot, 0.012, Math.sin(a) * foot), new Vector3(Math.cos(a) * 0.02, apex, Math.sin(a) * 0.02)], 0.012, 10))
        }
        break
      }
    }
  },
})
