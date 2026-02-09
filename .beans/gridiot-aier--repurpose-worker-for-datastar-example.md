---
# gridiot-aier
title: Repurpose worker for Datastar example
status: completed
type: task
priority: normal
created_at: 2026-02-09T13:52:51Z
updated_at: 2026-02-09T21:56:04Z
parent: gridiot-a822
---

The worker currently generates custom bundles with stale exports (registerPlugin, getPlugin, setItemCell). Since plugin toggling is being removed and there's only one bundle now, repurpose the Cloudflare Worker to serve a Datastar integration example instead.

## Todo
- [ ] Remove or gut worker/src/bundler.ts and worker/src/sources.ts
- [ ] Repurpose worker for Datastar example (see bean gridiot-v2p5 for context)
- [ ] Update worker deployment config if needed

## Implementation Progress

- [x] Rename events from egg: to egg- prefix (Datastar compatibility)
- [x] Add egg-layout-change event to algorithm-harness.ts
- [x] Create worker/src/algorithm.ts (pure push functions)
- [x] Create worker/src/sse.ts (Datastar SSE helpers)
- [x] Create worker/src/session.ts (GridSession Durable Object)
- [x] Create worker/src/page.ts (HTML template with 3 tabs)
- [x] Rewrite worker/src/index.ts (routing + session management)
- [x] Update worker/wrangler.toml (DO bindings + migrations)
- [x] Update worker/package.json (remove esbuild-wasm)
- [x] Delete old worker files (bundler.ts, sources.ts, manifest.ts, ui.ts, sync-sources.ts)

## Additional Fixes (continued session)

### Vite dev server path
Fixed: `bundles/element.ts` → `src/bundles/element.ts` (files moved to src/ in a prior refactor).

### CSS specificity override
The `<eg-grid>` web component injects a "Fallback: canonical layout" `<style>` element that appears AFTER the server layout style in the DOM. Same selector specificity (`[data-egg-item="..."]`) means the web component's CSS wins. Fix: server layout CSS uses scoped selector `#grid-server [data-egg-item="ID"]` (ID + attribute > attribute alone).

### Verified CQRS flow end-to-end
1. `data-init="@get('/api/stream')"" → SSE stream connects → DO sends initial layout
2. Drag events fire → Datastar `@post('/api/...')` sends fire-and-forget (204)
3. DO runs push algorithm → persists to SQLite → broadcasts via stored SSE writers
4. Datastar receives `datastar-patch-signals` → updates `$layoutCSS`
5. `data-effect` writes CSS to `<style id="server-layout">`
6. Grid repositions items
7. Reset button works (broadcasts default layout via SSE)
