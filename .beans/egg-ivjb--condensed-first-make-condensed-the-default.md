---
# egg-ivjb
title: 'Condensed-first: make condensed the default'
status: completed
type: milestone
priority: normal
created_at: 2026-02-15T19:37:06Z
updated_at: 2026-02-15T20:16:53Z
---

Major direction shift: condensed single-file becomes the canonical eg-grid. The library philosophy is vendor-it-in, not install-from-npm. Use your LLM to customize. No versions, no publishing.

## Competitive Context

```
                     eg-grid          Packery 2        gridster.js       react-grid-layout
                     (condensed)
                     ────────────     ────────────     ────────────      ─────────────────
Min size             29 KB            ~38 KB           ~32 KB            ~43 KB
Gzip (est.)          8.8 KB           ~12 KB           ~10 KB            ~13 KB
Dependencies         0                0 (bundled)      jQuery (~30 KB)   React (~42 KB)
Total w/ deps        29 KB            ~48 KB           ~62 KB            ~85 KB+
Framework            none             none             jQuery            React only

Layout engine        CSS Grid         abs positioning  abs positioning   CSS Transforms
Drag                 ✓                ✓ (addon)        ✓                 ✓
Resize               ✓ (8-way)        ✗                ✓                 ✓ (SE only)
Keyboard             ✓                ✗                ✗                 ✗
Accessibility        ✓ (ARIA)         ✗                ✗                 ✗
View Transitions     ✓                ✗                ✗                 ✗
Vendorable           ✓ (1 file)       npm/CDN          npm/CDN           npm only
```

## Core Values (preserve these)

- CSS Grid does layout math — JS only sets grid-column/grid-row, browser computes pixels
- Style injection via `<style>` elements, never inline styles (View Transitions require it)
- State machine for core logic (phase: idle → selected → interacting)
- Data attributes for state (`data-egg-*`), CSS selectors for styling
- Custom events for plugin coordination
- Zero dependencies
- Platform-first: maximize browser features, minimize JavaScript

## Critical & Opinionated: Vendor-First Philosophy

This is NOT a library you install from npm. It IS a working solution you copy into your codebase and own.
- No versions. No publishing. No semver.
- Copy the file. Read it. Tweak it. Use your LLM to customize.
- One file = one grep away from understanding everything.
- The condensed file IS the documentation — readable code, not API docs.

## Work Items

- [x] Verify condensed works with existing examples (skip workers)
- [x] Remove non-essential source files (old plugin architecture)
- [x] New bundle structure: base (eg-grid.js), element (eg-grid-element.js), dev-overlay
- [x] Update build.ts for new bundle targets
- [x] Rewrite README with comparison table, vendor-first philosophy, core values
- [x] Update CLAUDE.md / AGENTS.md for new structure
- [x] Clean up examples (removed practical.html, condensed.html, updated nav links)
- [x] Scrap/archive old beans that no longer apply (15 beans scrapped)


## Summary of Changes

### Files renamed
- `src/eg-grid-condensed.ts` → `src/eg-grid.ts` (THE canonical library)

### Files deleted (24 files)
- Old multi-file architecture: `engine.ts`, `state-machine.ts`, `types.ts`, all 10 plugin files, `bundles/index.ts`
- Tests: `state-machine.test.ts`, `algorithm-push.test.ts`, `resize.spec.ts`
- Examples: `practical.html`, `condensed.html`
- Old dist: `eg-grid-condensed.*`

### Files updated
- `layout-model.ts` — made self-contained (inlined types from deleted `types.ts`)
- `eg-grid-element.ts` — imports from `./eg-grid`, uses `core.phase` not `core.stateMachine`
- `dev-overlay.ts` — imports from `../eg-grid`, uses direct `core.phase`/`core.interaction`
- `bundles/element.ts` — exports from `../eg-grid` and `../layout-model`
- `build.ts` — 3 entries: eg-grid, eg-grid-element, dev-overlay
- `vite.config.ts` — removed `practical.html` input
- `index.html` — removed Practical link
- All examples — updated nav, updated imports

### New files
- `README.md` — rewritten with comparison table, vendor-first philosophy, full API docs

### Build sizes
- eg-grid.js: 50.9 KB raw / 29.2 KB min / 8.8 KB gzip
- eg-grid-element.js: 63.4 KB raw / 36.1 KB min / 10.9 KB gzip
- dev-overlay.js: 14.6 KB raw / 11.6 KB min / 3.1 KB gzip
