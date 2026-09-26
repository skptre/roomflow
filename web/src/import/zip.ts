/**
 * Minimal, defensive ZIP reader for RoomFlow packages (no dependency).
 *
 * Reads the central directory, supports stored (0) and deflate (8) entries via the platform's
 * DecompressionStream, and verifies each entry's CRC-32 and size. Rejects anything a package never
 * contains: encrypted or ZIP64 entries, unsafe or duplicate names, and entries that inflate past
 * their declared size (zip bombs). Directory entries are skipped.
 */

export type ZipLimits = { maxEntries: number; maxTotalBytes: number }

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 64, maxTotalBytes: 64 * 1024 * 1024 }

export class ZipError extends Error {}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** Standard CRC-32 (the checksum ZIP stores per entry). */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** True for relative paths with no empty, "." or ".." segments and no backslashes. */
function isSafeName(name: string): boolean {
  if (name.length === 0 || name.startsWith('/') || name.includes('\\')) return false
  return name.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..')
}

async function inflateRaw(data: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const out = new Uint8Array(expectedSize)
  let written = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (written + value.length > expectedSize) {
      await reader.cancel()
      throw new ZipError('This package is damaged (an entry is larger than its declared size).')
    }
    out.set(value, written)
    written += value.length
  }
  if (written !== expectedSize) throw new ZipError('This package is damaged (an entry is shorter than its declared size).')
  return out
}

/** Reads every file entry into memory, keyed by its path inside the archive. */
export async function readZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at: number) => view.getUint16(at, true)
  const u32 = (at: number) => view.getUint32(at, true)
  const inBounds = (start: number, length: number) => start >= 0 && length >= 0 && start + length <= bytes.length

  // End of central directory: last 22+ bytes; the comment can push it back up to 64 KiB.
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (bytes.length < 22 || eocd < 0) throw new ZipError('This file is not a zip archive.')

  const count = u16(eocd + 10)
  const directoryOffset = u32(eocd + 16)
  if (count === 0xffff || directoryOffset === 0xffffffff) throw new ZipError('This package uses an unsupported zip format (ZIP64).')
  if (count > limits.maxEntries) throw new ZipError(`This package has too many files (${count}).`)

  const files = new Map<string, Uint8Array>()
  let total = 0
  let offset = directoryOffset
  for (let index = 0; index < count; index++) {
    if (!inBounds(offset, 46) || u32(offset) !== 0x02014b50) throw new ZipError('This package is damaged (bad directory).')
    const flags = u16(offset + 8)
    const method = u16(offset + 10)
    const crc = u32(offset + 16)
    const compressedSize = u32(offset + 20)
    const size = u32(offset + 24)
    const nameLength = u16(offset + 28)
    const extraLength = u16(offset + 30)
    const commentLength = u16(offset + 32)
    const localOffset = u32(offset + 42)
    if (!inBounds(offset + 46, nameLength)) throw new ZipError('This package is damaged (bad directory).')
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength

    if (flags & 0x1) throw new ZipError('This package is encrypted and cannot be opened.')
    if (compressedSize === 0xffffffff || size === 0xffffffff) throw new ZipError('This package uses an unsupported zip format (ZIP64).')
    const isDirectory = name.endsWith('/')
    if (!isSafeName(isDirectory ? name.slice(0, -1) : name)) throw new ZipError(`This package contains an unsafe file name (${name}).`)
    if (isDirectory) continue
    if (files.has(name)) throw new ZipError(`This package lists the file ${name} twice.`)

    total += size
    if (total > limits.maxTotalBytes) throw new ZipError('This package is too large to open.')

    if (!inBounds(localOffset, 30) || u32(localOffset) !== 0x04034b50) throw new ZipError('This package is damaged (bad entry header).')
    const dataStart = localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28)
    if (!inBounds(dataStart, compressedSize)) throw new ZipError('This package is damaged (entry out of range).')
    const payload = bytes.subarray(dataStart, dataStart + compressedSize)

    let data: Uint8Array
    if (method === 0) {
      if (compressedSize !== size) throw new ZipError('This package is damaged (stored size mismatch).')
      data = payload.slice()
    } else if (method === 8) {
      data = await inflateRaw(payload, size)
    } else {
      throw new ZipError(`This package uses an unsupported compression method (${method}).`)
    }
    if (crc32(data) !== crc) throw new ZipError(`This package is damaged (checksum mismatch in ${name}).`)
    files.set(name, data)
  }
  return files
}
