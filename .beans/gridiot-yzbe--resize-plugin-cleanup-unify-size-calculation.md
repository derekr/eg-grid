---
# gridiot-yzbe
title: 'Resize plugin cleanup: unify size calculation'
status: todo
type: task
created_at: 2026-02-08T05:39:16Z
updated_at: 2026-02-08T05:39:16Z
parent: gridiot-b1da
---

Currently two parallel size calculation systems in resize.ts:
1. `calculateNewSize()` (lines 146-246): cell-based from pointer position
2. Inline ratio calculation (lines 576-626): pixel-based with threshold snapping

These can produce different results. Pick one approach and remove the other.
