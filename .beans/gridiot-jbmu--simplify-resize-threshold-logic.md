---
# gridiot-jbmu
title: Simplify resize threshold logic
status: completed
type: task
priority: normal
created_at: 2026-02-08T05:39:21Z
updated_at: 2026-02-08T14:15:07Z
parent: gridiot-b1da
---

Current: asymmetric thresholds (0.3 grow, 0.7 shrink) with direction-dependent behavior (~40 lines at lines 586-626).
Simpler: single threshold, snap to nearest cell boundary. Could be ~10 lines.

## Summary of Changes\n\nReplaced ~25 lines of asymmetric threshold logic (grow/shrink direction detection, two threshold constants, four conditional branches) with 3 lines using `Math.floor(ratio + 0.7)`. The 30% snap threshold is preserved identically in both directions.
