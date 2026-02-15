---
# gridiot-ch7m
title: 'Styleable resize handles Phase 2: injected handle elements'
status: scrapped
type: feature
priority: normal
created_at: 2026-02-08T05:39:25Z
updated_at: 2026-02-15T20:16:03Z
parent: gridiot-b1da
---

Add opt-in visible handle elements injected into grid items.

- Add `showHandles: boolean` option (default: false)
- Create handle elements for each enabled handle type
- Position handles absolutely within items
- Add `handleClass` option for custom class name
- Clean up handles on destroy
- Handle dynamic items (MutationObserver or manual refresh)

Phase 1 (data attributes for CSS-only styling) is already complete.

## Reasons for Scrapping

Obsolete after condensed-first restructuring. The old multi-file plugin architecture was replaced with a single-file library. See bean egg-ivjb.
