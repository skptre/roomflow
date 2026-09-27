# Furniture appearance matching

Gemini is optional, explicitly invoked from a captured/owned item's inspector. The first version uses a user-chosen photo because the Designer does not yet consume iOS evidence ZIPs. Users inspect and crop the exact outgoing image, consent per analysis, review an approximate match, then preview/apply or cancel. The current renderer supports a fixed template vocabulary and colors; it does not reconstruct patterned upholstery or exact geometry.

Measurements and placement always remain authoritative. A dedicated setAppearance command preserves object category, source identity, keep/lock and purchase information, records AI provenance, participates in undo, and rejects stale revisions. Purchased products cannot be visually reidentified through this path.

The server adapter uses Gemini 3.1 Flash-Lite for cost-conscious image understanding, validates structured output, and never accepts generated code, URLs, prices or dimensions. Credentials remain server-side. For private photos the local setup requires an operator-confirmed billing-enabled project. Google retention is disclosed separately from Roomflow storage. No automatic retries, model escalation, or background analysis.

Code map:
- `web/src/recognition/contract.ts`: request/response and appearance schemas
- `web/server/recognition.ts`: bounded Google request, validation and usage estimate
- `web/server/recognitionPlugin.ts`: loopback-only Vite adapter and rate limits
- `web/src/ui/AppearanceDialog.tsx`: crop, consent, result and preview controls
- `web/src/recognition/appearanceAsset.ts`: deterministic template and color mapping
- `web/src/fixtures/assemblies/scannedSeating.ts`: neutral single/two/three-seat models

Deployment and configuration: `web/README.md`. Static builds require a separate authenticated production API before cloud recognition is available outside local development.

## Photograph a new discovery

Your room → Add a piece from a photo → camera/upload → crop → consent/analyze → enter name and assembled width/height/depth → optional price/store/ownership → Try in my room → Add to my room. Supports cm/in and USD/EUR/GBP prices; unknown price stays null. No actual merchant product or link is invented. Existing room objects and purchases remain untouched during preview. New purchases are embedded in the committed room for atomic undo/redo. A room revision change requires new analysis. Table lamps need a free supporting surface; floor furniture needs a free footprint.

The camera input is browser-supported, with upload fallback (JPEG/PNG/WebP; HEIC needs JPEG export). Live Gemini smoke test using only the synthetic sample scene succeeded (bed; 1,259 input / 72 output tokens; estimated $0.00042275). Physical iPhone camera and full browser photo-to-add interaction remain unverified. This is the web flow, not native iOS integration. The existing local-only endpoint must be replaced with authenticated hosted infrastructure and saved-room sync for real in-store use away from this computer. Desktop discovery review sits to the side so the room stays visible; narrow layouts collapse the preview controls to a bottom panel with an unblurred room.
