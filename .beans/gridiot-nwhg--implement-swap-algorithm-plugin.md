---
# gridiot-nwhg
title: Implement swap algorithm plugin
status: scrapped
type: task
priority: normal
created_at: 2026-02-08T05:39:38Z
updated_at: 2026-02-08T18:52:41Z
parent: gridiot-fl6v
---

Create `algorithm-swap.ts` - swap items on collision. Custom example exists in README but no reusable plugin.

## Reasons for Scrapping

Swap only works with uniform-size items. With mixed sizes, naive position exchange creates overlaps and gaps. Adding collision resolution defeats the simplicity that makes swap appealing. See gridiot-w3n0 for the full implementation attempt and analysis.

Push already behaves like swap for uniform 1×1 grids. Could be restored from git history if someone needs it for a same-size grid.
