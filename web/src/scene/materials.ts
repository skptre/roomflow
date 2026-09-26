/**
 * Shared look resources.
 *
 * Textures: procedural, meter-scaled detail patterns. Each is a light grayscale
 * pattern that multiplies a material's color, generated once and shared. UVs
 * are in meters (one tile = 1 m), so grain never stretches with object size.
 *
 * Materials: one shared material per (kind, color, texture) so every imported,
 * authored, or generated part is lit and shaded the same way.
 */
import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Texture,
} from 'three'
import type { PartMaterial, PartTexture } from '../domain/assembly'

export type TextureKind = Exclude<PartTexture, 'plain'>

const SIZE = 256
const textures = new Map<TextureKind, Texture>()
const materials = new Map<string, Material>()

/** Small deterministic PRNG so textures look the same on every load. */
function random(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gray(ctx: CanvasRenderingContext2D, value: number, alpha = 1) {
  const v = Math.round(Math.max(0, Math.min(1, value)) * 255)
  ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${alpha})`
}

function drawWoodgrain(ctx: CanvasRenderingContext2D) {
  const rand = random(7)
  // Planks run along U; five planks per meter.
  const plank = SIZE / 5
  for (let row = 0; row < 5; row++) {
    const y = row * plank
    gray(ctx, 0.86 + rand() * 0.1)
    ctx.fillRect(0, y, SIZE, plank)
    // Grain: thin, slightly wavy lines.
    for (let i = 0; i < 14; i++) {
      const gy = y + rand() * plank
      const amp = 0.6 + rand() * 1.4
      const phase = rand() * Math.PI * 2
      gray(ctx, 0.72 + rand() * 0.12, 0.35)
      for (let x = 0; x < SIZE; x += 2) {
        ctx.fillRect(x, gy + Math.sin(x / 23 + phase) * amp, 2, 1)
      }
    }
    // Seam between planks and a staggered butt joint.
    gray(ctx, 0.62, 0.7)
    ctx.fillRect(0, y, SIZE, 1)
    const joint = Math.floor(rand() * SIZE)
    ctx.fillRect(joint, y, 1, plank)
  }
}

function drawPlaster(ctx: CanvasRenderingContext2D) {
  const rand = random(11)
  gray(ctx, 0.97)
  ctx.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 2600; i++) {
    gray(ctx, 0.9 + rand() * 0.1, 0.25)
    const r = 1 + rand() * 2.5
    ctx.fillRect(rand() * SIZE, rand() * SIZE, r, r)
  }
}

function drawWeave(ctx: CanvasRenderingContext2D) {
  const rand = random(19)
  gray(ctx, 0.95)
  ctx.fillRect(0, 0, SIZE, SIZE)
  // Basket weave: ~64 threads per meter in both directions, alternating over/under.
  const step = SIZE / 64
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const over = (x + y) % 2 === 0
      gray(ctx, (over ? 0.93 : 0.84) + rand() * 0.04)
      ctx.fillRect(x * step, y * step, step, step)
    }
  }
}

function drawKnit(ctx: CanvasRenderingContext2D) {
  const rand = random(23)
  gray(ctx, 0.95)
  ctx.fillRect(0, 0, SIZE, SIZE)
  // Rows of soft chevrons, ~40 stitches per meter.
  const w = SIZE / 40
  const h = SIZE / 32
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 40; col++) {
      gray(ctx, 0.82 + rand() * 0.06, 0.6)
      const x = col * w
      const y = row * h
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + w / 2, y + h)
      ctx.lineTo(x + w, y)
      ctx.lineWidth = 1.2
      ctx.strokeStyle = ctx.fillStyle
      ctx.stroke()
    }
  }
}

const painters: Record<TextureKind, (ctx: CanvasRenderingContext2D) => void> = {
  woodgrain: drawWoodgrain,
  plaster: drawPlaster,
  weave: drawWeave,
  knit: drawKnit,
}

/** Shared texture for a kind; created on first use. Browser only. */
export function proceduralTexture(kind: TextureKind): Texture {
  const cached = textures.get(kind)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  painters[kind](ctx)
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  texture.anisotropy = 4
  textures.set(kind, texture)
  return texture
}

/** One shared material per surface kind, color, and texture. */
export function partMaterial(kind: PartMaterial, color: string, texture: PartTexture = 'plain'): Material {
  const key = `${kind}|${color}|${texture}`
  const cached = materials.get(key)
  if (cached) return cached
  const map = texture === 'plain' ? null : proceduralTexture(texture)
  let material: Material
  switch (kind) {
    case 'fabric':
      material = new MeshPhysicalMaterial({ color, map, roughness: 0.95, sheen: 0.35, sheenRoughness: 0.8, sheenColor: '#ffffff' })
      break
    case 'ceramic':
      material = new MeshPhysicalMaterial({ color, map, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35 })
      break
    case 'glass':
      material = new MeshPhysicalMaterial({ color, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.45 })
      break
    case 'metal':
      material = new MeshStandardMaterial({ color, map, roughness: 0.32, metalness: 0.85 })
      break
    case 'wood':
      material = new MeshStandardMaterial({ color, map, roughness: 0.62 })
      break
    case 'leaf':
      material = new MeshStandardMaterial({ color, roughness: 0.7 })
      break
    case 'matte':
      material = new MeshStandardMaterial({ color, map, roughness: 0.85 })
      break
  }
  materials.set(key, material)
  return material
}

/** Release every shared texture and material (e.g. when the room view unmounts). */
export function disposeSharedMaterials() {
  for (const material of materials.values()) material.dispose()
  materials.clear()
  for (const texture of textures.values()) texture.dispose()
  textures.clear()
}
