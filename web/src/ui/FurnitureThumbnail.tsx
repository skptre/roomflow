import { useEffect, useRef, useState } from 'react'
import type { AssetRef, Dimensions } from '../domain/schema'
import { thumbnail } from '../scene/thumbnails'
import { StudioIcon } from './StudioIcon'

export function FurnitureThumbnail({
  asset,
  dimensions,
  className = '',
}: {
  asset: AssetRef
  dimensions: Pick<Dimensions, 'width' | 'height' | 'depth'>
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let frame = 0
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          frame = requestAnimationFrame(() => setUrl(thumbnail(asset, dimensions)))
          observer.disconnect()
        }
      },
      { rootMargin: '120px' },
    )
    if (ref.current) observer.observe(ref.current)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [asset, dimensions])
  return (
    <span ref={ref} className={`furniture-thumbnail ${className}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <StudioIcon name="chair" size={36} />}
    </span>
  )
}
