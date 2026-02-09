---
# gridiot-4tfi
title: Custom bundle builder UI
status: completed
type: feature
priority: normal
created_at: 2026-02-08T15:40:57Z
updated_at: 2026-02-08T18:49:58Z
parent: gridiot-ycu5
blocked_by:
    - gridiot-2aii
    - gridiot-mf4n
---

A web-based tool where users can select which plugins to include via checkboxes and produce a custom bundle on the fly.

Ideas:
- Use Vite to build the bundle in-browser (could leverage Vite's browser build or a WASM-based bundler)
- Show checkboxes for each plugin with descriptions and size estimates
- Generate downloadable JS file or a CDN-ready URL
- Show resulting bundle size

This is the main user-facing bundling experience.

## Research Findings

### Chosen Approach: Cloudflare Worker + esbuild-wasm
Server-side bundling via a Cloudflare Worker running esbuild-wasm. Same API as our `build.ts`. Produces real optimized/minified bundles. Results cached by plugin combination (only 256 possible combos for 8 plugins).

Benefits:
- Zero bundler code shipped to browser
- Real tree-shaking and minification
- Same esbuild config as local builds
- Cacheable — 256 combos can be lazily cached or pre-warmed
- The same Cloudflare server can host future Datastar/server-driven examples

No npm publishing. CDN via jsDelivr GitHub provider or direct from the Worker.

### Plugin dependency graph (for chunk splitting)
- **pointer** → engine, state-machine, utils/flip
- **keyboard** → engine, state-machine
- **camera** → engine
- **resize** → engine, state-machine
- **placeholder** → engine
- **algorithm-push** → engine, algorithm-push-core, layout-model
- **responsive** → engine
- **accessibility** → engine

### Real-world precedent
jQuery UI, Modernizr, Font Awesome, Datastar all use server-side or pre-built approaches for custom bundle UIs. Concatenation/pre-generation is the standard pattern.

### Implementation sketch
1. Cloudflare Worker: accepts plugin list via query params or POST, generates entry point `.ts`, runs esbuild-wasm, returns bundled JS
2. Caching: KV or Cache API keyed by sorted plugin combination string
3. Web UI: checkboxes for each plugin with descriptions + size estimates, calls the Worker, shows bundle size, offers download
4. Same Worker can serve pre-built variants (all, minimal, core, standard) at well-known paths

## Summary of Changes

Rewrote the bundle builder UI to use Datastar with SSE fat morph approach.

### Architecture
- `GET /` serves static HTML with Datastar signals and `data-init`
- `POST /build` receives plugin signals as JSON, builds bundle, returns SSE `datastar-patch-elements` event
- Datastar morphs `#output` div with updated script tag, URL, and size info
- No client-side JS for fetching/rendering — it's all server-driven

### Datastar integration
- `data-signals="{plugins: [...]}"` — array of selected plugin names
- `data-bind:plugins` on checkboxes — array two-way binding
- `data-on:change__debounce.150ms="@post('/build')"` — auto-rebuild on toggle
- `data-init="@post('/build')"` — build on page load
- `data-indicator:_loading` + `data-show` — spinner during build
- All/None buttons set $plugins signal then `@post('/build')`

### SSE format
```
event: datastar-patch-elements
data: elements <div id="output">
data: elements   ...
data: elements </div>
```
