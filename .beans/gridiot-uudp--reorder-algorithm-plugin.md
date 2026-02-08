---
# gridiot-uudp
title: Reorder algorithm plugin
status: completed
type: feature
priority: normal
created_at: 2026-02-08T17:31:00Z
updated_at: 2026-02-08T17:45:34Z
---

Implement a reorder algorithm plugin that uses sequence-based reflow instead of push-down collision resolution. Items have a logical sequence (reading order), dragging changes position in sequence, all items reflow like CSS Grid auto-placement.

## Todo
- [x] Create plugins/algorithm-reorder-core.ts (pure algorithm)
- [x] Create plugins/algorithm-reorder.ts (DOM integration)
- [x] Add AlgorithmReorderPluginOptions to types.ts
- [x] Add import + exports to bundles/index.ts
- [x] Add build entry to build.ts
- [x] Update architecture explorer with Push/Reorder toggle
- [x] Build successfully

## Summary of Changes

Implemented the reorder algorithm plugin with sequence-based reflow:

- **plugins/algorithm-reorder-core.ts**: Pure algorithm with `getItemOrder`, `reflowItems`, and `calculateReorderLayout` functions. Reflow uses CSS Grid auto-placement logic (scan left-to-right, top-to-bottom for first fit).
- **plugins/algorithm-reorder.ts**: DOM integration mirroring algorithm-push structure — handles drag/resize events, View Transitions, CSS injection via `core.styles`, layoutModel integration.
- **types.ts**: Added `AlgorithmReorderPluginOptions` and updated `PluginOptions` map.
- **bundles/index.ts**: Added import for auto-registration + exports.
- **build.ts**: Added `dist/algorithm-reorder.js` build entry.
- **examples/architecture.html**: Split Algorithm toggle into Push/Reorder with mutual exclusion.
