---
# gridiot-rsst
title: Add resize announcements to accessibility plugin
status: completed
type: feature
priority: normal
created_at: 2026-02-08T17:10:40Z
updated_at: 2026-02-08T17:30:46Z
---

The accessibility plugin currently only announces drag events. Add announcements for resize-start, resize-move, resize-end, and resize-cancel events.

## Todo
- [x] Import resize event detail types
- [x] Add resize event listeners with announcements
- [x] Deduplicate resize-move announcements (only announce when size changes)
- [x] Support custom announcement templates via data-gridiot-announce-resize-* attributes
- [x] Clean up listeners on destroy
- [x] Update MEMORY.md

## Summary of Changes

Added resize event announcements to the accessibility plugin (`plugins/accessibility.ts`). The plugin now listens for `resize-start`, `resize-move`, `resize-end`, and `resize-cancel` events and announces them via the ARIA live region. Resize-move announcements are deduplicated (only fires when colspan/rowspan actually change). Custom announcement templates are supported via `data-gridiot-announce-resize-*` attributes with `{label}`, `{colspan}`, `{rowspan}`, `{row}`, `{column}` placeholders.
