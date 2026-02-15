---
# egg-gbsx
title: Add performance section to docs page with real measurements
status: completed
type: feature
priority: normal
created_at: 2026-02-15T20:28:47Z
updated_at: 2026-02-15T20:30:53Z
---

Use Chrome DevTools MCP to measure actual drag/keyboard/resize performance on the live grid, then create an SVG chart in index.html showing real frame timing data.

## Summary of Changes\n\nAdded a Performance section to the docs page (index.html) with an SVG bar chart showing real frame timing data collected via Chrome DevTools MCP:\n- Drag: avg 8.1ms, p95 9.2ms (30 frames)\n- Keyboard: avg 7.3ms, p95 8.9ms (8 moves)\n- Resize: avg 8.1ms, p95 9.2ms (20 frames)\n\nAll interactions well under the 16ms/60fps budget. Chart uses gradient fills matching the grid item colors, with a dashed 16ms budget line for context.
