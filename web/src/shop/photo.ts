/**
 * Product photos come from the Shopify CDN, which resizes on request
 * (`width=`). Scenes and thumbnails ask for the size they draw at instead of
 * the multi-megabyte original (plan D6: 1024 px for art canvases and rug tops).
 */
export function sizedPhoto(url: string, width: number): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'cdn.shopify.com') return url
    parsed.searchParams.set('width', String(width))
    return parsed.toString()
  } catch {
    return url
  }
}
