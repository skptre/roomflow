import { z } from 'zod'

export const TEMPLATES = ['armchair', 'loveseat', 'sofa', 'desk-chair', 'bed', 'desk', 'coffee-table', 'dresser', 'bookshelf', 'nightstand', 'floor-lamp', 'table-lamp', 'unsupported'] as const
export const Appearance = z.strictObject({
  template: z.enum(TEMPLATES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  confidence: z.enum(['low', 'medium', 'high']),
  explanation: z.string().min(1).max(300),
})
export type Appearance = z.infer<typeof Appearance>
export const RecognitionRequest = z.strictObject({
  image: z.string().min(1).max(2_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  consent: z.literal(true),
})
export const RecognitionResponse = z.object({
  appearance: Appearance,
  model: z.string().min(1).max(100),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), estimatedCostUsd: z.number().nonnegative().nullable() }),
})
export type RecognitionResponse = z.infer<typeof RecognitionResponse>
