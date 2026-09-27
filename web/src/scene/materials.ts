/**
 * Procedural, meter-scaled detail textures for the room shell (floor boards,
 * wall plaster). Each is a light grayscale pattern that multiplies a
 * material's color, generated once and shared. UVs are in meters (one tile =
 * 1 m), so grain never stretches with room size. Furniture is drawn from
 * blocks with flat colors (src/blocks/materials.ts).
 */
import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

export type TextureKind = 'woodgrain' | 'plaster'

const SIZE = 256
const textures = new Map<TextureKind, Texture>()

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

const painters: Record<TextureKind, (ctx: CanvasRenderingContext2D) => void> = {
  woodgrain: drawWoodgrain,
  plaster: drawPlaster,
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

/** Release every shared texture (e.g. when the room view unmounts). */
export function disposeSharedMaterials() {
  for (const texture of textures.values()) texture.dispose()
  textures.clear()
}
