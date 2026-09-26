# Roomflow — Product & Technical Specification

Version: 0.1 · September 26, 2026  
Status: Consolidated product direction; implementation recommendations are identified separately.

> Your room, with anything you find.

## 1. What Roomflow is

Roomflow is an immersive room-design and spatial-shopping application. Users bring their actual room into an editable 3D environment, explore coordinated designs, rearrange furniture, and visualize real products before purchasing them. They can also photograph items they encounter in person and bring approximate previews into the same room.

The application connects four things that are usually separate: the physical room, the user's taste, available products, and the cost of the proposed changes.

The central experience is **trying on different versions of your room, then making one yours**. A user can begin with a style or natural-language request, compare complete proposals, and refine individual objects directly. Their room remains the main interface throughout.

Example request:

> Keep my bed and desk. Make this room warmer and less cluttered for under $600.

Roomflow should return an editable arrangement of actual selected products, preserve the requested furniture, and show the new-purchase subtotal. It should also support the reverse starting point:

> I found this chair. Show it in my room, then help me make the rest of the room work with it.

This document specifies intended behavior. It does not claim that these features are implemented or that performance has been benchmarked. It excludes development-environment setup, agent workflows, and a build timetable.

## 2. Product goals

- Make the relationship between a real room and its digital version immediately recognizable.
- Make room redesign visually satisfying, easy to understand, and reversible.
- Connect design decisions to real products, source links, and traceable prices.
- Support existing possessions, online discoveries, and items found in person in one space.
- Let users make local changes without losing the rest of their design.
- Deliver a coherent, polished 3D experience comparable in presentation quality to the Rumi reference demo.
- Preserve the distinction between measured geometry, inferred appearance, and approximate product previews.

### Primary use cases

| Situation | User goal | Successful outcome |
| --- | --- | --- |
| Furnishing a bedroom or living room | Find a coordinated set within a budget | Editable proposal with products, placements, and subtotal |
| Refreshing an existing room | Replace a few things while keeping favorites | Preserved furniture with focused changes |
| Shopping in person | Decide whether a discovered item belongs at home | Captured item preview placed in the saved room |
| Comparing purchases | Choose among products without imagining each separately | Consistent-camera previews and clear price differences |
| Rearranging existing furniture | Explore a better orientation or layout | Updated arrangement without adding purchase cost |

These are product hypotheses, not claims of completed user research.

## 3. Experience principles

### The room leads

The room occupies most of the workspace. Shopping and design controls support it without permanently overwhelming it. Eye-level exploration minimizes interface chrome.

### Changes are understandable

Keep the camera stable when comparing proposals or replacing a product. Make it obvious what changed and what it costs. Avoid unexplained whole-room regeneration for local requests.

### The user retains control

Users can select, move, rotate, remove, replace, keep, and lock objects. Generated proposals remain inspectable and editable. Previewing an option does not commit it.

### Preferences persist

Instructions such as “keep my bed,” “do not move the desk,” or “stay under $600” survive subsequent refinements until the user changes them.

### Appearance is a core requirement

Recognizable silhouettes, materials, lighting, camera composition, transitions, and interaction feedback are part of the product. A functional collection of boxes is an intermediate engineering state, not the intended finished experience.

### Uncertainty is represented in the data

An attractive mesh does not establish exact product geometry. A plausible dimension does not establish measured fit. Missing prices do not count as zero-cost items.

## 4. Main user journey

1. **Bring in a room:** capture it on a supported phone or import a saved Roomflow-compatible scan.
2. **Review the room:** inspect the result, correct obvious interpretation errors, and identify furniture that stays.
3. **Set direction:** choose a style preset or describe a goal; optionally attach inspiration imagery.
4. **Set the purchase budget:** specify the budget for new items.
5. **Explore proposals:** compare coordinated designs in the same room.
6. **Customize:** move objects, change orientations, preview alternatives, and refine through natural language.
7. **Add a discovery:** search online or capture an item found in person.
8. **Step inside:** inspect the chosen arrangement at eye level.
9. **Review purchases:** inspect product links, prices, quantities, and subtotal.
10. **Return later:** reopen the saved room and continue from the committed design.

## 5. Room capture and import

### Required behavior

- Capture room structure using a supported LiDAR-equipped Apple device.
- Preserve available walls, floor boundaries, doors, windows, openings, recognized objects, dimensions, and transforms.
- Transfer the result into the browser workspace.
- Save the capture so the room can be reopened without rescanning.
- Keep the original capture separate from later design edits.
- Allow review and correction of object category or visual appearance when capture interpretation is incomplete.

### Geometry and appearance

Room measurement and visual reconstruction are separate operations. RoomPlan provides a parametric representation; it does not automatically provide detailed, manufacturer-quality furniture models or a fully finished interior rendering.

Reference photos can help infer wall colors, flooring, materials, and existing furniture appearance. Those inferences must not silently overwrite measured geometry. Objects inferred only from photos need separate provenance and estimated placement/dimensions.

### Transfer options

Saved-file import is an acceptable initial transfer mechanism. QR pairing or direct upload is a recommended experience improvement, not a finalized dependency. A saved genuine scan is valid for demonstrations; live scanning is not required during judging.

### Acceptance criteria

- A captured room opens with consistent scale and orientation.
- Doors and openings remain openings in the generated architecture.
- The original room is recoverable after edits.
- Reopening preserves the committed arrangement.
- Missing visual detail does not destroy the measured capture or block room inspection.

## 6. Editable 3D room

### Overview

Provide a dollhouse-style perspective with orbit, pan, and zoom. Camera-facing walls should be cut away or lowered to reveal the room. The initial camera should frame the useful space clearly.

### Object interactions

- Select an object and see its identity and relevant controls.
- Drag or otherwise reposition it on an appropriate supporting surface.
- Rotate it with clear feedback.
- Remove it from the proposed design.
- Replace it with another product in the same functional role.
- Undo committed changes.
- Restore or compare the original room state.

Moving or rotating a purchasable product must preserve its listed dimensions. Choosing another size means selecting another variant. Existing or custom objects may have explicitly editable measurements, with provenance updated accordingly.

### Keep versus lock

These controls have different meanings:

- **Keep:** preserve the item in future proposals; it may move unless placement is locked.
- **Lock placement:** preserve its position and orientation through automated changes.

The interface should explain this distinction without forcing users to learn technical state terminology.

### Eye-level exploration

Use the same committed scene and product assets as the overview. Restore full-height walls where appropriate and offer straightforward navigation and an obvious return control. Basic movement constraints should prevent walking through major walls and furniture footprints.

The walkthrough is a visual spatial preview, not a certified accessibility or delivery-route assessment.

## 7. Presets, natural language, and design proposals

### Inputs

Accept room state, preserved items, placement locks, budget, style preferences, and a natural-language goal. Inspiration-image input is desired but its priority remains open.

### Presets

Presets define preferences such as palette, material mix, and product-selection tendencies. They must adapt to the imported room rather than load a separate prebuilt showcase room.

Suggested starting directions are warm/natural, clean/minimal, and colorful/expressive. These names and visual definitions are recommendations, not finalized branding.

### Proposal contents

Each proposal contains:

- A set of existing objects to retain.
- Selected real product identities and variants.
- Placements and orientations.
- The product subtotal and budget status.
- A concise explanation of major changes.
- Any unresolved dimensions, prices, or pending assets relevant to the proposal.

### Comparison and refinement

Support a small number of visually distinct alternatives, ideally two or three. Preserve the viewing angle during comparison. Selecting a proposal is distinct from previewing it.

Example refinements:

- “Keep this layout, but make the chair cheaper.”
- “Make the room warmer without replacing the bed.”
- “Rotate the desk toward the window.”
- “Use this captured lamp in all the alternatives.”

### Placement strategy

Recommended implementation: the model interprets intent and proposes relationships; deterministic code evaluates coordinates, boundaries, overlaps, supported surfaces, locks, and budget.

Candidate layouts can use room-relative rules such as usable wall segments, desk-adjacent lighting, and clear entry areas. A small set of adaptable strategies is preferable to unconstrained coordinate invention.

If no feasible design satisfies the constraints, preserve the current room and explain the conflict. Do not silently exceed the budget or move locked items.

## 8. Shopping catalog and real products

### Catalog experience

Provide an internal browsing experience with product cards, images, prices, categories, and source links. The catalog combines previously prepared products with new live discoveries.

The room and shopping state must remain synchronized. Selected products have a direct relationship to placed objects. Existing furniture and decorative representations must not masquerade as purchasable catalog listings.

### Product identity

Preserve merchant identity, source URL, product identifier where available, and variant information. Different sizes or colors may have different prices and availability.

Deduplicate repeated results without merging distinct variants or unrelated retailer offers. An item may have multiple offers; the selected price must refer to a specific offer.

### Preview versus commitment

Hovering or tapping a preview temporarily substitutes an alternative in the scene. Canceling restores the previous object. Committing changes the room and purchase list together.

### Budget behavior

- Track new purchases using integer minor currency units and an explicit currency.
- Multiply price by quantity.
- Exclude owned furniture from the new-purchase subtotal.
- Display the amount as a product subtotal unless tax/shipping are included explicitly.
- Never treat an unknown price as zero.
- Preserve price retrieval time and source.
- If a refreshed price changes, surface the change rather than silently rewriting an accepted estimate.
- Do not claim a design is within budget when unpriced required items make that conclusion unsupported.

The initial experience links to retailers. Multi-retailer payment execution is outside the defined core product.

## 9. Capture something found in person

### Purpose

Let users bring furniture or decor from a store, thrift shop, secondhand seller, or their existing possessions into their saved room.

### Flow

1. Choose **Add something I found**.
2. Take or upload a photo; optionally add complementary views.
3. Confirm the intended object and crop or identify it if the scene is cluttered.
4. Supply or confirm dimensions.
5. Optionally record a price, store, seller link, or note; identify whether the item is already owned.
6. Prepare an approximate 3D preview through the same asset pipeline used for online products.
7. Place it in the room and optionally design around it.

### Measurement handling

| Evidence available | Behavior |
| --- | --- |
| Dimensions visible on a label or listing | Extract and ask the user to confirm |
| User measures width, depth, height | Store as user-supplied measurements |
| One known dimension | Anchor overall scale; keep remaining dimensions estimated |
| No reliable measurement | Permit approximate appearance preview, without a verified-fit claim |
| Depth-enabled object capture | Record capture provenance and measurement uncertainty |

A single ordinary photo does not establish absolute size. Hidden surfaces and occluded parts remain inferred even when the visible silhouette is plausible.

### Scope boundary

Photo-based item capture is part of the intended product. Full multi-view object scanning is an optional extension. Whether photo capture ships in the first implementation depends on the asset pipeline, but it must not be silently dropped from the product definition.

Imported items do not require a fabricated merchant link or invented price.

## 10. Product asset pipeline

### Recommended primary experiment

Evaluate photo-to-parametric-assembly generation early. This is the approach observed in Rumi's source: product photos become a structured description of simple geometric parts, which a shared renderer turns into an approximate 3D object.

Roomflow should validate the visual quality of this method on representative chairs, tables, lamps, sofas, and plants before committing to it as the universal asset strategy.

### Proposed processing flow

1. Collect product images or user photos and dimension evidence.
2. Select useful complementary views.
3. Generate a structured assembly: shape, position, size, rotation, color, and material for each part.
4. Validate allowed geometry, bounds, finite numeric values, and complexity limits.
5. Retry a bounded correction when appropriate.
6. Render with consistent materials, softened edges, and scene lighting.
7. Save the result with source references, fidelity status, and generator version.
8. Reuse it across sessions and placements.

The model returns data, not executable code. Dimension provenance remains separate from generated geometry. A product with uncertain dimensions can have an appearance preview, but not an asserted exact scale or fit.

### Asset sources

Use an existing product-linked model where available and appropriate. Use parametric generation for suitable shapes. Consider an image-to-3D service for selected complex assets if its output quality justifies latency and cost.

All substituted or generated representations need an explicit approximate-fidelity status. A visually similar asset is not evidence that it is the exact manufacturer's model.

### Async behavior

- Product results can appear before models are ready.
- Keep the current selected furniture visible while alternatives prepare.
- For a new placement, offer a restrained dimension-based placeholder with a clear preparation state.
- On failure, preserve product information and allow retry or another choice.
- Cache by stable product/variant identity and relevant input/generator version.
- Bound retries and prevent duplicate paid jobs.

No instant-generation latency claim is assumed by this specification.

## 11. Progressive retrieval and preloading

Use partial intent to prepare likely results before the user commits. This borrows the principle of progressive narrowing from the user's prefix-kNN work; it does not require porting that classifier or claiming a new retrieval algorithm.

| Signal | Background work |
| --- | --- |
| Room type known | Retrieve likely categories |
| Budget set | Apply price constraints and category allocation |
| Style selected | Rank coordinated products and load thumbnails |
| Object or region selected | Prepare relevant alternatives |
| Category panel opened | Preload a few likely 3D assets |
| Alternative previewed | Finish preparing its scene representation |

Separate three costs: product retrieval, ranking, and visual-asset preparation. A database cache addresses only part of the perceived delay.

Hard constraints may eliminate candidates. Soft preferences generally rerank them, allowing recovery when intent changes. Do not preload the entire catalog.

Combine initial collection, demand-driven discovery, and selective freshness checks. Use job deduplication, bounded concurrency, cancellation or stale-result rejection, and clear progress states.

## 12. Visual and interaction specification

### Intended aesthetic

A coherent architectural miniature: soft contact shading, believable proportions, recognizable furniture, restrained materials, and a carefully composed room. Full photorealism is not a prerequisite; visual consistency is.

### Interface structure

- Main room canvas.
- Compact design-direction and proposal controls.
- Contextual product alternatives.
- Visible purchase subtotal with an expandable item list.
- Accessible undo, before/after, and enter-room controls.
- A lightweight prompt entry point that does not turn the room into a secondary attachment to a chat transcript.

Exact panel positioning, palette, typography, and motion timings remain design decisions. They should be defined as a small consistent system, not invented independently per component.

### Quality requirements

- Camera changes are deliberate and reversible.
- Selected objects are easy to distinguish.
- Labels do not bury important room details.
- Loading does not blank the whole scene.
- Model swaps do not reset the camera.
- Furniture should appear grounded rather than floating.
- Overview and eye-level modes show the same design state.
- Decorations and supporting surfaces behave coherently.
- Provide accessible labels and keyboard-operable primary controls; do not rely only on color for status.
- Offer reduced motion for nonessential transitions.

## 13. Data model outline

These are conceptual records, not finalized TypeScript definitions.

| Record | Important fields |
| --- | --- |
| Room | ID, source capture, units, coordinate frame, surfaces/openings, original object inventory, current revision |
| Room object | ID, category, source kind, dimensions and provenance, transform, asset reference, keep/lock flags, optional product variant reference |
| Product | ID, category, name, variant attributes, images, style/material tags, measurement evidence |
| Offer | Merchant, product/variant reference, URL, price, currency, availability evidence, retrieval time |
| Asset | ID, inputs/version, status, format, model data or URL, fidelity, bounds, source/license metadata, error state |
| Design proposal | Base room revision, constraints, selected items/offers, placements, subtotal completeness, explanation, status |
| Captured item | Photos, user confirmation, dimensions/provenance, optional price/location/link, ownership status, asset reference |
| Session | Room reference, committed design, preferences, budget, proposal history, saved state |

### Invariants

- Use one coordinate convention throughout; recommended: meters, right-handed, Y-up, documented yaw convention.
- Preserve the mapping from native capture coordinates into the application frame.
- Transient previews do not mutate committed purchases.
- Commit room changes and purchase-list changes atomically where possible.
- Reject or explicitly reconcile async results based on stale room revisions.
- Measurement provenance is distinct from appearance confidence.
- Unknown values remain unknown.
- Decorative copies do not create duplicate purchases accidentally.
- Undo restores both geometry and financial state affected by an edit.

## 14. Reliability and product integrity

- Search failure leaves the saved catalog and current room usable.
- Generation failure leaves the original item or placeholder available.
- Autosave failures are visible and do not pretend edits were persisted.
- Reopening restores the latest successfully committed state.
- Product links, images, and asset references remain associated with the correct variant.
- Private room photos and scans belong to the user's session/account; arbitrary users cannot fetch them by guessing identifiers.
- API secrets remain server-side.
- Validate external product data and model output before applying changes.
- Label sample fixtures and recorded results when presented as such.
- Do not imply that a successful room footprint check proves an item can traverse a doorway, stairwell, or delivery route.

## 15. Feature boundaries

### Core product definition

- Real-room capture and saved import.
- Attractive editable 3D room.
- Keep and placement-lock controls.
- Presets and natural-language refinement.
- Coordinated product-based design proposals.
- Move, rotate, remove, replace, preview, commit, and undo.
- Real product listings and purchase subtotal.
- Saved room/session.
- Before/after or proposal comparison.
- Eye-level exploration.
- Bringing personally photographed items into the room.

### Optional enhancements

- Inspiration-photo interpretation.
- Seamless phone/browser pairing.
- Full object scanning with depth and multi-view reconstruction.
- More asset-generation methods and richer materials.
- Larger catalog and more room types.
- More advanced layout optimization.

### Outside the current core

- Agentic checkout or payment processing.
- Whole-home architecture editing.
- Structural renovation planning.
- Certified accessibility, safety, or delivery-fit assessments.
- Multiplayer/roommate negotiation.
- Voice agents, VR hardware, or additional interaction modes without a demonstrated need.

## 16. Acceptance scenarios

1. **Authentic room:** import a genuine scan and recognize its layout; inspect matching scale and orientation.
2. **Preserved item:** request a redesign while keeping and locking the bed; verify it is neither removed nor moved.
3. **Local refinement:** replace a lamp without modifying unrelated furniture.
4. **Preview isolation:** preview a chair, cancel, and verify both room and subtotal return unchanged.
5. **Committed purchase:** choose a variant and quantity; verify the placed representation and subtotal reference that choice.
6. **Budget conflict:** request an infeasible combination; receive a useful explanation instead of an unsupported under-budget claim.
7. **Captured discovery:** upload item photos and supplied dimensions; place an approximate preview without inventing a merchant listing.
8. **Stale result:** edit the room while generation runs; the old result must not overwrite the newer design automatically.
9. **Asset failure:** simulate failed generation; preserve usability and offer retry or alternatives.
10. **Persistence:** reopen the room and recover committed edits, locks, selected products, and budget.
11. **Visual consistency:** switch between overview and walkthrough; verify the same arrangement and recognizable assets.
12. **Uncertain evidence:** remove reliable dimensions or price; verify the interface avoids unsupported fit or budget claims.

Performance should be evaluated on the actual demonstration hardware. Immediate local feedback is a goal; remote generation and search timings require measurement before numerical promises are set.

---

# Appendices — Technical Recommendations & Research

## A. Recommended architecture

| Layer | Recommendation | Role |
| --- | --- | --- |
| Capture | Swift + Apple RoomPlan | Parametric room measurement |
| Browser app | React + TypeScript + Vite | Room and shopping workspace |
| Rendering | Three.js + React Three Fiber + Drei | Geometry, cameras, model loading, interaction |
| Client state | Zustand | Local selection, preview, edit history |
| Interface | Tailwind CSS + custom design tokens; Motion | Consistent controls and transitions |
| Backend | Convex | Catalog, saved state, storage, background jobs |
| Search | SerpAPI Google Shopping | Shopping-oriented product discovery |
| Enrichment | Exa Contents as needed | Merchant-page content retrieval |
| Interpretation | One suitable multimodal model API | Preferences, image interpretation, structured proposals/assemblies |
| Validation | Zod plus deterministic geometry/budget code | Structural and behavioral checks |
| Asset preparation | Blender + glTF Transform | Inspection, cleanup, optimization |

These choices are recommendations. No exact model version, paid plan, or hosting provider is locked. Native capture needs compatible hardware and a suitable Apple development setup. A photo-upload feature can be broader than the LiDAR capture platform.

## B. Asset and dataset resources

### Amazon Berkeley Objects (ABO)

ABO provides 147,702 product listings and 7,953 products with 3D models. It is useful for product-linked assets, category metadata, images, and dimensions. The registry states that it is not updated; current price and availability must come from another source. It is listed under CC BY 4.0; retain attribution and source metadata.

Select a subset rather than downloading the complete approximately 154 GB model archive. Recheck that a dataset model matches the intended product/variant before presenting it as such.

- https://registry.opendata.aws/amazon-berkeley-objects/
- https://amazon-berkeley-objects.s3.amazonaws.com/index.html

### Materials and lighting

Poly Haven and ambientCG provide CC0 resources useful for consistent surfaces and environment lighting. These improve appearance; they do not establish product identity or price.

- https://polyhaven.com/
- https://polyhaven.com/license
- https://ambientcg.com/

### Generated assets

Meshy supports image-based generation and GLB output. Treat it as an optional supplier whose quality, cost, and latency must be evaluated on the selected furniture. Generated geometry remains approximate.

- https://docs.meshy.ai/en/api/multi-image-to-3d

### Additional sources considered

Research furniture datasets such as 3D-FUTURE are not automatically usable live shopping catalogs. Community retailer download tools, old model APIs, and generic furniture libraries may provide assets, but current operation, applicable terms, SKU correspondence, and quality were not established as dependencies. They are exploration leads, not prerequisites.

## C. What we learned from reference projects

### Rumi

Reference for the visual target and integrated scan/design/shopping flow. The supplied approximately 4:06 demo was inspected through frames across the full timeline and closer visual inspection of key scenes; audio was not reviewed.

Observed strong moments: recognizable scanned-room reveal, editable dollhouse view, eye-level exploration, and a product linked to its retailer page. Some reframing and cursor emphasis belong to the recording rather than the application.

Inspected source implements a product-photo-to-parametric-model pipeline: up to eight downloaded gallery images, up to four selected views, and up to 64 parts assembled from boxes, cylinders, and spheres. It validates output, renders it with shared materials, caches assets, and schedules generation after product retrieval. Those are reference implementation details, not mandatory Roomflow limits or proven runtime benchmarks.

The inspected room-reconstruction documentation describes a separate photo-assisted appearance pipeline beyond plain RoomPlan geometry. That distinction matters for matching visual quality.

- https://github.com/IBS27/rumi
- https://github.com/IBS27/rumi/blob/main/convex/assetGeneration.ts
- https://github.com/IBS27/rumi/blob/main/convex/assets.ts
- https://github.com/IBS27/rumi/blob/main/docs/room-reconstruction-simulation.md
- https://youtu.be/1bHxQx2w0dM

### PIXX-AR

Reference for real-product retrieval, responsive placeholders, product preview versus commitment, and explicit uncertainty. Inspected source uses product-image cutouts in a shallow scene; that approach does not provide the full editable measured-room experience intended here.

- https://github.com/arshiyasharma/hackmit

### Differentiation

Roomflow emphasizes complete-room comparison, direct manipulation, and bringing items from both online and physical discovery into a persistent room. These are experience priorities, not verified claims of global novelty. Image-to-3D item import already appears in other design products; defensibility would need to emerge from execution, useful retained room context, catalog quality, or other demonstrated advantages.

## D. Technical reference links

- RoomPlan overview: https://developer.apple.com/augmented-reality/roomplan/
- RoomPlan enhancements/export discussion: https://developer.apple.com/videos/play/wwdc2023/10192/
- Object Capture: https://developer.apple.com/documentation/realitykit/scanning-objects-using-object-capture
- Object Capture photography/depth guidance: https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture/
- React Three Fiber: https://r3f.docs.pmnd.rs/
- Drei: https://drei.docs.pmnd.rs/
- Motion: https://motion.dev/docs/react
- Convex search: https://docs.convex.dev/search/overview
- Convex scheduling: https://docs.convex.dev/scheduling/scheduled-functions
- Convex storage: https://docs.convex.dev/file-storage/overview
- SerpAPI shopping: https://serpapi.com/google-shopping-api
- Exa content retrieval: https://exa.ai/docs/reference/get-contents
- Example multimodal API: https://platform.claude.com/docs/en/build-with-claude/vision
- Example structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- glTF Transform: https://gltf-transform.dev/cli
- Existing image-to-model feature reference: https://www.homestyler.com/ai-modeler

Resources were researched during September 25–26, 2026. They describe available approaches; provider pricing, limits, and access should be checked when implementing. No provider calls, asset-generation benchmarks, or application builds were performed as part of writing this specification.

## E. Presentation principles

- Establish the physical-to-digital relationship with real room footage and a matching view.
- Show a coordinated transformation, then demonstrate a local change.
- Connect at least one recognizable item to its real listing or physical capture.
- Show that price follows the chosen products.
- Enter the same room at eye level.
- Let an observer make a bounded choice when practical.
- Keep a saved genuine scan and a clearly identified recorded backup available.

No timed presentation script or development schedule is specified here.

## F. Decisions still open

- Exact visual identity and preset definitions.
- First room type and category coverage.
- Final phone-to-browser transfer experience.
- Model provider and API spending limits.
- Quality threshold for parametric assets versus alternate model sources.
- Initial depth of captured-item support and inspiration-image support.
- Identity/session mechanism and persistence implementation.
- Quantitative performance targets after testing representative assets on target hardware.
- Priority of optional enhancements once the complete core journey works.

The central product remains fixed: an attractive, editable representation of the user's room where existing belongings, real purchasable products, and captured discoveries can be tried together before a decision is made.
