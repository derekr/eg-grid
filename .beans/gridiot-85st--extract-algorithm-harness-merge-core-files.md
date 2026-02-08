---
# gridiot-85st
title: Extract algorithm harness + merge core files
status: completed
type: task
priority: normal
created_at: 2026-02-08T19:46:48Z
updated_at: 2026-02-08T19:51:28Z
---

Extract shared DOM integration boilerplate from algorithm-push.ts and algorithm-reorder.ts into algorithm-harness.ts. Merge pure algorithm functions from *-core.ts files into main algorithm files. Delete the separate -core.ts files.

## Todo
- [x] Create plugins/algorithm-harness.ts with shared types, layoutToCSS, readItemsFromDOM, and attachAlgorithm
- [x] Rewrite plugins/algorithm-push.ts — pure push functions + strategy wrapper
- [x] Rewrite plugins/algorithm-reorder.ts — pure reorder functions + strategy wrapper
- [x] Delete plugins/algorithm-push-core.ts
- [x] Delete plugins/algorithm-reorder-core.ts
- [x] Rename algorithm-push-core.test.ts to algorithm-push.test.ts, update import
- [x] Verify build succeeds
- [x] Verify tests pass


## Summary of Changes

Extracted shared DOM integration boilerplate (~400 lines duplicated between push and reorder) into `plugins/algorithm-harness.ts`. The harness provides an `AlgorithmStrategy` interface and `attachAlgorithm()` function that handles all event wiring, View Transitions, CSS injection, layout model persistence, and cleanup.

- **algorithm-harness.ts** (new, ~460 lines): Shared types (`ItemRect`, `LayoutToCSSOptions`), `layoutToCSS()`, `readItemsFromDOM()`, `AlgorithmStrategy` interface, `attachAlgorithm()` harness
- **algorithm-push.ts** (rewritten, 237→237 lines): Pure push functions (`itemsOverlap`, `findOverlaps`, `pushDown`, `compactUp`, `calculateLayout`) + thin strategy wrapper calling `attachAlgorithm()`
- **algorithm-reorder.ts** (rewritten, 611→276 lines): Pure reorder functions (`getItemOrder`, `reflowItems`, `calculateReorderLayout`) + thin strategy wrapper with `afterDragMove` for drop-preview
- **algorithm-push-core.ts** (deleted): Merged into push.ts + harness
- **algorithm-reorder-core.ts** (deleted): Merged into reorder.ts
- **algorithm-push.test.ts** (renamed): Updated import from `./algorithm-push-core` to `./algorithm-push`

All existing public API exports preserved. Build succeeds, all 35 tests pass.
