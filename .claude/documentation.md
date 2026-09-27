# Documentation rules

Every code change is recorded in the same commit as the code. Records live in `docs/`.

- **Every code change** → append an entry at the top of `docs/CHANGELOG.md` (`### YYYY-MM-DD — area: summary`):
  what changed and why, naming the files and every new or changed public type/function. Never edit older entries.
- **New, removed, renamed, or repurposed file; new public type or function** → update `docs/ARCHITECTURE.md`
  (file row: purpose + key types/functions).
- **New module, document, or major concern** → add one row to `docs/INDEX.md` pointing at it.
- **Non-obvious tradeoff** (a real choice between alternatives) → add an entry to `docs/DECISIONS.md` with the
  rejected alternative and why. Skip routine changes.
- **New functions/types in code** → give each a short doc comment (`///`) stating what it does and any
  non-obvious contract (units, frame, ownership, failure behavior). Match the surrounding comment density.
- **Contracts shared with teammates** (`docs/contracts/`, `docs/ios-room-package.md`) → change only with the
  owner's agreement; note the change in the CHANGELOG.

Web code is owned by Yash: index it at file/folder level unless he adds detail. If a change touches nothing above,
don't edit `docs/` just to touch it.
