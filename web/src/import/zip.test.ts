import { describe, expect, it } from 'vitest'
import { makeZip } from '../test/zipWriter'
import { crc32, readZip } from './zip'

const text = (data: Uint8Array | undefined) => new TextDecoder().decode(data)

describe('readZip', () => {
  it('reads stored and deflated entries and skips directory entries', async () => {
    const zip = await makeZip([
      { name: 'pkg/', data: '' },
      { name: 'pkg/a.json', data: '{"a":1}' },
      { name: 'pkg/photos/b.jpg', data: 'x'.repeat(5000), deflate: true },
    ])
    const files = await readZip(zip)
    expect([...files.keys()].sort()).toEqual(['pkg/a.json', 'pkg/photos/b.jpg'])
    expect(text(files.get('pkg/a.json'))).toBe('{"a":1}')
    expect(files.get('pkg/photos/b.jpg')?.length).toBe(5000)
  })

  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it.each(['../evil.json', '/etc/passwd', 'a/../../b', 'a\\b.json', 'a//b'])('rejects the unsafe name %s', async (name) => {
    await expect(readZip(await makeZip([{ name, data: '{}' }]))).rejects.toThrow(/unsafe/)
  })

  it('rejects duplicate names', async () => {
    await expect(readZip(await makeZip([{ name: 'a', data: '1' }, { name: 'a', data: '2' }]))).rejects.toThrow(/twice/)
  })

  it('rejects a checksum mismatch', async () => {
    await expect(readZip(await makeZip([{ name: 'a', data: 'hello' }], { badCrc: 'a' }))).rejects.toThrow(/damaged/)
  })

  it('rejects an entry that inflates past its declared size', async () => {
    const zip = await makeZip([{ name: 'a', data: 'x'.repeat(100_000), deflate: true }], { declaredSize: () => 10 })
    await expect(readZip(zip)).rejects.toThrow(/damaged|size/)
  })

  it('rejects encrypted entries', async () => {
    await expect(readZip(await makeZip([{ name: 'a', data: '1' }], { flags: 1 }))).rejects.toThrow(/encrypted/)
  })

  it('enforces entry and size limits', async () => {
    const many = await makeZip(Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, data: 'x' })))
    await expect(readZip(many, { maxEntries: 4, maxTotalBytes: 1e6 })).rejects.toThrow(/too many/)
    const big = await makeZip([{ name: 'a', data: 'x'.repeat(2000) }])
    await expect(readZip(big, { maxEntries: 10, maxTotalBytes: 1000 })).rejects.toThrow(/too large/)
  })

  it('rejects bytes that are not a zip', async () => {
    await expect(readZip(new TextEncoder().encode('{"walls":[]}'))).rejects.toThrow(/not a zip/)
  })
})
