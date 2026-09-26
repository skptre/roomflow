import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { floatIn } from './tokens'

type FloatingPanelProps = {
  /** Accessible name for the panel region. */
  label: string
  children: ReactNode
  className?: string
}

/** Floating surface over the room canvas. Keep panels compact so the room stays the workspace. */
export function FloatingPanel({ label, children, className = '' }: FloatingPanelProps) {
  return (
    <motion.section
      aria-label={label}
      {...floatIn}
      className={`pointer-events-auto rounded-xl bg-surface/95 shadow-float backdrop-blur ${className}`}
    >
      {children}
    </motion.section>
  )
}
