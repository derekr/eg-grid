---
# egg-i8mq
title: Fix architecture example broken APIs
status: completed
type: task
priority: normal
created_at: 2026-02-09T17:40:12Z
updated_at: 2026-02-09T17:40:22Z
parent: gridiot-a822
---

Fix examples/index.html after prior refactor left broken API calls (getPlugin, disablePlugins, core.providers, core.stateMachine.subscribe). Replace with working init() call, event-driven state updates, core state display, and dev overlay with algorithm toggle.

## Todo
- [x] Remove broken init() with disablePlugins, replace with proper init() call (algorithm: false for manual management)
- [x] Remove plugin toggle checkboxes from X-ray panel
- [x] Remove all enablePlugin/disablePlugin/getPlugin code
- [x] Replace core.stateMachine.subscribe() with event listeners polling getState()
- [x] Replace Providers section with Core State section (reads from core directly)
- [x] Add dev overlay (Shift+D) with algorithm push/reorder select
- [x] Clear inline grid styles after init so CSS injection works
- [x] Set data-pointer-active on grid for grab cursor
- [x] Show announcements log by default (no click-to-enable prompt)
- [x] Fix dev-overlay.ts renderConfigTab to render select options
- [x] Update hint text and header description

## Summary of Changes

### examples/index.html
- Replaced broken `init()` call (used removed `disablePlugins` option) with proper `init()` using `algorithm: false` + manual algorithm attachment for switching
- Removed plugin toggle checkboxes section from X-ray panel entirely
- Removed all `enablePlugin()`, `disablePlugin()`, `getPlugin()`, `pluginCleanups`, `clearInlineGridStyles()`, `preservePositionsAsInlineStyles()`, `flashResizeHandles()` code
- Replaced `core.stateMachine.subscribe()` (doesn't exist) with event listeners on egg:* events that poll `core.stateMachine.getState()`
- Replaced Providers section (`core.providers.has()/get()` — removed API) with Core State section reading directly from core
- Added dev overlay (`Shift+D`) with algorithm push/reorder select dropdown
- Clear inline grid styles after init so CSS injection can take effect
- Set `data-pointer-active` on grid for grab cursor
- Show announcements log immediately (removed click-to-enable prompt)
- Updated hint text and header description

### plugins/dev-overlay.ts
- Fixed `renderConfigTab()` to render `select`-type config options (previously only rendered toggles and actions, even though change handlers were already wired)
