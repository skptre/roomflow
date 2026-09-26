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
