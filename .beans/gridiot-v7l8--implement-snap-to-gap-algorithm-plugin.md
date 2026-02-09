---
# gridiot-v7l8
title: Implement snap-to-gap algorithm plugin
status: scrapped
type: task
priority: normal
created_at: 2026-02-08T05:39:41Z
updated_at: 2026-02-08T18:52:50Z
parent: gridiot-fl6v
---

Create `algorithm-snap.ts` - snap item to nearest empty/gap space in the grid.

## Reasons for Scrapping

Snap-to-gap (find nearest empty cell, nothing else moves) is too situational. Dense grids have no gaps to snap to. Sparse grids with gaps are uncommon. Finding gaps that fit multi-cell items is non-trivial. No fallback when no gaps exist. Push and reorder cover the practical use cases.
