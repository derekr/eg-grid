---
# gridiot-tu7b
title: Ruthless bundle size optimization (round 2)
status: completed
type: task
created_at: 2026-02-08T20:53:47Z
updated_at: 2026-02-08T20:53:47Z
---

Aggressive dead code removal and deduplication across the entire codebase. P0: removed MutationObserver, unused state machine exports, standalone getGridInfo/setItemCell, withViewTransitionExclusion, ensureContainerWrapper, PLACEHOLDER_CSS/attachPlaceholderStyles, buildLayoutItems/layoutItemsToPositions, providers.has(). P1: getCursor switch→lookup, finishResize/cancelResize dedup, removed setSize, removed all DEBUG/log from pointer/keyboard/algorithm-harness, merged capturePositions+captureSizes, listenEvents in camera/placeholder, extracted getItemsWithOriginals/getResizeItems helpers. Result: 46.8→39.8 KB minified (15%), 14.3→13.0 KB gzip (9%), 12.7→11.6 KB brotli (9%).
