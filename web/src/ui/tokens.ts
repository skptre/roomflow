/**
 * Motion tokens for JS animation (Motion). Mirror the CSS tokens in src/index.css
 * (--duration-*, --ease-*); change both together.
 */
export const duration = { fast: 0.12, base: 0.18, slow: 0.32 } as const

export const ease = {
  outSoft: [0.22, 1, 0.36, 1],
  inOutSoft: [0.65, 0, 0.35, 1],
} as const

/** Standard enter/exit for floating UI: short fade + small rise, never over 200 ms. */
export const floatIn = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
  transition: { duration: duration.base, ease: ease.outSoft },
} as const
