# Roomflow web

Browser workspace for Roomflow. See `../spec.md` (product) and `../CLAUDE.md` (engineering rules).

```
npm install
npm run dev        # local dev server
npm run typecheck
npm run lint
npm test
npm run build
```

To connect an iPhone scan directly, open **Open my scan** and scan its code from the Roomflow iPhone app. See [direct scan handoff](../docs/scan-pairing.md) for local network setup and the saved-file fallback.

Design tokens: `src/index.css` (`@theme`) and `src/scene/palette.ts`. Pure domain logic: `src/domain/` (no React, no three).
