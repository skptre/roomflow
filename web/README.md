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

## Optional Gemini furniture appearance

On branch `codex/gemini-appearance`, select a captured/owned item, choose **Match appearance from photo**, pick a JPG/PNG/WebP, crop locally, and explicitly consent to send the displayed image. Analyze → preview → apply; cancel and undo preserve the original appearance. Measurements, placement, keep/lock flags and purchase identity never change. Low-confidence results remain labeled, and unsupported objects cannot be applied. These are approximate template matches, not exact replicas or texture reconstruction.

### Local setup

1. Copy `.env.example` to `.env.local` inside `web/`.
2. Set `GEMINI_API_KEY` in that local file. Never use a `VITE_` prefix, commit it, or paste it into the app.
3. Use a Google Cloud project with active billing. Set `GEMINI_PAID_PROJECT=true` only after verifying that setup. The flag is an operator attestation, not an API check of your billing status. Leave optional provider data-sharing/log contribution disabled.
4. Run/restart `npm run dev -- --host 127.0.0.1` and open the printed local URL.

Default: `gemini-3.1-flash-lite`, a low-cost image-understanding model. On 2026-09-26 Google lists $0.25/M input tokens and $1.50/M output tokens; 3.5 Flash-Lite is also supported via `GEMINI_MODEL=gemini-3.5-flash-lite` ($0.30/M input, $2.50/M output). Rates are estimates, not your billing statement. There is no automatic model escalation. Google currently lists 3.1 Flash-Lite shutdown for May 7, 2027; revisit the default before that date. 2.5 models are access-restricted for new projects.

Each call sends one JPEG (client longest edge ≤1024 pixels) and a fixed appearance prompt. It has a 30-second provider timeout, at most 1024 output tokens, no retries, one in-flight request, six requests/minute and 100 requests/server lifetime. Restart resets these local limits. The response reports provider token usage and an estimated USD cost, separate from the furniture purchase subtotal. Failed/timed-out calls may still be billed by Google. No images, prompts or results are written to disk or logged by this integration; they exist transiently in request memory. The browser drops photo state when the dialog closes. Google retention is separate from app storage.

### Current boundaries

- API middleware runs only with local Vite dev/preview, with loopback peer/Host and same-origin POST checks. Static hosting alone will not provide recognition. Before public deployment, port `server/recognition.ts` behind authenticated server routes, per-user quotas and deployment-level spending controls. Do not expose the local development adapter publicly.
- Recognition uses an individually chosen photo. `.roomflow.zip` import, automatic photo associations, segmentation, texture reconstruction, retailer search, and iOS Gemini calls are not implemented here.
- JPEG metadata is removed by browser canvas re-encoding. Visible personal content is not automatically redacted; inspect/crop it before sending. HEIC input needs conversion to JPEG first.
- Live recognition quality must be evaluated with a configured key. Tests mock Google and never send private photos.

Sources: [pricing](https://ai.google.dev/gemini-api/docs/pricing), [model lifecycle](https://ai.google.dev/gemini-api/docs/deprecations), [data terms](https://ai.google.dev/gemini-api/terms), [structured output](https://ai.google.dev/gemini-api/docs/structured-output).
