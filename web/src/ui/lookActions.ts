/**
 * "Try a look" actions. Hovering a look previews its proposal (automated,
 * tied to the revision it was built from); "Make it mine" commits it as one
 * undoable step. A proposal built before a newer edit is refused, never applied
 * over the user's change.
 */
import { designStore, type Preview } from '../domain/designStore'
import type { Proposal, Theme } from '../domain/themes'
import { endAnyPreview } from './catalogActions'
import { noticeStore } from './noticeStore'

let lookOwner: string | null = null
let lookPreview: Preview | null = null

export function previewLook(themeId: string, proposal: Proposal): boolean {
  if (lookOwner) endLookPreview(lookOwner)
  endAnyPreview()
  const result = designStore.getState().startPreview(proposal.commands, { actor: 'auto', baseRevision: proposal.baseRevision })
  lookOwner = result.ok ? themeId : null
  lookPreview = result.ok ? designStore.getState().preview : null
  return result.ok
}

export function endLookPreview(themeId: string) {
  if (lookOwner !== themeId) return
  const owned = lookPreview
  lookOwner = null
  lookPreview = null
  if (owned && designStore.getState().preview === owned) designStore.getState().cancelPreview()
}

export function commitLook(theme: Pick<Theme, 'id' | 'name'>, proposal: Proposal): boolean {
  const owned = lookOwner === theme.id ? lookPreview : null
  const result = designStore.getState().apply(proposal.commands, { actor: 'auto', baseRevision: proposal.baseRevision })
  lookOwner = null
  lookPreview = null
  if (!result.ok) {
    if (owned && designStore.getState().preview === owned) designStore.getState().cancelPreview()
    noticeStore.getState().show(result.stale ? 'The room changed since this look was prepared. Hover it again to see it with your changes.' : result.error, 'warning')
    return false
  }
  noticeStore.getState().show(`${theme.name} is yours now. Undo to go back.`)
  return true
}

/** The explicit Cancel and Escape actions dismiss whichever preview is currently shown. */
export function cancelActivePreview() {
  endAnyPreview()
  if (lookOwner) endLookPreview(lookOwner)
  designStore.getState().cancelPreview()
}
