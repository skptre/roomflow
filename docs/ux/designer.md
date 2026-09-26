# Designer UX refresh

## Direction

Warm ivory, clay accents, and straightforward sans-serif typography. A plain Roomflow wordmark, no decorative house logo, no slogans over the room, and no trailing periods in headings. The room remains the workspace.

## Changes

- A visual welcome with the actual sample-room scene, an immediate sample entry, and scan import with drag/drop and recovery messages.
- One responsive tool panel: Your room and Find a piece. Explicit replacement browsing no longer changes mode just because another object is selected.
- Furniture inventory with model-derived thumbnails and keyboard-accessible selection.
- Search, category and style filters, lazy thumbnail rendering, loading/error/empty states, and sample-catalog disclosure.
- Deliberate Try / Apply / Cancel instead of automatic hover previews. Closing or filtering the catalog cancels the preview. Scene manipulation is disabled while trying a piece.
- Object movement buttons, rotation, separate keep/lock controls, expandable measurements, removal and undo.
- Reset, overhead, orbit and zoom buttons alongside direct camera manipulation.
- Collapsible budget and purchase list; committed and preview totals stay separate. Replacement browsing accounts for the replaced product's released cost.
- Keyboard focus destinations, visible focus, reduced-motion treatment, modal help, and editing shortcuts restricted to the active Designer.
- Phone layout keeps the room above scrolling tools. Short screens allow whole-page scrolling; expanded budget height is bounded. Sample-price and product-subtotal labels stay visible.

## Verification

- TypeScript, lint, 205 tests and production build passed.
- Browser: enter sample, select from inventory, preview/cancel/apply/undo with subtotal checks, budget entry, lock/undo, help dismissal, Home shortcut isolation, and catalog focus.
- Responsive inspection at 390px width, including a 667px-high screen with an expanded purchase list; no horizontal overflow and sample-price disclosure retained.
- Independent source review; all identified blocking issues addressed.

## Existing product limits

- Designs remain in memory for this browser session. The header and help explain that reloading clears edits; this work does not implement persistence.
- Products and prices are illustrative sample data, not live retailer listings.
- Physical touch devices and assistive-technology applications were not available for end-to-end verification.
- The Three.js application still produces the build's large-bundle advisory.
