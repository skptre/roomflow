import type { ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'muted'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-raised text-ink',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  muted: 'bg-surface-sunken text-muted',
}

/** Small status pill. Pair color with text — never rely on color alone. */
export function Chip({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}
