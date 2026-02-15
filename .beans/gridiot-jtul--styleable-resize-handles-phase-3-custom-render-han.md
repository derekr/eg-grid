---
# gridiot-jtul
title: 'Styleable resize handles Phase 3: custom render & handle selectors'
status: scrapped
type: feature
priority: normal
created_at: 2026-02-08T05:39:28Z
updated_at: 2026-02-15T20:16:06Z
parent: gridiot-b1da
blocked_by:
    - gridiot-ch7m
---

Full flexibility for resize handle customization:

- Add `renderHandle` callback option for fully custom handle DOM
- Add `handleSelector` option for using existing DOM elements as handles
- Support both approaches simultaneously
- Document customization patterns in README

## Reasons for Scrapping

Obsolete after condensed-first restructuring. The old multi-file plugin architecture was replaced with a single-file library. See bean egg-ivjb.
