---
# gridiot-fl6v
title: Additional layout algorithms
status: completed
type: epic
priority: normal
created_at: 2026-02-08T05:39:10Z
updated_at: 2026-02-08T18:52:56Z
---

Epic for implementing additional layout algorithms beyond push-down. The prototype supports 5 algorithms, but only push-down is implemented. Need: swap, insert, reorder, snap-to-gap.

## Summary of Changes

Evaluated all proposed algorithms beyond the existing push and reorder:

- **Reorder** — Already implemented (gridiot-fz5z). Sequence-based reflow.
- **Swap** — Implemented and scrapped (gridiot-w3n0). Only viable for uniform-size grids; mixed sizes create impossible overlaps.
- **Insert** — Scrapped (gridiot-msva). Redundant with push (shift down) and reorder (shift in sequence).
- **Snap-to-gap** — Scrapped (gridiot-v7l8). Too situational; dense grids have no gaps, sparse grids are uncommon.

**Conclusion**: Push and reorder are the two fundamental strategies — "make room" and "change order". They cover the practical use cases. The algorithm plugin system supports adding more, but the current set is complete.
