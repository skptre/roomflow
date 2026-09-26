# Roomflow Web — Overnight Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Tick boxes and append to the **Progress Log** at the bottom as work lands, so a resumed or fresh session knows exactly where to continue. A fresh session has NOT seen the planning conversation — the **Context** section below is everything it needs beyond `spec.md` and `CLAUDE.md`.

**Goal:** Build the browser half of Roomflow to a polished local demo: import a real RoomPlan scan, render it as a stylish architectural miniature, move/rotate/lock/remove furniture, browse a catalog with instant hover-preview in the room and an honest subtotal, apply a style theme that proposes a coordinated room, add an item "found in person" with honest dimensions, autosave, and walk through at eye level.

**Architecture:** Self-contained Vite + React + TypeScript app in `web/`. Pure, tested domain modules (`web/src/domain/`) own geometry, money, schemas, catalog ranking and design state; React Three Fiber components only render that state. The teammate's scan enters through one import adapter (`web/src/import/roomplan.ts`). Every external/AI concern (live search, photo→3D, chat) is deferred but gets a typed slot now, so it plugs in without rewrites.

**Tech Stack:** Node 24 / npm 11 (single `package-lock.json`), Vite, React 19, TypeScript strict, three + @react-three/fiber + @react-three/drei + @react-three/postprocessing, Zustand, Zod, Tailwind CSS v4, Motion (UI transitions), polygon-clipping (wall openings), Vitest.

**Spec:** `spec.md` (product) and `CLAUDE.md` (engineering rules). Read both first.

---

## Context (from the planning conversation — read this)

**Team split.** Two people. Teammate on a Mac builds the Swift/RoomPlan capture app in `ios/` on their own branch (getting Xcode running, scanning working, scan→3D accurate, exporting). This plan is the other person's side: everything browser-side, in `web/`. Never touch `ios/`. Tomorrow the halves merge.

**Scan contract.** Teammate was asked to export raw RoomPlan data: `JSONEncoder().encode(capturedRoom)` → `*.roomplan.json`, no phone-side conversion. Real scans should land in `fixtures/scans/`, ideally with a tape-measured wall for scale verification. Until then, use a synthetic fixture labeled synthetic.

**Product direction (user's words, condensed).** "Try on different versions of your actual room, then make one yours" / "Your room, with anything you find." Scan room → 3D miniature → customize everything (move, rotate, delete, add furniture and decor) from a catalog of real, traceable, priced products → hover/click anything to see what it looks like and costs → themes ("natural, earthy") that restyle the room with products → take a photo of something found in a store (e.g. a vase) and see it in the room → eye-level tour. **UX and visual polish are the top priority: "stylish polish", not photorealism — like Rumi's architectural miniature, but better.** Aesthetic direction is NOT decided yet — build on design tokens so the look is swappable in one place.

**Differentiation from Rumi** (HackMIT 2026 reference; github.com/IBS27/rumi — **no license: learn ideas, never copy code**). Rumi is chat-first: slow ("Rumi is thinking…"), one product per zone, no browsing, gray flat look, no view transitions, no in-person item capture, no themes. Roomflow is **hands-on first, AI second**: instant hover-preview from a catalog, several alternatives, themes, found-item capture, fuller composed rooms (bedding, lamps, decor — not bare frames), smooth transitions, room always prominent.

**Rumi ideas worth reusing (re-implement ourselves):**
- Object origin = base-center; meters, Y-up, right-handed; width=X, height=Y, depth=Z. Web does all normalization; keep raw scan.
- Wall openings via 2D polygon difference (`polygon-clipping`) → `THREE.Shape` with holes; doors touching floor become notches. Walls extruded 8–20 cm thick (RoomPlan walls are zero-depth and z-fight).
- Openings without `parentIdentifier` attach to a wall only if exactly one wall matches geometrically.
- Cutaway: only **exterior** walls (test floor-polygon membership on both sides), camera-facing ones drop to a low stub; hysteresis band to stop flicker.
- Lighting: hemisphere + one directional placed above the first window, shadow frustum fit to room, `RoomEnvironment` (no remote HDR). SSAO for contact shading. `frameloop="demand"` in overview.
- Procedural meter-scaled textures (woodgrain, weave, plaster…) with UVs in meters so grain never stretches.
- Parametric furniture: parts (box/cylinder/sphere) in a normalized unit box, scaled to authoritative product dimensions; rounded bevels (soft for fabric, ~4 mm for hard); ≤64 parts; validated with rotated half-extents inside the box. Later, an AI turns product photos into this same data (never code).
- While an asset prepares: translucent size-preview box + label "Preparing model". Floating label on select: name + W×D×H.
- Every edit (user or AI) goes through one validated command pipeline with `expectedRevision`; stale results rejected.

**User's progressive-retrieval idea** (from their prefix k-NN sketch-recognition work — a principle, not that classifier): narrow candidates as intent arrives (room type → budget → style → selection → hover). Hard constraints prune; soft preferences rerank so changing taste recovers earlier options. Three separate latencies: retrieval, ranking, visual preparation — a cached listing is not a ready-to-render asset. Preload a few likely assets, not the catalog. Reject results for stale intent.

**Catalog direction.** Preferred long-term: live discovery (SerpAPI/Exa) feeding a growing saved catalog (Convex), with background collection. Tonight: no keys → a clearly labeled **Sample** fixture behind a `CatalogSource` interface that live search implements later. Never fabricate URLs/prices; sample items have no URLs and show a "Sample" badge.

**3D asset direction.** Don't wait for a furniture-model dataset. Primary path to test: parametric assemblies (hand-authored tonight; AI photo→parts later, same schema). Secondary: GLB models (e.g. ABO, CC BY 4.0 with attribution) for complex shapes. The renderer supports `parametric | glb | placeholder` from day one.

**Out of scope tonight:** Convex, live search, any LLM call (chat, AI proposals, photo→3D), QR phone pairing, Object Capture. Out of the product entirely: checkout, voice, multiplayer, delivery-fit/accessibility claims.

## Global Constraints

- Units meters; frame right-handed **Y-up**; yaw = radians about +Y, CCW seen from above. RoomPlan conversion happens only in `web/src/import/roomplan.ts`.
- Object origin = bottom-center of footprint. `dimensions = { width: X, height: Y, depth: Z }`.
- Money = integer minor units + ISO currency + quantity. Unknown price ≠ 0. Never sum across currencies. Owned items add 0 new cost. Label as "Product subtotal" (no tax/shipping).
- Move/rotate never resizes a product. A different size is a different variant.
- Preview never mutates committed room, purchases, or subtotal. Commit = one transition. Undo reverses spatial + financial.
- Async results carry `baseRevision`; stale → rejected.
- Measurement provenance (`captured | merchant | user | estimated | unknown`) is separate from visual fidelity (`exact | approximate | placeholder`).
- No fabricated links, prices, measurements, scans. Fixtures labeled "Sample"/"synthetic" in UI.
- All colors/spacing/radii/fonts/motion from design tokens in `web/src/index.css` (`@theme`) and `web/src/scene/palette.ts`. No ad-hoc hex in components.
- Accessible names + visible focus + keyboard for primary controls. `prefers-reduced-motion` respected.
- Business rules never inside React components.
- Stay inside `web/`, `docs/`, `.github/`, `AGENTS.md`, this plan. Never touch `ios/`.

## Review Focus (each has a pinned test in the owning task)

1. **Door in a wall** → wall geometry leaves the door open. (Task 5)
2. **Rotated object** → 90° desk uses swapped footprint for bounds/overlap. (Task 2)
3. **Hover-preview then leave** → room, selection, subtotal deep-equal to before. (Task 4)
4. **One unpriced item** → subtotal "incomplete", budget "unknown", never "under budget". (Task 2)
5. **Hostile scan file** → NaN transforms / oversize / too many objects rejected readably; current room untouched. (Task 3)
6. **Theme applied then undone** → locked items never moved, kept items never removed, one undo restores everything incl. subtotal. (Task 10)

---

## File Structure

```
web/
  package.json, package-lock.json, vite.config.ts, tsconfig*.json, index.html, eslint.config.js
  src/
    main.tsx, App.tsx, index.css                 # shell + Tailwind @theme tokens
    domain/                                      # PURE TS — no React, no three
      units.ts  schema.ts  geometry.ts  money.ts
      assembly.ts        # parametric part schema + validator
      designStore.ts     # committed / preview / undo / revision (zustand vanilla)
      commands.ts        # validated edit commands (add/move/rotate/remove/replace/lock/keep/restyle)
      catalog.ts         # CatalogSource interface, filter (hard) + rank (soft), preload picks
      themes.ts          # theme definitions + deterministic proposal builder
      layout.ts          # free-spot search + simple room-relative placement rules
      foundItem.ts       # found-item record + dimension provenance rules
      persistence.ts     # SaveAdapter + IndexedDB/localStorage adapter
    import/roomplan.ts
    fixtures/
      synthetic-bedroom.roomplan.json
      sample-catalog.ts
      assemblies/*.ts
    scene/
      RoomScene.tsx  CameraRig.tsx  Lighting.tsx  Effects.tsx  palette.ts
      Architecture.tsx  wallGeometry.ts  cutaway.ts
      materials.ts       # procedural meter-scaled textures, shared + disposed
      AssetView.tsx      # parametric | glb | placeholder
      AssemblyMesh.tsx   FurnitureObject.tsx  HoverTag.tsx  Walkthrough.tsx
    ui/
      TopBar.tsx  FloatingPanel.tsx  Inspector.tsx  CatalogPanel.tsx  ProductCard.tsx
      SubtotalBar.tsx  ThemePicker.tsx  FoundItemFlow.tsx  ImportDrop.tsx  SaveStatus.tsx  StartScreen.tsx
  *.test.ts beside source
docs/contracts/room-import.md
.github/workflows/web-ci.yml
.github/pull_request_template.md
AGENTS.md
```

---

## Task 0: Scaffold, CI, PR system

- [x] Start from branch `feat/web-foundation` (created with this plan). Cut `feat/web-t0-domain` from it for PR1 (see PR Workflow).
- [x] `npm create vite@latest web -- --template react-ts`; in `web/`:
  `npm i three @react-three/fiber @react-three/drei @react-three/postprocessing postprocessing zustand zod motion polygon-clipping`
  `npm i -D @types/three vitest tailwindcss @tailwindcss/vite eslint`
- [x] Scripts: `dev`, `build` (`tsc -b && vite build`), `typecheck` (`tsc -b --noEmit`), `test` (`vitest run`), `lint` (`eslint .`). `strict` + `noUncheckedIndexedAccess` on.
- [x] Tokens in `index.css` `@theme`: neutral warm placeholder palette (surface, ink, muted, accent, danger, success), radius scale, spacing, font stack, motion durations/easings. Mirror 3D colors in `scene/palette.ts`. Comment at top: "Aesthetic TBD — change here only."
- [x] Shell: full-bleed canvas base layer; floating panels on top. StartScreen: "Import a room scan" (file picker + drag-drop) and "Open sample room (synthetic)".
- [x] Root `.gitattributes` with `* text=auto eol=lf` (Windows + Mac teammates; avoids CRLF churn in diffs).
- [x] `.github/workflows/web-ci.yml`: on PR + push to main, `working-directory: web`, Node 24, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- [x] `.github/pull_request_template.md`: What changed · User-visible result · Verified (commands run + browser checks, screenshots) · Not verified / limitations · Review focus for this PR.
- [x] `AGENTS.md` (Codex reads this): "Follow CLAUDE.md and spec.md." plus a **Review guidelines** section: prioritize money/unknown-price, preview isolation, undo, revision staleness, coordinate conventions, door openings, fabricated data, disposal of three.js resources, `ios/` untouched by web PRs; flag missing tests on those; mark findings blocking vs non-blocking; skip pure style nits.
- [x] Verify build/test/dev in browser pane. Commit `chore(web): scaffold app, CI, PR template, AGENTS.md`.

## Task 1: Units + core schemas

**Files:** `domain/units.ts`, `domain/schema.ts` (+ tests)

**Produces:**
```ts
export type Vec3 = { x: number; y: number; z: number };
export type Pose = { position: Vec3; yaw: number };                 // bottom-center
export function normalizeYaw(rad: number): number;                  // (-π, π]
export function poseFromColumnMajor(m: readonly number[], height: number): Pose;
// schema.ts — Zod, types via z.infer
MeasurementSource = 'captured'|'merchant'|'user'|'estimated'|'unknown'
Dimensions = { width, height, depth: finite > 0; source: MeasurementSource }
Wall = { id; start:{x,z}; end:{x,z}; height; thickness; exterior: boolean }
Opening = { id; kind:'door'|'window'|'opening'; wallId; offsetAlongWall; bottom; width; height }
AssetRef = { kind:'parametric'; assemblyId } | { kind:'glb'; url; attribution? } | { kind:'placeholder' }
RoomObject = { id; name; category; sourceKind:'captured'|'product'|'owned'|'found'; dimensions; pose;
  asset: AssetRef; fidelity:'exact'|'approximate'|'placeholder'; variantId?; offerId?; quantity;
  keep: boolean; lockPlacement: boolean; foundItemId? }
Room = { id; name; floorPolygon:{x,z}[]; walls; openings; objects; finishes:{ wall; floor; accent? };
  source:{ kind:'roomplan'|'synthetic'; importedAt; raw: unknown } }
Product { id; name; category; tags; images? } · Variant { id; productId; label; dimensions; asset }
Offer { id; variantId; merchant; url?; price: Money|null; retrievedAt; isSample }
FoundItem = { id; name; category; photoRef?; dimensions; price: Money|null; store?; link?; owned: boolean }
```
- [x] Tests: identity → yaw 0; +90° Y matrix `[0,0,-1,0, 0,1,0,0, 1,0,0,0, tx,ty,tz,1]` → yaw ≈ π/2, `y = ty − h/2`; `normalizeYaw(3π) ≈ π`; `Dimensions` rejects NaN/∞/0/neg; Offer accepts `price:null`; Room rejects opening with unknown `wallId`.
- [x] Implement (yaw = `atan2(m[8], m[0])`). Commit `feat(domain): coordinate conventions and core schemas`.

## Task 2: Geometry + money

**Produces:** `footprint`, `footprintsOverlap` (SAT, touching ≠ overlap), `insideRoom`, `clampIntoRoom` (same yaw/dims); `Money`, `Subtotal` (`complete | incomplete | mixed-currency`), `subtotal(lines)`, `budgetStatus` (`under|over|unknown|no-budget`), `formatMoney`.
- [x] Geometry tests: 2×1 desk yaw 0 → x-extent 2; yaw π/2 → 1 (**RF2**); shared edge → no overlap; 45° square SAT; half-outside object clamped fully inside, yaw/dims unchanged.
- [x] Money tests: `$10×2 + $5.99` → 2599 complete; owned excluded; null price → incomplete, unpricedCount 1 (**RF4**); `budgetStatus(incomplete)` → unknown even if known < budget; USD+EUR → mixed; non-integer throws; qty 0 → nothing.
- [x] Commit `feat(domain): footprint geometry and honest subtotal math`.

## Task 3: RoomPlan import + contract + synthetic fixture

**Produces:** `parseRoomPlanJson(text, opts?) → { ok:true; room; warnings } | { ok:false; error }`.
- [x] `docs/contracts/room-import.md`: expected file (raw `CapturedRoom` JSON), fields we read (`walls/doors/windows/openings/objects/floors`, `identifier`, `dimensions[3]`, `transform[16]` column-major, `category`, `confidence`, `parentIdentifier`, `polygonCorners`), normalization we apply, limits, open questions for the iOS side.
- [x] Synthetic fixture: 4×3.5 m bedroom, 4 walls, 1 door (with `parentIdentifier`), 1 window (without, to test geometric attach), bed/desk/chair/storage. `"_synthetic": true` → `source.kind='synthetic'`.
- [x] Tests: 4 walls, lengths 4.0/3.5 ±1 mm; door on correct wall; window attached geometrically; objects base on floor (y≈0); recentered, `source.raw` equals input; exterior flags correct; NaN → fail; >20 MB → fail; >500 objects → fail; not JSON → readable fail (**RF5**); unknown category → `'unknown'` + warning; accept flat-16 and nested-4×4 transforms.
- [x] Captured objects: `sourceKind:'captured'`, `dimensions.source:'captured'`, asset = best matching parametric template by category (else placeholder), `fidelity:'approximate'`, `keep:true`.
- [ ] When a real scan appears in `fixtures/scans/` (teammate's branch/merge), add a test on it: loads, wall count sane, tape-measured wall matches ±3 cm.
- [x] Commit `feat(import): RoomPlan JSON adapter, contract doc, synthetic fixture`.

## Task 4: Design store + command pipeline

**Produces:** `designStore` (vanilla zustand): `committed {revision, room, budget}`, `preview`, `selectedId`, `hoveredId`, `past/future` (≤100); `loadRoom`, `apply(cmds, {baseRevision?, actor:'user'|'auto'})`, `startPreview/cancelPreview/commitPreview`, `undo/redo`, `select`, `hover`; `viewRoom(state)`; `purchaseLines(room, offers)` — purchases **derived** from committed objects so cart and room can't drift.
`commands.ts`: `add | move | rotate | remove | replace | setKeep | setLock | restyle` — each validated (bounds via `clampIntoRoom`/`insideRoom`, overlap warning; `actor:'auto'` may not move/rotate locked or remove kept items).
- [x] Tests: apply bumps revision + history; undo restores room **and** subtotal; redo; new apply clears future; preview visible in `viewRoom` but committed + subtotal unchanged; cancel → deep-equal (**RF3**); commitPreview = one undo step; auto actor can't move locked / remove kept; stale `baseRevision` → rejected, room untouched; selection survives commit if object exists.
- [x] Commit `feat(domain): design store, validated commands, preview isolation, undo, revisions`.

## Task 5: Architecture (dollhouse)

**Produces:** `wallGeometry(wall, openings) → THREE.Shape` via polygon-clipping difference; extruded to `thickness` (default 0.12 m if scan gives 0). `cutaway.ts`: pure `wallsToCut(walls, cameraDir, prevCut) → Set<id>` with hysteresis (on 0.25 / off 0.15), exterior walls only.
- [x] Tests: no openings → 1 outer ring, 0 holes; floor door → notch, **no solid over door area** (**RF1**); window → hole; opening clipped to wall; overlapping openings merged; cutaway doesn't toggle on small camera jitter; interior partition never cut.
- [x] `Architecture.tsx`: floor from polygon with meter-UV procedural wood; walls plaster; doors/windows as simple frames (translucent glass). Cut walls ease to 0.3 m stubs (instant under reduced motion).
- [x] `CameraRig`: fit to bounding sphere (both FOVs), ~40° elevation, polar clamp, damped `OrbitControls`; fit once per room so panel resizing never resets orbit. `Lighting` + `Effects` (subtle SSAO/N8AO, SMAA), `frameloop="demand"`.
- [x] Browser check: screenshot overview, orbit 360°, door gap visible, no wall flicker. Commit `feat(scene): dollhouse architecture with openings, thickness, exterior cutaway`.

## Task 6: Assets — parametric furniture, GLB slot, placeholder

**Produces:** `assembly.ts` schema: `Part { name; shape:'box'|'cylinder'|'sphere'; size; position; rotation?; color; material:'matte'|'wood'|'metal'|'glass'|'fabric'|'ceramic'|'leaf'; texture?:'plain'|'woodgrain'|'weave'|'plaster'|'knit' }`, `Assembly { id; category; generatorVersion:'hand-v1'; parts: 1..64 }`, validator with rotated half-extents inside unit box (1% tolerance). `AssetView` renders by `AssetRef.kind`.
- [x] Tests: >64 parts, NaN, part outside box (incl. only-after-rotation), bad material/color rejected; all fixture assemblies valid.
- [x] Author ~16 assemblies, **composed not bare**: bed *with bedding + pillows*, nightstand, desk, desk chair, lounge chair, sofa, coffee table, floor lamp, table lamp, bookshelf *with books*, dresser, rug, plant (pot + leaf clusters), wall art, mirror, vase. Rounded bevels (fabric soft, hard ~4 mm), shared materials, `castShadow`.
- [x] `placeholder`: translucent tokened box + "Preparing model" label. `glb`: drei `useGLTF` scaled to authoritative dims (no GLB assets yet — loader path + a tiny generated test GLB is enough).
- [x] Browser check: lineup screenshot; every piece recognizable at dollhouse distance. **Iterate until it looks good — boxes that read as boxes are not done.** Commit `feat(scene): validated parametric furniture, GLB slot, preparing placeholder`.

## Task 7: Look & feel foundation

- [x] `materials.ts`: procedural 256² textures (woodgrain, weave, plaster, knit) generated once, cached, disposed; meter UVs.
- [x] Palette/lighting pass on the synthetic room with furniture: warm key light from window, soft shadows, contact shading, tone mapping. Two alternate palettes in `palette.ts` behind a dev toggle, so the user can pick an aesthetic later.
- [x] UI primitives: FloatingPanel, buttons, chips, tooltips — tokened, Motion transitions (≤200 ms, reduced-motion aware), focus rings.
- [x] `HoverTag`: hover any object → small floating tag (name · "Yours" or price · dims), never covering the object; click → select with lift + outline.
- [x] Browser check: 3 screenshots (overview, hover, selected). Must look warmer, fuller, calmer than Rumi's gray/flat look. Commit `feat(ui): design tokens, materials, lighting, hover tags`.

## Task 8: Direct manipulation

- [ ] Drag on floor (live pose in a ref, no per-frame store writes; commit on pointer-up through `move`). Red tint while overlapping/outside; invalid release snaps back.
- [ ] Rotate: `R`/`Shift+R` ±15°, inspector buttons, ring handle. Remove: Delete + button. Inspector: name, dims with provenance dot ("measured" / "listed" / "you measured" / "estimated"), "Keep in new designs", "Lock position" + one-line explanation. Locked → drag refused, lock badge.
- [ ] Undo/redo: `Ctrl+Z` / `Ctrl+Shift+Z` + TopBar buttons. Camera never moves on undo.
- [ ] Browser check: move, rotate 90°, undo ×2 → original; lock bed → can't drag. Commit `feat(scene): select, drag, rotate, remove, keep/lock, undo`.

## Task 9: Catalog, hover-preview, subtotal, progressive retrieval shape

**Produces:** `catalog.ts`: `interface CatalogSource { query(q: CatalogQuery): Promise<CatalogResult> }`; `CatalogQuery { roomType?; category?; budgetRemaining?; themeId?; nearObjectId?; baseRevision }`; `filterHard(items, q)` (category, fits floor, price ≤ remaining when known) and `rankSoft(items, prefs)` (theme tags/colors/materials); `preloadPicks(ranked, n=3)`. `SampleCatalogSource` implements it over `fixtures/sample-catalog.ts`.
- [ ] Tests: hard filter prunes over-budget/too-big; unknown-price items kept but flagged; changing theme reranks without losing items; stale `baseRevision` result ignored by consumer; `preloadPicks` returns ≤ n distinct.
- [ ] Sample catalog: ~40 products across all assembly categories, 1–3 variants each (sizes = variants), color/material variants sharing assemblies via recolor, `merchant:'Sample catalog'`, no URLs, `isSample:true`, one `price:null`.
- [ ] CatalogPanel: category tabs + "Alternatives for this {object}" when something is selected. **Hover/focus a card → instant in-room preview** (camera fixed); leave → cancel; click → variant + qty → commit. Preload top picks' assets when panel opens.
- [ ] "Add to room" uses `layout.freeSpot` (spiral search) or shows "No free space for this size".
- [ ] SubtotalBar: "Product subtotal", budget input, states complete / "Price unknown for N items" / mixed / over; expandable lines; owned items "Already yours". "Sample" badge while sample data.
- [ ] Browser check: hover rug → preview → leave → subtotal unchanged; commit → updates; undo → reverts. Commit `feat(ui): catalog with hover preview, honest subtotal, ranking pipeline`.

## Task 10: Themes → coordinated proposals ("Try a look")

**Produces:** `themes.ts`: `Theme { id; name; palette (wall, floor, accent); materials; tags }` × 3 placeholders (Warm natural, Clean minimal, Colorful) — names/looks are placeholders, aesthetic TBD. `buildProposal(room, theme, catalog, budget) → { commands; subtotal; notes; baseRevision }`, deterministic: restyle finishes; for each non-kept replaceable object pick best-ranked same-category variant within budget allocation; add missing essentials (lamp, rug, plant, art) via `layout` rules (bed on long wall away from door, desk near window, rug under bed/sofa, lamp beside bed/desk); respect locks/keeps.
- [ ] Tests (**RF6**): locked never moved; kept never removed; within budget or explicit conflict note (never silently over); same input → same output; apply + single undo restores room and subtotal.
- [ ] ThemePicker: 3 cards; hover a card → whole-room preview (camera fixed); click → "Make it mine" commits; compare by hovering between cards. Change list shown ("Swapped desk chair · +$89").
- [ ] This is the slot an LLM fills later (it only chooses/ranks; code still builds/validates commands).
- [ ] Browser check + screenshots of the 3 looks from the same angle. Commit `feat(design): themes as deterministic coordinated proposals`.

## Task 11: "Add something I found"

**Produces:** `foundItem.ts`: `createFoundItem(input) → FoundItem` + `dimensionsFor(input)`: all 3 given → `user`; one given → scale category template proportionally, others `estimated`; none → category defaults `estimated` + fit conclusions disabled.
- [ ] Tests: provenance per case; owned → 0 new cost; no price → unknown, no fake merchant/link; overlap warnings shown as "can't confirm fit" when dims fully estimated.
- [ ] FoundItemFlow: photo (file/camera input) → pick category (vase, chair, lamp, …) → dimensions (any subset) → optional price/store/link/owned → placed via free-spot. Appearance tonight: category assembly tinted with the photo's dominant color (client-side), badge "Approximate look". Photo stays local.
- [ ] Leave a typed slot for AI photo→parts (same `Assembly` schema) — do not implement.
- [ ] Browser check: add a vase with height only; inspector shows "height: you measured · width/depth: estimated". Commit `feat(found): add items found in person with honest dimensions`.

## Task 12: Persistence + import UX

**Produces:** `SaveAdapter { load; save }`, `LocalAdapter` (IndexedDB for raw scan + photos, localStorage for small state), `SavedSession v1`.
- [ ] Tests: round-trip keeps locks/keeps/variants/budget/found items/revision; preview never saved; corrupt data → null + surfaced error; older revision save ignored; quota error → `failed`, in-memory kept.
- [ ] Autosave 800 ms debounce; SaveStatus (Saved / Saving / "Couldn't save — changes still here" + Retry). Reopen restores. "Reset to scanned room". Import errors readable, current room untouched.
- [ ] Commit `feat(persistence): local autosave and restore`.

## Task 13: Eye-level walkthrough

- [ ] "Step inside": eased camera flight to 1.6 m at doorway, walls restored, WASD/arrows + drag-look, circle-vs-footprint/wall collision (reuse geometry), `frameloop="always"` only here. Esc/"Back" returns to the exact previous orbit. Same `viewRoom` state.
- [ ] Browser check. Commit `feat(scene): eye-level walkthrough`.

## Task 14 (stretch): polish sweep
Empty/loading/error states everywhere, mobile-width check, keyboard-only pass, draw-call/texture check, first-render stutter (pre-compile materials on preload).

---

## PR Workflow (Codex reviews)

- One PR per group: **PR1** T0–2 · **PR2** T3 · **PR3** T4 · **PR4** T5–6 · **PR5** T7–8 · **PR6** T9 · **PR7** T10 · **PR8** T11 · **PR9** T12–13.
- Branch names: `feat/web-pr1-foundation`, `feat/web-pr2-import`, … Base = `main` if the previous PR is merged, otherwise the previous PR's branch (stacked; GitHub retargets when the base merges).
- Before opening: `npm run typecheck && npm run lint && npm test && npm run build` in `web/`; browser screenshots for visual work. Fill the PR template honestly, including what was NOT verified.
- **Roles:** Claude builds and opens PRs. **Codex owns review, testing and merging** (separate checkout; reviews against spec + surrounding code; runs checks; exercises visual changes; merges in order with merge commits). The human reviews visual/aesthetic items Codex flags. **Claude never merges.**
- **GitHub labels are the handshake** (no one polls chat; both sides read the PR):
  | Label | Set by | Meaning |
  |---|---|---|
  | `needs-review` | Claude | ready for Codex (new PR, or fixes pushed) |
  | `changes-requested` | Codex | has blocking findings (review comments prefixed `BLOCKING:`) |
  | `needs-human` | Codex | aesthetic/subjective call for the human; does not block merge unless Codex says so |
  | `approved` | Codex | reviewed at the current head SHA; Codex will merge |
- **Claude's loop — check PRs at every task boundary** (before starting the next task):
  1. `gh pr list --author @me --state open --json number,title,labels,headRefName`
  2. For any PR labeled `changes-requested`: read comments (`gh pr view N --comments`, `gh api repos/skptre/roomflow/pulls/N/comments`), check out its branch, fix every `BLOCKING:` item (add a regression test where it's logic), run all checks, push, reply on each thread with what changed, swap label `changes-requested` → `needs-review`. Fixes to open PRs take priority over new tasks.
  3. If a lower PR in the stack received fixes, merge its branch into the PRs stacked above it (no rebase/force-push) and push those too.
  4. Then continue the next task.
- **Opening a PR:** `gh pr create --base <main or previous PR branch> --label needs-review`, body = PR template. Base = `main` if the previous PR is merged, else the previous PR's branch (stacked; GitHub retargets when the base merges — Codex deletes merged branches). CI must be green.
- **When all tasks are done or Claude is blocked:** enter a wait loop (`/loop` self-paced, ~20–30 min wakeups) that runs step 2 until every PR is merged or only `needs-human` items remain. This loop lives in the session — it stops if the app closes or usage runs out.
- Never force-push. Never push to `main`. Never touch `ios/` or the teammate's branch.

## Progress Log

<!-- One line per finished task: time · task · commit/PR · notes (what's unverified). -->
- 2026-09-26 · T0 scaffold · branch feat/web-pr1-foundation · Vite 8/React 19/TS 6 template; template ships oxlint (kept instead of eslint, `--deny-warnings`). Browser: start screen renders, keyboard + focus ring OK, no console errors. CI not yet run on GitHub.
- 2026-09-26 · T1 units + schemas · feat/web-pr1-foundation · 13 tests. Money schema lives in schema.ts (Offer/FoundItem need it); opening offset = wall start → opening center.
- 2026-09-26 · T2 geometry + money · feat/web-pr1-foundation · 41 tests total. budgetStatus is 'unknown' whenever any price is unknown (review fix). insideRoom and clampIntoRoom handle concave rooms (nearest-fit grid fallback, review fix).
- 2026-09-26 · T3 RoomPlan import · feat/web-pr2-import · 21 import tests; added Room.source.nativeToApp (capture→app mapping). No real scan in fixtures/scans/ yet — real-scan test still open. Open questions for iOS in docs/contracts/room-import.md.
- 2026-09-26 · T4 design store + commands · feat/web-pr3-store · 27 new tests (91 total). Purchases derived from committed objects (captured/owned = owned). Revision bumps on undo/redo/setBudget too. User may move locked items at command level; UI refuses drag (T8).
- 2026-09-26 · T5 dollhouse architecture · feat/web-pr4-scene · wall profiles via polygon-clipping (RF1 pinned), exterior cutaway w/ hysteresis, camera fit once per room, key light through first window, N8AO+SMAA+AgX. Browser: sample room opens, orbit 4 angles, door gap + window visible, cut walls follow camera. Furniture still sized boxes (T6). Visual polish pending T7.
- 2026-09-26 · T6 assets · feat/web-pr4-scene · Assembly schema + validator (≤64 parts, rotated bounds, 1% tol), 16 composed assemblies, meter-UV part geometry cache, shared materials, AssetView (parametric|glb|placeholder w/ error+suspense fallback), dev lineup at ?lineup, test GLB generator. Convention added: object front faces local +Z; fixture bed/desk/chair yaws updated. Browser (Chrome DevTools, since pane hidden): lineup + room screenshots OK. Dev-only console noise: drei Html unmount warning under StrictMode.
- 2026-09-26 · T7 look & feel · feat/web-pr5-interact · weave/knit textures, wall section tone, shadow-catcher ground, Neutral tone mapping, stronger AO; palettes warm (default) / stone / clay via ?palette= (CSS + scene); Button/Chip/FloatingPanel/Tooltip + motion tokens + MotionConfig reducedMotion=user; HoverTag (name · Yours/price · W×D×H) anchored above projected silhouette; click selects with lift + outline; click empty clears. Browser (Chrome DevTools): overview, hover, selected, 2 alt palettes.
