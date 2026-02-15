---
# egg-rqxf
title: 'Keyboard drag: animate pushed items via View Transitions'
status: completed
type: feature
priority: normal
created_at: 2026-02-15T21:24:17Z
updated_at: 2026-02-15T21:27:39Z
---

When using keyboard to drag an item, pushed items should animate via View Transitions instead of jumping, so the dragged item doesn't visually overlap displaced items.

## Summary of Changes\n\nFor keyboard drag (nudge and grab+move), the dragged item now participates in View Transitions alongside pushed items instead of being excluded from the CSS layout.\n\nChanges in `src/eg-grid.ts` algorithm harness:\n- `onStart`: clear inline grid styles on the dragged item too when source is keyboard\n- `onMove`: pass `null` as `excludeId` for keyboard source (include dragged item in CSS)\n- `onCameraSettled`: same keyboard excludeId fix\n- `applyLayout`: skip setting `viewTransitionName = 'dragging'` for keyboard source (item stays in grid flow, shouldn't have a unique transition name)
