---
# gridiot-p6o2
title: Normalize pointer/keyboard events
status: completed
type: task
priority: low
created_at: 2026-02-08T05:39:55Z
updated_at: 2026-02-08T06:06:55Z
---

Keyboard navigation emits drag events (`drag-start`, `drag-end`) to reuse algorithm integration. This causes conceptual confusion — camera plugin uses `sawPointerMove` flag to distinguish.

## Approach: Add `source` metadata to existing events (option 3)

Add `source: 'pointer' | 'keyboard'` to all drag event detail types. No new event types, no breaking changes.

## Tasks
- [x] Add `source` to DragStartDetail, DragMoveDetail, DragEndDetail, DragCancelDetail in types.ts
- [x] Emit `source: 'pointer'` from pointer.ts
- [x] Emit `source: 'keyboard'` from keyboard.ts
- [x] Replace `sawPointerMove` heuristic in camera.ts with `e.detail.source`
- [x] Replace `style.position === 'fixed'` heuristic in algorithm-push.ts with stored source
- [x] Update TODO.md
- [x] Build and verify


## Summary of Changes

Added `source: 'pointer' | 'keyboard'` field to all drag event detail types (`DragStartDetail`, `DragMoveDetail`, `DragEndDetail`, `DragCancelDetail`). Updated pointer.ts and keyboard.ts to emit the field. Replaced `sawPointerMove` heuristic in camera.ts and `style.position === 'fixed'` heuristic in algorithm-push.ts with direct `source` checks. Additive change — no breaking API changes.
