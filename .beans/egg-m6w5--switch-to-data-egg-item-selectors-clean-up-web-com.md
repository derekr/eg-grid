---
# egg-m6w5
title: Switch to [data-egg-item] selectors + clean up web component
status: completed
type: task
priority: normal
created_at: 2026-02-09T18:45:00Z
updated_at: 2026-02-09T18:51:15Z
---

Change default CSS selectors from #id to [data-egg-item="id"], unify item ID resolution to prefer data-egg-item, simplify web component (remove id/data-id auto-generation, derive colspan/rowspan from CSS), update examples to use new selectors.

## Summary of Changes

- Changed default `selectorPrefix`/`selectorSuffix` from `#`/`''` to `[data-egg-item="`/`"]` in layout-model.ts, algorithm-harness.ts, and types.ts
- Unified item ID resolution to prefer `data-egg-item` over `data-id` in algorithm-harness.ts, resize.ts, dev-overlay.ts, utils/flip.ts
- Simplified web component: removed `id`/`data-id` auto-generation, added colspan/rowspan derivation from CSS grid properties
- Updated web-component.html to showcase server-rendered CSS with `[data-egg-item="..."]` selectors (no inline styles, no data-egg-colspan needed)
- Updated index.html items to use `data-egg-item="id"` instead of bare `data-egg-item` + `data-id` + `id`
- Updated advanced.html: same item attribute cleanup + all CSS selectors switched from `#id` to `[data-egg-item="id"]`
- Applied same changes to worker/src/sources.ts (embedded copies)
