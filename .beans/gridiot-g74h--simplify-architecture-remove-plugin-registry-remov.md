---
# gridiot-g74h
title: 'Simplify architecture: remove plugin registry, remove provider registry, generalize state machine'
status: completed
type: task
priority: normal
created_at: 2026-02-09T04:52:36Z
updated_at: 2026-02-09T05:12:32Z
---

Remove registerPlugin/getPlugin/plugin init loop from engine.ts. Remove ProviderRegistry and core.providers. Simplify state machine (remove TOGGLE_KEYBOARD_MODE, keyboardModeActive, bloated InteractionContext). Add cameraScrolling to core directly. Update all 9 plugins, bundles, types.ts, and architecture.html example.


## Summary of Changes

### Removed
- **Plugin registry**: `registerPlugin()`, `getPlugin()`, plugin init loop from `engine.ts`
- **`registerPlugin({...})` wrappers** from all 9 plugin files (pointer, keyboard, accessibility, camera, resize, placeholder, algorithm-push, algorithm-reorder, responsive)
- **Provider registry**: `ProviderRegistry` interface, `core.providers.register()/get()/has()` from types.ts and engine.ts
- **Provider registrations** from camera.ts, algorithm-harness.ts, responsive.ts
- **Provider consumption** from algorithm-harness.ts (camera state), dev-overlay.ts (drag/layout state)
- **State machine bloat**: `TOGGLE_KEYBOARD_MODE`, `UPDATE_INTERACTION` transitions, `keyboardModeActive` from state, `originalPositions`, `originalSizes`, `targetCell`, `currentSize`, `useFlip`, `useViewTransition` from `InteractionContext`
- **Removed types**: `Plugin`, `PluginOptions`, `ProviderRegistry`, `DragState`, `LayoutState`, `ResizeState`
- **Removed from InitOptions**: `plugins`, `disablePlugins`

### Added
- **Direct init wiring** in `engine.ts`: `init()` calls `attach*` functions directly based on options
- **`cameraScrolling: boolean`** on `GridiotCore` — set by camera.ts, read by algorithm-harness.ts
- **`isResizing()` helper** in state-machine.ts
- **New InitOptions fields**: `algorithm`, `algorithmOptions`, `resize`, `camera`, `placeholder`, `responsive`, `accessibility`, `pointer`, `keyboard`

### Updated
- **keyboard.ts**: Tracks `keyboardModeActive` and `keyboardTargetCell` locally instead of in state machine
- **pointer.ts**: Uses state machine transitions (`START_INTERACTION`, `COMMIT_INTERACTION`, etc.)
- **dev-overlay.ts**: Reads `core.stateMachine.getState()` instead of `core.providers.get()`
- **bundles** (index.ts, core.ts, minimal.ts): Removed side-effect imports, removed `registerPlugin`/`getPlugin` exports
- **architecture.html**: Uses direct `attach*()` calls, reads state machine, new init options

### Impact
- Full bundle: 39.8 KB → 37.7 KB minified (-5%)
- ~170 lines net reduction
- Single way to initialize plugins (direct calls, no registry indirection)
