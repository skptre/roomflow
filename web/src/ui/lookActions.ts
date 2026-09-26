/**
 * "Try a look" actions. Hovering a look previews its proposal (automated,
 * tied to the revision it was built from); "Make it mine" commits it as one
 * undoable step. A proposal built before a newer edit is refused, never applied
 * over the user's change.
 */
import { designStore } from '../domain/designStore'
import type { Proposal, Theme } from '../domain/themes'
import { endAnyPreview } from './catalogActions'
import { noticeStore } from './noticeStore'

let lookOwner: string | null = null

export function previewLook(themeId: string, proposal: Proposal): boolean {
  endAnyPreview()
  const result = designStore.getState().startPreview(proposal.commands, { actor: 'auto', baseRevision: proposal.baseRevision })
  lookOwner = result.ok ? themeId : null
  return result.ok
}

export function endLookPreview(themeId: string) {
  if (lookOwner !== themeId) return
  lookOwner = null
  designStore.getState().cancelPreview()
}

export function commitLook(theme: Pick<Theme, 'id' | 'name'>, proposal: Proposal): boolean {
  const result = designStore.getState().apply(proposal.commands, { actor: 'auto', baseRevision: proposal.baseRevision })
  lookOwner = null
  if (!result.ok) {
    designStore.getState().cancelPreview()
    noticeStore.getState().show(result.stale ? 'The room changed since this look was prepared. Hover it again to see it with your changes.' : result.error, 'warning')
    return false
  }
  noticeStore.getState().show(`${theme.name} is yours now. Undo to go back.`)
  return true
}
