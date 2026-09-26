/**
 * Appearance evidence imported with a RoomFlow package (photos, photo regions, approximate colors,
 * user names), kept in memory beside the loaded room. Loading another room replaces or clears it.
 * Never persisted; photos exist only for this session.
 */
import { createStore } from 'zustand/vanilla'
import type { PackageEvidence, PackagePhoto, PhotoRegion } from '../import/roomflowPackage'

type EvidenceState = {
  roomId: string | null
  evidence: PackageEvidence | null
  /** Replaces the evidence for the room that was just loaded (null for a plain .json or the sample). */
  set: (roomId: string, evidence: PackageEvidence | null) => void
  /** Photo regions for a captured object, paired with their photos, best (largest region) first. */
  regionsFor: (objectId: string) => Array<{ region: PhotoRegion; photo: PackagePhoto }>
}

export const evidenceStore = createStore<EvidenceState>()((set, get) => ({
  roomId: null,
  evidence: null,
  set(roomId, evidence) {
    set({ roomId, evidence })
  },
  regionsFor(objectId) {
    const evidence = get().evidence
    if (!evidence) return []
    const photos = new Map(evidence.photos.map((photo) => [photo.photoId, photo]))
    return evidence.associations
      .filter((region) => region.sourceId === objectId && photos.has(region.photoId))
      .map((region) => ({ region, photo: photos.get(region.photoId)! }))
      .sort((a, b) => b.region.rect[2] * b.region.rect[3] - a.region.rect[2] * a.region.rect[3])
  },
}))
