import { describe, expect, it, vi } from 'vitest'
import { recognize, RecognitionError } from './recognition'

const appearance = { template: 'armchair', color: '#52677d', backColor: '#8091a0', confidence: 'medium', explanation: 'One seat' }
const request = { consent: true, image: '/9j/2Q==' }
const config = { key: 'server-secret', paid: true, model: 'gemini-3.1-flash-lite' }
function response(value: unknown = appearance) {
  return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 20 } }))
}
describe('Gemini boundary', () => {
  it('requires consent, server configuration and a JPEG before calling Google', async () => {
    const fetcher = vi.fn()
    await expect(recognize({ ...request, consent: false }, config, fetcher)).rejects.toBeInstanceOf(RecognitionError)
    await expect(recognize(request, { ...config, key: '' }, fetcher)).rejects.toThrow('configured')
    await expect(recognize(request, { ...config, paid: false }, fetcher)).rejects.toThrow('billing')
    await expect(recognize({ ...request, image: 'aGVsbG8=' }, config, fetcher)).rejects.toThrow('JPEG')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('sends only one image and fixed instructions, validates output and reports usage', async () => {
    const fetcher = vi.fn(async () => response())
    const result = await recognize(request, config, fetcher)
    expect(result.appearance).toEqual(appearance)
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 120, estimatedCostUsd: 0.00043 })
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain(config.key)
    expect(options.headers).toMatchObject({ 'x-goog-api-key': config.key })
    expect(JSON.parse(String(options.body)).contents[0].parts).toHaveLength(2)
    expect(JSON.stringify(result)).not.toContain(config.key)
  })
  it('does not retry, leak upstream errors, or accept untrusted geometry', async () => {
    const failed = vi.fn(async () => new Response('server-secret and private data', { status: 429 }))
    await expect(recognize(request, config, failed)).rejects.toThrow('busy')
    expect(failed).toHaveBeenCalledTimes(1)
    await expect(recognize(request, config, async () => response({ ...appearance, dimensions: [100,100,100] }))).rejects.toThrow('usable')
  })
})
