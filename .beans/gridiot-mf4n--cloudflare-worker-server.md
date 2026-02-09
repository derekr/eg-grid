---
# gridiot-mf4n
title: Cloudflare Worker server
status: completed
type: task
priority: normal
created_at: 2026-02-08T16:14:40Z
updated_at: 2026-02-08T17:46:30Z
parent: gridiot-ycu5
---

Set up a Cloudflare Worker that serves as the shared backend for gridiot:

1. **Custom bundle endpoint**: accepts plugin list, generates entry point, runs esbuild-wasm, returns bundled JS. Cache results by plugin combo (256 possible).
2. **Pre-built bundle serving**: serve standard variants (all, minimal, core, standard) at well-known paths
3. **Future**: host Datastar/server-driven examples (SSE endpoints, backend persistence)

Technical notes:
- esbuild-wasm works in Workers (paid plan needed for 25MB bundle limit — WASM binary is ~10MB)
- All gridiot source files embedded as strings in the Worker
- Cache API or KV for caching built bundles
- CORS headers for cross-origin script loading

## Summary of Changes

Implemented the Cloudflare Worker with on-demand bundling:

### Files Created
- `worker/package.json` — Dependencies (esbuild-wasm, wrangler)
- `worker/wrangler.toml` — Worker config with nodejs_compat
- `worker/scripts/sync-sources.ts` — Embeds gridiot sources into sources.ts
- `worker/src/sources.ts` — Auto-generated virtual filesystem (18 files, ~178KB)
- `worker/src/bundler.ts` — esbuild-wasm wrapper with virtual FS plugin + import resolver
- `worker/src/manifest.ts` — Plugin metadata (8 plugins with categories)
- `worker/src/index.ts` — Routing, caching (Cache API), CORS

### Endpoints
- `GET /bundle` — Full bundle (all 8 plugins, ~48KB minified)
- `GET /bundle?plugins=pointer,keyboard` — Custom bundle (~17KB)
- `GET /bundle?plugins=` — Core only (~4.7KB)
- `GET /bundle/gridiot.js` — Alias for full bundle
- `GET /bundle/gridiot-minimal.js` — Alias for pointer-only
- `GET /bundle/gridiot-core.js` — Alias for core-only
- `GET /manifest.json` — Plugin list JSON

### Verified
- All endpoints return valid minified JS
- CORS headers on all responses
- Error handling for invalid plugin names
- Import resolution handles relative paths (../, ./) and extension-less imports
- Cache-Control: immutable for bundles
