---
# gridiot-w3n0
title: Implement swap algorithm plugin
status: scrapped
type: feature
priority: normal
created_at: 2026-02-08T18:23:23Z
updated_at: 2026-02-08T18:49:32Z
---

Third algorithm plugin alongside push and reorder. Swap is the simplest: drag A onto B, they exchange positions. Only 2 items move; everything else stays put.

## Tasks
- [x] Create plugins/algorithm-swap-core.ts (pure algorithm, self-contained types)
- [x] Create plugins/algorithm-swap.ts (DOM integration, drag only, no resize)
- [x] Add AlgorithmSwapPluginOptions to types.ts
- [x] Add import + exports to bundles/index.ts
- [x] Add build entry to build.ts
- [x] Add toggle + 3-way mutual exclusion to examples/architecture.html
- [x] Build and verify

## Summary of Changes

Implemented the swap algorithm plugin — the simplest of the three algorithms. When you drag item A onto item B, they exchange positions. Only 2 items move; everything else stays put. Dragging to an empty cell just moves the item there.

### Files created
- `plugins/algorithm-swap-core.ts` — Pure algorithm with self-contained types (`GridCell`, `ItemRect`, `LayoutToCSSOptions`), `layoutToCSS`, `findItemAtCell`, `clampPosition`, `calculateSwapLayout`
- `plugins/algorithm-swap.ts` — DOM integration (drag-only, no resize handlers), `readItemsFromDOM`, `attachSwapAlgorithm`, plugin registration

### Files modified
- `types.ts` — Added `AlgorithmSwapPluginOptions`, updated `PluginOptions`
- `bundles/index.ts` — Added import + exports
- `build.ts` — Added `dist/algorithm-swap.js` build entry
- `examples/architecture.html` — Added swap toggle, 3-way mutual exclusion between push/reorder/swap

## Reasons for Scrapping

Swap only works cleanly when all items have the same size. With mixed-size items (the common case), a naive position exchange creates overlaps and gaps:

1. **Big → small position**: the larger item overflows into neighboring cells, causing overlaps
2. **Small → big position**: the smaller item leaves gaps at the old location
3. **Clamping** shifts the problem around but doesn't solve it

Adding push-down collision resolution after the swap would fix overlaps, but defeats the whole point — swap's value proposition is simplicity ("only 2 items move"). Once you add cascading collision resolution, it becomes a confusing hybrid of swap and push with no clear mental model.

For uniform-size grids (all 1×1), push already behaves equivalently — dragging onto an item pushes it down one row, which in a 1×1 grid looks like a swap.

**Future consideration**: Swap could be a good algorithm for grids where all items are the same size (e.g., icon grids, card grids, image galleries). If someone needs this, the implementation exists in git history and could be restored with a same-size constraint.
