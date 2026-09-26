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

Design tokens: `src/index.css` (`@theme`) and `src/scene/palette.ts`. Pure domain logic: `src/domain/` (no React, no three).
