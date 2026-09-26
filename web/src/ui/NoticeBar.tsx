import { AnimatePresence, motion } from 'motion/react'
import { useStore } from 'zustand'
import { noticeStore, type NoticeTone } from './noticeStore'
import { floatIn } from './tokens'

const tones: Record<NoticeTone, string> = {
  info: 'bg-ink text-surface',
  warning: 'bg-surface-raised text-ink ring-1 ring-line',
  danger: 'bg-danger-soft text-danger ring-1 ring-danger/20',
}

/** Bottom-center status line for short confirmations and refusals. Announced politely. */
export function NoticeBar() {
  const notice = useStore(noticeStore, (state) => state.notice)
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4" role="status" aria-live="polite">
      <AnimatePresence>
        {notice ? (
          <motion.p key={notice.id} {...floatIn} className={`rounded-pill px-4 py-2 text-sm font-medium shadow-float ${tones[notice.tone]}`}>
            {notice.text}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
