# Gemini Room Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user ask Gemini to redesign a room and safely preview one validated, budget-aware, undoable proposal.

**Architecture:** Gemini receives only a bounded text summary of the current room and returns a strict high-level intent. Browser code validates that intent, resolves catalog choices, and builds ordinary domain commands; the existing design store owns preview, staleness, apply, and undo. The Vite server mounts a consented local-only `/api/design-room` route through the shared Gemini egress and ledger controls.

**Tech Stack:** TypeScript, React, Zustand, Zod, Vite middleware, Vitest, existing Roomflow catalog/domain/preview APIs.

**Spec:** `docs/superpowers/specs/2026-09-27-gemini-room-designer-design.md`

## Global Constraints

- Gemini receives no room or furniture photos for this feature.
- Gemini returns intent only: never commands, coordinates, dimensions, prices, product URLs, or a room model.
- All user budget values are integer minor units with an explicit currency; unknown price is never zero and currencies never mix.
- Catalog additions/replacements use only in-stock real catalog entries; placeholders are visibly labeled.
- Automated commands are revision-bound, respect `keep` and `lockPlacement`, preserve meter/Y-up coordinate rules, and never close wall openings.
- Preview never mutates the committed room, purchase list, or subtotal; Apply is one undoable transaction and stale work is rejected.
- Request body, model output, prompt, and photos are never logged.

## Review Focus

- A malicious model response that contains an unknown ID, unsupported category, duplicated edit, too-large count, coordinate, or price is rejected before catalog/layout code runs.
- A user submits a budget in another currency or a candidate lacks price: no cross-currency arithmetic occurs and the result remains budget-unknown.
- A plan targets kept or locked items: removal/replacement/movement is omitted with a visible explanation.
- A request exceeds room capacity: valid earlier placements remain previewable while every skipped item is reported; no overlap/outside placement is created.
- A room changes after Gemini responds: Apply is rejected and the preview is cancelled without any committed or financial change.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `web/src/roomDesigner/contract.ts` | Strict request/intent/result schemas shared by browser and server; bounds and redacted room summary. |
| `web/src/roomDesigner/contract.test.ts` | Boundary validation and hostile-output tests. |
| `web/src/roomDesigner/proposal.ts` | Intent-to-catalog-to-command resolver and proposal/warning accounting. |
| `web/src/roomDesigner/proposal.test.ts` | Budget, catalog, locked/kept, capacity, and deterministic layout tests. |
| `web/server/roomDesigner.ts` | Fixed Gemini prompt, local request handler, consent, output validation, and no-log failure mapping. |
| `web/server/roomDesigner.test.ts` | Route/consent/local-host/egress/response tests with injected Gemini client. |
| `web/server/api.ts` | Mount `/api/design-room` with the existing Vite middleware and security headers. |
| `web/src/ui/RoomDesignerDialog.tsx` | Prompt, budget, consent, proposal summary, owned preview, apply/discard lifecycle. |
| `web/src/ui/roomDesignerActions.ts` | Preview ownership and revision-safe commit/cancel helpers. |
| `web/src/ui/RoomPanel.tsx`, `web/src/App.tsx`, `web/src/index.css` | Entry point, dialog lifecycle, responsive/accessibility styling. |
| `docs/*` | Project records for the delivered feature and tradeoffs. |

### Task 1: Define the safe room-designer boundary

**Files:**
- Create: `web/src/roomDesigner/contract.ts`
- Create: `web/src/roomDesigner/contract.test.ts`

**Interfaces:**
- Produces `RoomDesignRequest`, `RoomDesignIntent`, `RoomDesignResponse`, `roomSummary(room: Room)`, `parseRoomDesignIntent(value: unknown, room: Room)`.
- Consumed by Tasks 2–4.

- [ ] **Step 1: Write failing contract tests**

Test a valid text-only request and valid intent; reject blank/overlong prompts, no consent, more than 12 additions/replacements, unknown/duplicate object IDs, unsupported categories, coordinates/prices/URLs/room fields, invalid palette combinations, and explanation/notes beyond their caps.

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `cd web && npm test -- --run src/roomDesigner/contract.test.ts`

Expected: FAIL because `contract.ts` does not exist.

- [ ] **Step 3: Implement `contract.ts`**

Define strict Zod schemas. `RoomDesignRequest` contains `brief`, `consent: true`, optional `{ amountMinor: number; currency: string }`, `baseRevision`, and `roomSummary`. `roomSummary` includes only room ID, floor polygon/bounds, walls/openings, finishes, and object ID/category/dimensions/pose/keep/lock/color summary. Cap prompt at 600 characters, output at 24 KB, strings at 300 characters, notes at 12, and aggregate planned item count at 12. Add doc comments explaining the redaction and intent-only contract.

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `cd web && npm test -- --run src/roomDesigner/contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/roomDesigner/contract.ts web/src/roomDesigner/contract.test.ts
git commit -m "feat: define room designer contract"
```

### Task 2: Build a deterministic, catalog-only proposal resolver

**Files:**
- Create: `web/src/roomDesigner/proposal.ts`
- Create: `web/src/roomDesigner/proposal.test.ts`
- Modify: `web/src/domain/catalog.ts` only if a small exported catalog query/helper is required

**Interfaces:**
- Consumes `RoomDesignIntent`, `CatalogEntry[]`, `Room`, `Money | null`, and `baseRevision` from Task 1.
- Produces `buildRoomDesignProposal(input): RoomDesignProposal`, with `{ baseRevision, commands, notes, warnings, skipped, summary }`.
- Consumed by Tasks 3–4.

- [ ] **Step 1: Write failing proposal tests**

Cover full rearrangement with a stable seeded ordering, black palette restyle, removal/replacement/addition from real in-stock entries, budget pruning with explicit currency, unknown-price budget status, no fabricated product values, `keep` removal/replacement refusal, `lockPlacement` move/replacement clamp refusal, full-room capacity skips, and commands accepted by `applyCommands(room, commands, 'auto')`.

- [ ] **Step 2: Run proposal tests to verify they fail**

Run: `cd web && npm test -- --run src/roomDesigner/proposal.test.ts`

Expected: FAIL because `proposal.ts` does not exist.

- [ ] **Step 3: Implement `buildRoomDesignProposal`**

Use `placementCommands`, `entryToObject`, `freeSpot`, `checkPlacement`, and the catalog’s in-stock entries. Seed layout ordering from `room.id + baseRevision + normalized intent`; do not trust model coordinates. Emit `restyle`, `remove`, `replace`, `add`, `move`, and `rotate` commands only after validating each target against the current working room. Candidate selection must stay in the user’s budget currency and never convert or treat null price as zero. Preserve a command only if applying it succeeds; append a human-readable skipped reason otherwise. Return no commands when none can be made safely.

- [ ] **Step 4: Run proposal tests to verify they pass**

Run: `cd web && npm test -- --run src/roomDesigner/proposal.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/roomDesigner/proposal.ts web/src/roomDesigner/proposal.test.ts web/src/domain/catalog.ts
git commit -m "feat: build safe room designer proposals"
```

### Task 3: Add the consented local Gemini planning route

**Files:**
- Create: `web/server/roomDesigner.ts`
- Create: `web/server/roomDesigner.test.ts`
- Modify: `web/server/api.ts`

**Interfaces:**
- Consumes `RoomDesignRequest` and Task 1 parser; uses the existing `web/src/ai/egress.ts`, Gemini client, model/rates, and ledger.
- Produces `POST /api/design-room` returning `RoomDesignResponse` or a bounded JSON error.
- Consumed by Task 4.

- [ ] **Step 1: Write failing route tests**

Inject a fake Gemini client. Assert non-local peers, non-POST methods, missing consent, non-JSON, oversize bodies, invalid request schemas, and exhausted egress/ledger caps are refused before calling Gemini. Assert the sent prompt contains no photos, URLs, raw room package, offer prices, or arbitrary coordinates; assert valid model output is parsed and malformed output is rejected without echoing input.

- [ ] **Step 2: Run route tests to verify they fail**

Run: `cd web && npm test -- --run server/roomDesigner.test.ts`

Expected: FAIL because `roomDesigner.ts` does not exist.

- [ ] **Step 3: Implement `createRoomDesignerHandler(deps)` and mount it**

Build a fixed system instruction that demands the Task 1 JSON schema and intent-only output. Reuse the shared allowlist, concurrency/spend limits, local-origin checks, and no-store/CSP response pattern in `server/api.ts`; do not duplicate credentials or ledger state. Bound input to 32 KB and return concise fixed errors. Pass only the redacted summary and brief to Gemini. Validate its parsed JSON with `parseRoomDesignIntent` before responding.

- [ ] **Step 4: Run route tests to verify they pass**

Run: `cd web && npm test -- --run server/roomDesigner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/server/roomDesigner.ts web/server/roomDesigner.test.ts web/server/api.ts
git commit -m "feat: add Gemini room design endpoint"
```

### Task 4: Deliver the designer composer and isolated preview

**Files:**
- Create: `web/src/ui/RoomDesignerDialog.tsx`
- Create: `web/src/ui/roomDesignerActions.ts`
- Create: `web/src/ui/roomDesignerActions.test.ts`
- Modify: `web/src/ui/RoomPanel.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes Task 1 request/response types, Task 2 `buildRoomDesignProposal`, `/api/design-room`, `designStore`, catalog entries, and `SummarySources`.
- Produces `beginRoomDesignerPreview`, `cancelRoomDesignerPreview`, `applyRoomDesignerPreview`; all return an `ApplyResult`/boolean and own only their captured preview object.

- [ ] **Step 1: Write failing preview-action tests**

Assert the dialog’s preview leaves committed room and purchase lines unchanged, does not cancel another tool’s preview, refuses stale apply, applies all commands as one revision, and one undo restores both furniture and money. Include a `budget unknown` result where a proposed item has no known price.

- [ ] **Step 2: Run preview-action tests to verify they fail**

Run: `cd web && npm test -- --run src/ui/roomDesignerActions.test.ts`

Expected: FAIL because `roomDesignerActions.ts` does not exist.

- [ ] **Step 3: Implement owned preview actions**

Follow `lookActions.ts` and `PieceImportDialog.tsx`: cancel competing catalog previews before starting, store the exact `Preview` object returned by `startPreview`, cancel only when it remains the active preview, and apply using `{ actor: 'auto', baseRevision }`. On rejection, cancel the owned preview and surface the staleness/error text.

- [ ] **Step 4: Implement `RoomDesignerDialog` and wire it into the room panel**

Add a visible “Design with Gemini” action. The dialog has a labeled request textarea, optional budget amount/currency fields, consent checkbox, submit button, and an accessible busy/error state. Render the returned intent summary, costs/budget status, proposed changes, warnings/skips, and the explicit no-photo disclosure. `Preview design`, `Apply design`, `Discard`, Escape, and close follow Task 4 ownership actions. Disable Apply without the dialog’s live preview. Add responsive styles without hiding keyboard focus or status text.

- [ ] **Step 5: Run focused UI/action tests to verify they pass**

Run: `cd web && npm test -- --run src/ui/roomDesignerActions.test.ts src/roomDesigner/proposal.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/ui/RoomDesignerDialog.tsx web/src/ui/roomDesignerActions.ts web/src/ui/roomDesignerActions.test.ts web/src/ui/RoomPanel.tsx web/src/App.tsx web/src/index.css
git commit -m "feat: add Gemini room designer preview"
```

### Task 5: Record the product contract and verify the whole web app

**Files:**
- Modify: `docs/INDEX.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/DECISIONS.md`

**Interfaces:**
- Documents the public modules from Tasks 1–4, the intent-only decision, and privacy/budget/preview guarantees.

- [ ] **Step 1: Update documentation records**

Add architecture/index rows for `roomDesigner` and `RoomDesignerDialog`; prepend a changelog entry naming each new public type/function; record the decision to use model intent plus deterministic local command construction instead of model commands.

- [ ] **Step 2: Run all required checks**

Run: `cd web && npm run typecheck && npm run lint && npm test && npm run build`

Expected: PASS with the full suite, including all room-designer tests.

- [ ] **Step 3: Perform a manual local check**

Run the app at `http://127.0.0.1:5173`; test a budgeted black-room request, a random rearrangement, and a chair-replacement request. Confirm the consent copy says no photos are sent, preview changes are visible, discard restores the room, and apply followed by undo restores the previous room and subtotal.

- [ ] **Step 4: Commit**

```bash
git add docs web
git commit -m "docs: record Gemini room designer"
```

## Self-review

- Spec coverage: Tasks 1–4 cover the exact Gemini boundary, catalog/budget behavior, deterministic safe layout, privacy/consent, and owned preview/apply/undo. Task 5 covers repository records and full verification.
- Type consistency: Task 1’s `RoomDesignIntent` and `RoomDesignRequest` are the only model-facing types; Task 2 consumes those and returns `RoomDesignProposal`; Task 4 never turns Gemini output directly into commands.
- Review focus: each listed failure case has an explicit Task 1, 2, 3, or 4 test.
- Proportion: the plan specifies boundaries and testable interfaces, but leaves ordinary component and helper bodies to the executor.
