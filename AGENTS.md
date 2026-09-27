# Roomflow — agent notes

Follow `CLAUDE.md` and `spec.md`. They are the engineering rules and product authority for every change, including reviews.

Before searching the code, read `docs/INDEX.md` and `docs/ARCHITECTURE.md`. Every code change also updates the project records as described in `.claude/documentation.md` (CHANGELOG entry, ARCHITECTURE/INDEX rows, DECISIONS for tradeoffs).

The browser app lives in `web/` (Vite + React + TypeScript + React Three Fiber). Run checks from `web/`:

```
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

The native capture app lives in `ios/` and is owned by a separate contributor. Web changes never touch it.

## Review guidelines

Prioritize these, and flag missing tests on any of them:

- **Money:** integer minor units with explicit currency; unknown price is never zero; no cross-currency sums; owned items add no new cost; budget status must be "unknown" when any price is unknown.
- **Preview isolation:** hovering/previewing never mutates the committed room, purchase list, or subtotal; cancel restores exactly.
- **Undo:** one undo reverses both spatial and financial effects of an edit.
- **Revision staleness:** asynchronous or automated results carry a base revision; stale results are rejected, never silently applied.
- **Coordinates:** meters, right-handed, Y-up, yaw about +Y (counter-clockwise seen from above), object origin at bottom-center; RoomPlan conversion only in `web/src/import/roomplan.ts`. Watch for width/depth swaps and repeated unit conversion.
- **Openings:** door openings must stay open in wall geometry.
- **Fabricated data:** no invented product links, prices, measurements, or scan results; sample and synthetic fixtures are labeled in the UI.
- **three.js resources:** geometries, materials, textures, and listeners created imperatively are disposed.
- **Scope:** web PRs must not modify `ios/`.

Mark each finding **blocking** or **non-blocking**. Skip pure style nits.
