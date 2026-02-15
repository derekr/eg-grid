---
# egg-b0hf
title: Condensed single-file eg-grid
status: completed
type: task
priority: normal
created_at: 2026-02-15T16:40:24Z
updated_at: 2026-02-15T16:45:06Z
---

Create src/eg-grid-condensed.ts — a vendor-friendly single-file version of the library (~1,150 lines vs current 5,853). Layout model stays separate. All features preserved.

## Summary of Changes

Created `src/eg-grid-condensed.ts` — a single-file, vendor-friendly version of the library.

**Source**: 1,152 lines in 1 file (down from ~4,600 lines across 17 files — 75% reduction)
**Bundle**: 29 KB minified / 8.7 KB gzipped (down from 37 KB / 11.5 KB — 22-24% smaller)

Key condensations:
- State machine inlined as a `phase` variable (165 lines → ~10 lines)
- Algorithm harness unified drag/resize into single interaction flow (682 lines → ~200 lines)
- StyleManager collapsed to two CSS strings (baseCSS + previewCSS)
- Types inlined at point of use (449 lines → ~30 lines)
- FLIP animation inlined at its single call site
- Camera simplified (no public API, just edge-scroll + scroll-into-view)
- No plugin attach/destroy pattern — everything wires up in `init()`

All features preserved: pointer drag, keyboard nav, resize (8 handles), camera auto-scroll, placeholder, accessibility (ARIA), responsive, View Transitions, push + reorder algorithms.

Also added condensed bundle to `build.ts`.
