---
# gridiot-jbmu
title: Simplify resize threshold logic
status: todo
type: task
created_at: 2026-02-08T05:39:21Z
updated_at: 2026-02-08T05:39:21Z
parent: gridiot-b1da
---

Current: asymmetric thresholds (0.3 grow, 0.7 shrink) with direction-dependent behavior (~40 lines at lines 586-626).
Simpler: single threshold, snap to nearest cell boundary. Could be ~10 lines.
