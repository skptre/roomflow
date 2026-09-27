import { describe, expect, it } from 'vitest'
import { generateJson, listModels, pickModel, worstCaseMicros } from './gemini'

type Call = { url: string; init?: RequestInit }

function fakeFetch(response: () => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return response()
  }
  return { fetch, calls }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('listModels', () => {
  it('lists models that can generate content, sending the key as a header, never in the URL', async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({
        models: [
          { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
          { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateSpeech'] },
          { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    )
    expect(await listModels({ fetch, apiKey: 'secret-key' })).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite'])
    expect(calls[0]!.url).not.toContain('secret-key')
    expect(new Headers(calls[0]!.init?.headers).get('x-goog-api-key')).toBe('secret-key')
  })
})

describe('pickModel', () => {
  const at = new Date('2026-09-26T12:00:00Z')
  it('uses the configured model when the key can reach it', () => {
    expect(pickModel(['gemini-3.5-flash-lite', 'gemini-3.8-flash'], 'gemini-3.8-flash', at)).toEqual({ model: 'gemini-3.8-flash', reason: 'configured' })
  })
  it('otherwise the cheapest priced flash-lite', () => {
    expect(pickModel(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'], 'gemini-9', at)).toEqual({
      model: 'gemini-3.1-flash-lite',
      reason: 'cheapest-flash-lite',
    })
  })
  it('none when nothing reachable has a known price', () => {
    expect(pickModel(['gemini-omni-flash-preview'], undefined, at)).toBeNull()
  })
})

describe('worstCaseMicros', () => {
  it('bounds input by characters and images and output by the token limit', () => {
    const rate = { inputNanosPerToken: 750, outputNanosPerToken: 3750 }
    // (ceil(2000/2) + 2×1120 + 200) × 750 + 3000 × 3750 = 3440×750 + 11,250,000 = 13,830,000 n$ → 13,830 µ$
    expect(worstCaseMicros(rate, { textChars: 2000, images: 2, maxOutputTokens: 3000 })).toBe(13_830)
  })
})

describe('generateJson', () => {
  const request = {
    model: 'gemini-3.8-flash',
    apiKey: 'k',
    parts: [{ text: 'describe' }, { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }],
    schema: { type: 'object', properties: { a: { type: 'string' } } },
    maxOutputTokens: 1000,
    thinkingLevel: 'LOW' as const,
    timeoutMs: 1000,
  }

  it('asks for schema-shaped JSON and returns it with token usage (thoughts kept out of the answer)', async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"a":"b"}' }] } }],
        usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 20, thoughtsTokenCount: 50, totalTokenCount: 970 },
      }),
    )
    const result = await generateJson({ ...request, fetch })
    expect(result).toEqual({ ok: true, value: { a: 'b' }, usage: { input: 900, output: 20, thoughts: 50 } })
    expect(calls[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    const body = JSON.parse(String(calls[0]!.init?.body))
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: request.schema,
      maxOutputTokens: 1000,
      thinkingConfig: { thinkingLevel: 'LOW' },
    })
    expect(body.contents[0].parts).toEqual(request.parts)
  })

  it('a rejected request (HTTP 4xx) is not billed', async () => {
    const { fetch } = fakeFetch(() => json({ error: { message: 'bad schema' } }, 400))
    expect(await generateJson({ ...request, fetch })).toEqual({ ok: false, charged: 'none', error: 'HTTP 400: bad schema' })
  })

  it('an answer cut off at the token limit is billed and reported', async () => {
    const { fetch } = fakeFetch(() =>
      json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"a":' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1000 } }),
    )
    expect(await generateJson({ ...request, fetch })).toEqual({
      ok: false,
      charged: 'billed',
      usage: { input: 10, output: 1000, thoughts: 0 },
      error: 'answer stopped: MAX_TOKENS',
    })
  })

  it('a network failure or timeout may have been billed', async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new Error('socket hang up')))
    expect(await generateJson({ ...request, fetch })).toEqual({ ok: false, charged: 'unknown', error: 'socket hang up' })
  })

  it('an answer that is not JSON is billed and reported', async () => {
    const { fetch } = fakeFetch(() => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'sure!' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } }))
    expect(await generateJson({ ...request, fetch })).toMatchObject({ ok: false, charged: 'billed', error: expect.stringMatching(/JSON/) })
  })
})

describe('generateJson — incomplete usage', () => {
  it('flags an answer whose input token count is missing, so the ledger bills the reservation instead of zero', async () => {
    const { fetch } = fakeFetch(() => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }], usageMetadata: { candidatesTokenCount: 5 } }))
    const result = await generateJson({
      fetch,
      apiKey: 'k',
      model: 'm',
      parts: [{ text: 'x' }],
      schema: {},
      maxOutputTokens: 10,
      timeoutMs: 1000,
    })
    expect(result).toMatchObject({ ok: true, usageIncomplete: true })
  })

  it('adds up per-modality counts when the total is missing', async () => {
    const { fetch } = fakeFetch(() =>
      json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }],
        usageMetadata: { candidatesTokenCount: 5, promptTokensDetails: [{ modality: 'IMAGE', tokenCount: 264 }, { modality: 'TEXT', tokenCount: 6 }] },
      }),
    )
    const result = await generateJson({ fetch, apiKey: 'k', model: 'm', parts: [{ text: 'x' }], schema: {}, maxOutputTokens: 10, timeoutMs: 1000 })
    expect(result).toEqual({ ok: true, value: {}, usage: { input: 270, output: 5, thoughts: 0 } })
  })
})
