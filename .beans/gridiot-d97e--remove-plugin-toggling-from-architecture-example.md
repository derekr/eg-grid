---
# gridiot-d97e
title: Remove plugin toggling from architecture example
status: completed
type: task
priority: normal
created_at: 2026-02-09T13:52:51Z
updated_at: 2026-02-09T14:05:19Z
parent: gridiot-a822
---

The architecture example has elaborate plugin enable/disable UI that fights the new architecture where plugins are wired at init() time. The preservePositionsAsInlineStyles() pattern was already a source of bugs (StyleManager.clear on non-existent layer).

## Todo
- [ ] Remove checkbox toggles and enablePlugin/disablePlugin functions
- [ ] Initialize all plugins via init() at startup
- [ ] Keep the X-ray panel (state machine display, event badges, CSS output, ARIA announcements)
- [ ] Remove toggle-all button
- [ ] Simplify the example to focus on observing behavior rather than toggling features

## Summary of Changes\n\n- Removed plugin toggle checkboxes, enablePlugin/disablePlugin functions, toggle-all button\n- Removed preservePositionsAsInlineStyles, clearInlineGridStyles helper functions\n- Removed resize-flash animation CSS and logic\n- Removed announcements-prompt (click to enable accessibility) — always shown\n- Simplified init: all plugins enabled at startup via `init()` with options\n- Kept all X-ray panel sections: state machine, events, ARIA announcements, core state, CSS output\n- Kept grid overlay toggle and column badge\n- ~320 lines removed (1170 → 848)
