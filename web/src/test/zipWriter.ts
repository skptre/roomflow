/** Test-only ZIP writer: stored or deflated entries, with optional tampering for failure tests. */
import { crc32 } from '../import/zip'

export type ZipEntry = { name: string; data: Uint8Array | string; deflate?: boolean }
export type ZipTamper = { declaredSize?: (name: string, actual: number) => number; badCrc?: string; flags?: number }

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function makeZip(entries: ZipEntry[], tamper: ZipTamper = {}): Promise<Uint8Array> {
  const local: number[] = []
  const central: number[] = []
  const u16 = (out: number[], v: number) => out.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (out: number[], v: number) => out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const entry of entries) {
    const raw = typeof entry.data === 'string' ? new TextEncoder().encode(entry.data) : entry.data
    const payload = entry.deflate ? await deflateRaw(raw) : raw
    const method = entry.deflate ? 8 : 0
    const name = new TextEncoder().encode(entry.name)
    const crc = tamper.badCrc === entry.name ? (crc32(raw) ^ 1) >>> 0 : crc32(raw)
    const size = tamper.declaredSize ? tamper.declaredSize(entry.name, raw.length) : raw.length
    const offset = local.length
    const header = (out: number[], centralRecord: boolean) => {
      u32(out, centralRecord ? 0x02014b50 : 0x04034b50)
      if (centralRecord) u16(out, 20)
      u16(out, 20); u16(out, tamper.flags ?? 0); u16(out, method); u16(out, 0); u16(out, 0)
      u32(out, crc); u32(out, payload.length); u32(out, size)
      u16(out, name.length); u16(out, 0)
      if (centralRecord) { u16(out, 0); u16(out, 0); u16(out, 0); u32(out, 0); u32(out, offset) }
      out.push(...name)
    }
    header(local, false)
    local.push(...payload)
    header(central, true)
  }
  const end: number[] = []
  u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, entries.length); u16(end, entries.length)
  u32(end, central.length); u32(end, local.length); u16(end, 0)
  return new Uint8Array([...local, ...central, ...end])
}
