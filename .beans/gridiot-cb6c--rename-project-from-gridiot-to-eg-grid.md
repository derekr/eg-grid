---
# gridiot-cb6c
title: Rename project from gridiot to eg-grid
status: completed
type: task
priority: normal
created_at: 2026-02-09T16:34:10Z
updated_at: 2026-02-09T17:27:55Z
---

Rename all references from gridiot to eg-grid (End Game Grid).

## Scope

- [x] Step 1: Source code (.ts files) — data-gridiot→data-egg, gridiot:→egg:, dataset camelCase, CSS classes
- [x] Step 2: Build config — build.ts, package.json, worker config
- [x] Step 3: Examples HTML — index.html, advanced.html
- [x] Step 4: Documentation — README, CLAUDE.md, docs/
- [x] Step 5: Worker files — sources.ts, ui.ts, sync-sources.ts
- [x] Step 6: Beans config — .beans.yml prefix
- [x] Step 7: Build and verify
- [x] Step 8: Update memory

## Notes

- Keep git history (rename, don't delete+recreate)
- This is a prerequisite for the web component wrapper

## Summary of Changes

Mechanical rename of all public-facing APIs from `gridiot` to `eg-grid`/`egg`:

- **Data attributes**: `data-gridiot-*` → `data-egg-*` (item, dragging, selected, colspan, rowspan, etc.)
- **Events**: `gridiot:*` → `egg:*` (drag-start, drag-move, drag-end, resize-*, select, etc.)
- **CSS classes**: `.gridiot-*` → `.egg-*` (placeholder, resize-label, dev-overlay)
- **TypeScript types**: `GridiotCore` → `EggCore`, `GridiotState` → `EggState`, etc.
- **Bundle output**: `dist/gridiot.js` → `dist/eg-grid.js`
- **Package name**: `gridiot` → `eg-grid`
- **Style element ID**: `gridiot-styles` → `egg-styles`
- **Worker**: `gridiot-cdn` → `eg-grid-cdn`, headers `X-Gridiot-*` → `X-Egg-*`
- **Documentation**: All markdown files updated
- **Memory**: MEMORY.md updated with new naming

Build verified: `eg-grid.js` (75.2 KB raw, 36.9 KB min, 11.5 KB gzip). Zero stray `gridiot` references in source.
