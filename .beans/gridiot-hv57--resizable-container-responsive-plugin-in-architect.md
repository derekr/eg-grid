---
# gridiot-hv57
title: Resizable container + responsive plugin in architecture explorer
status: completed
type: feature
priority: normal
created_at: 2026-02-08T15:37:03Z
updated_at: 2026-02-08T15:47:42Z
---

Add responsiveness demo to the architecture explorer:

- [x] Make grid container horizontally resizable (drag handle or CSS resize) with container-type: inline-size
- [x] Wire up the responsive plugin with a layout model (items A-H, max 4 cols, min 1 col)
- [x] Add Responsive toggle to the plugin panel
- [x] Add a toggleable grid overlay showing calculated column lines for current viewport
- [x] Show column count change events in the event badges
- [x] Show responsive provider state in providers panel

This demonstrates the container query responsive architecture — users resize the container and watch columns reflow, CSS regenerate, and events fire.


## Summary of Changes

Added responsive demo to the architecture explorer:
- Grid container is horizontally resizable (CSS resize: horizontal) with container-type: inline-size
- Responsive plugin wired up with createLayoutModel (8 items, 4→1 columns)
- Container queries control column count based on container width
- Grid overlay toggle shows column lines with numbered labels
- Column count badge updates live as container is resized
- column-count-change event tracked in event badges
- responsive provider shown in providers panel
- Inline grid styles cleared when responsive is enabled so container query CSS can take effect
