import { AnimatePresence, motion } from 'motion/react'
import { useId, useState, type ReactElement, type ReactNode } from 'react'
import { duration, ease } from './tokens'

type TooltipProps = {
  content: ReactNode
  /** The trigger. It receives aria-describedby while the tooltip is shown. */
  children: (props: { 'aria-describedby'?: string }) => ReactElement
  side?: 'top' | 'bottom'
}

/** Hover/focus tooltip. Shown for keyboard focus too, dismissed with Escape. */
export function Tooltip({ content, children, side = 'bottom' }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      {children({ 'aria-describedby': open ? id : undefined })}
      <AnimatePresence>
        {open ? (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.fast, ease: ease.outSoft }}
            className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-xs text-surface shadow-panel ${
              side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            }`}
          >
            {content}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  )
}
