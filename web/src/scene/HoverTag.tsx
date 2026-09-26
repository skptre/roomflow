import { Html } from '@react-three/drei'
import { useMemo } from 'react'
import { Vector3, type Camera, type Object3D } from 'three'
import type { PurchaseSources } from '../domain/designStore'
import { formatDimensions, priceLabel } from '../domain/labels'
import type { Dimensions, RoomObject } from '../domain/schema'

type Size = Pick<Dimensions, 'width' | 'height' | 'depth'>

const corner = new Vector3()

/**
 * Screen position just above the object's projected silhouette: the top-most
 * projected corner of its box, horizontally centered. The tag hangs above that
 * point, so it never covers the object from any camera angle.
 */
function aboveSilhouette({ width, height, depth }: Size) {
  return (el: Object3D, camera: Camera, size: { width: number; height: number }) => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    for (const x of [-width / 2, width / 2]) {
      for (const y of [0, height]) {
        for (const z of [-depth / 2, depth / 2]) {
          corner.set(x, y, z).applyMatrix4(el.matrixWorld).project(camera)
          const sx = ((corner.x + 1) / 2) * size.width
          const sy = ((1 - corner.y) / 2) * size.height
          minX = Math.min(minX, sx)
          maxX = Math.max(maxX, sx)
          minY = Math.min(minY, sy)
        }
      }
    }
    return [(minX + maxX) / 2, minY]
  }
}

/** Small floating tag above an object: name, what it costs (or "Yours"), and size. */
export function HoverTag({ object, sources }: { object: RoomObject; sources: PurchaseSources }) {
  const price = priceLabel(object, sources)
  const { width, height, depth } = object.dimensions
  const calculatePosition = useMemo(() => aboveSilhouette({ width, height, depth }), [width, height, depth])
  return (
    <Html calculatePosition={calculatePosition} zIndexRange={[30, 10]}>
      {/* Visual only: the same facts are in the inspector, so screen readers aren't interrupted on hover. */}
      <div
        aria-hidden="true"
        className="pointer-events-none flex -translate-x-1/2 -translate-y-[calc(100%+10px)] flex-col items-center gap-0.5 rounded-lg bg-surface/95 px-2.5 py-1.5 text-center shadow-float backdrop-blur"
      >
        <span className="text-xs font-semibold whitespace-nowrap text-ink">{object.name}</span>
        <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted">
          <span className={price.kind === 'price' ? 'font-medium text-ink' : undefined}>{price.text}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDimensions(object.dimensions)}</span>
        </span>
      </div>
    </Html>
  )
}
