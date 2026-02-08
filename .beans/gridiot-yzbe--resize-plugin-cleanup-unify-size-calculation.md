---
# gridiot-yzbe
title: 'Resize plugin cleanup: unify size calculation'
status: completed
type: task
priority: normal
created_at: 2026-02-08T05:39:16Z
updated_at: 2026-02-08T14:15:07Z
parent: gridiot-b1da
---

Currently two parallel size calculation systems in resize.ts:
1. `calculateNewSize()` (lines 146-246): cell-based from pointer position
2. Inline ratio calculation (lines 576-626): pixel-based with threshold snapping

These can produce different results. Pick one approach and remove the other.

## Summary of Changes\n\nDeleted the dead `calculateNewSize()` function (~100 lines) from `plugins/resize.ts`. This function was superseded by the inline ratio-based calculation and was never called. Also cleaned up the stale comment that referenced it.
