# Gemini room designer

## Goal

Let a person describe the room they want in everyday language, optionally state a spending limit, and safely try a complete redesign. Requests include "reorganize everything randomly", "replace the room with chairs", and "turn everything black". The person always sees the proposed room, its financial impact, and unfulfilled requests before deciding whether to apply it.

## Scope

The web Designer receives a new room-design composer. It accepts a prompt and an optional budget in integer minor units plus explicit currency. It can propose moving, rotating, removing, recoloring, replacing, or adding furniture. Added and replacement furniture comes from the committed real catalog when a suitable in-stock item exists. A deliberately labeled placeholder is allowed only when the request has no suitable catalog item.

The feature does not change the iOS app, upload room or furniture photos, make purchases, or present generated items as real products. Existing object dimensions, room geometry, openings, meter coordinates, and locked objects remain authoritative.

## Architecture

`RoomDesignerDialog` owns the composer and its preview. It creates a redacted `RoomDesignRequest` from the committed room: room bounds, walls/openings, object identifiers/categories/dimensions/colors/poses, and a user-entered brief and budget. It asks the server for a `RoomDesignIntent`.

`/api/design-room` is a local development endpoint built on the shared egress allowlist, model selection, paid-project attestation, and spend ledger. It only accepts consented JSON requests from localhost. The server sends Gemini a fixed prompt and a schema-constrained room summary. It returns no model-generated executable commands, prices, URLs, dimensions, or coordinates.

The browser validates the intent. `buildRoomDesignProposal` resolves it against the local catalog, applies deterministic recolors and removals, finds legal placements with the existing layout/placement functions, rejects locked-object edits, and calculates the resulting purchase state. It creates only domain `Command`s with the committed revision as `baseRevision`.

## Gemini contract

Gemini returns a strict JSON intent, not a room model:

```ts
type RoomDesignIntent = {
  palette?: { mode: 'preserve' | 'darken' | 'lighten' | 'set'; color?: '#rrggbb' }
  rearrange: 'none' | 'gentle' | 'full'
  removeObjectIds: string[]
  replace: Array<{ objectId: string; category: string; count: number }>
  add: Array<{ category: string; count: number }>
}
```

The schema sent to Gemini is this flat shape with no `oneOf`, `const`, `pattern` or string-length keywords, which Gemini does not enforce; the fixed instruction spells out the palette modes and ID rules instead. The parser first normalizes harmless variations deterministically — a color with a mode other than `set` is dropped, colors are lowercased and `#rgb` expanded to `#rrggbb`, and an ID listed in both `removeObjectIds` and `replace` keeps only the replacement — then rejects malformed output, `set` without a valid color, unknown object IDs, other duplicate IDs, unsupported categories, counts outside 1–12, output over the fixed size limit, or any extra prose field. The browser independently repeats the identity/category/count checks before it creates commands. The browser composes neutral summary and notes from validated intent and allowlisted local category labels; Gemini never supplies display prose.

Requests such as “randomly reorganize” become `rearrange: 'full'`; deterministic seeded placement keeps a request stable for one preview. “Turn everything black” is a palette `set` intent that applies only to safe material slots: walls and accents take the color, the floor takes a readable variant so furniture stays visible, and furniture colors are unchanged (replacing pieces changes them). “Replace the room with chairs” removes or replaces eligible objects and adds catalog chair variants until placement, budget, or room capacity stops the proposal.

## Money and catalog selection

The optional budget is parsed locally as integer minor units and explicit currency. Catalog candidates must have a known price in that currency, be in stock, and fit the category/room. The resolver stays at or below a provided budget. Without a budget, it may suggest catalog pieces but marks the preview `budget unknown` if any proposed item has an unknown price; it never treats missing price as zero or sums currencies.

Existing and owned objects add no new cost. Replacement removes an existing purchase line before it adds a new catalog line. The preview summary identifies new purchase items, removed items, and unknown prices separately.

## Preview and interaction

Submitting a request starts no edit. The dialog shows a locally composed summary, a change list, proposed total/budget status, warnings, and the visual room preview. `Try this design` calls `designStore.startPreview(commands, { actor: 'auto', baseRevision })`; only the dialog that owns that preview may cancel or apply it. A stale revision blocks apply and requires generating a fresh proposal. Apply commits the entire proposal as one undoable edit, including spatial and financial changes. Escape, close, and Discard cancel exactly that preview.

The UI has clear consent text: the request and room summary go to Google Gemini; no photos are sent; the model may incur the disclosed estimated charge. A user can use the existing non-AI editing tools without consent.

## Failure behavior

If Gemini is unavailable, consent is absent, usage/budget caps are reached, its plan is invalid, no catalog item fits, or no legal placement exists, the dialog keeps the committed room unchanged. It reports the actionable reason and may show a partial proposal only when every included command independently validates. The dialog never falls back to fabricated inventory, prices, measurements, or a silently different prompt.

## Tests

Tests cover schema validation, consent and localhost guards, bounded Gemini request/response handling, shared spend-cap accounting, strict budget/currency rules, catalog-only product choice, no fabricated values, locked object protection, opening/placement constraints, preview ownership, stale-result rejection, one-step undo, cancel restoration, and examples for random reorganization, black palette, and chair replacement.
