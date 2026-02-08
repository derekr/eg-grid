---
# gridiot-zvmv
title: Centralize CSS injection + fix resize transitions
status: completed
type: feature
priority: normal
created_at: 2026-02-08T16:59:04Z
updated_at: 2026-02-08T17:06:07Z
---

Three changes:
1. Enable View Transitions during resize-move so other items animate
2. Add source field to resize events, replace DOM heuristic in algorithm
3. Create StyleManager on core with single style element, migrate responsive + algorithm plugins

## Tasks
- [x] Add source: DragSource to resize event types in types.ts
- [x] Add StyleManager interface to types.ts, update GridiotCore
- [x] Pass source: 'pointer' in resize plugin events
- [x] Replace DOM heuristic with detail.source in algorithm-push.ts
- [x] Enable View Transitions during resize-move in algorithm-push.ts
- [x] Create StyleManager in engine.ts init()
- [x] Migrate responsive plugin to core.styles
- [x] Migrate algorithm-push plugin to core.styles
- [x] Update architecture.html (single style element, CSS inspector)
- [x] Build and verify

## Summary of Changes

### types.ts
- Added `source: DragSource` to `ResizeStartDetail`, `ResizeMoveDetail`, `ResizeEndDetail`, `ResizeCancelDetail`
- Added `StyleManager` interface with `set()`, `get()`, `clear()`, `commit()` methods
- Added `styles: StyleManager` to `GridiotCore`
- Removed `styleElement` from `AlgorithmPushPluginOptions` and `ResponsivePluginOptions`
- Updated `InitOptions.styleElement` JSDoc to reflect its new role as the managed style element

### engine.ts
- Created `StyleManager` inside `init()` with ordered named layers
- Auto-creates a `<style>` element if none provided, cleans up on destroy
- Pre-populates 'base' layer from existing content (supports server-rendered CSS)
- Removed `styleElement` from plugin options spreading

### plugins/resize.ts
- Added `source: 'pointer'` to all emitted resize events (start, move, end, cancel)

### plugins/algorithm-push.ts
- Replaced `styleElement` with `core.styles` (using 'preview' layer)
- Replaced DOM heuristic (`style.position === 'fixed'`) with `resizeSource` from event detail
- Enabled View Transitions during resize-move so other items animate smoothly
- Added `resizeSource` state variable, populated from `detail.source` on resize-start

### plugins/responsive.ts
- Replaced `styleElement` with `core.styles` (using 'base' layer)
- Removed `styleElement` from plugin registration options

### examples/architecture.html
- Replaced two `<style>` elements with single `<style id="gridiot-styles">`
- Passes `styleElement` to `init()` instead of individual plugins
- CSS inspector observes the single style element
- Updated `preservePositionsAsInlineStyles()` and `disablePlugin()` to use `core.styles`

### examples/advanced.html
- Removed `<style id="preview-styles">` (merged into layout-styles)
- Passes `styleElement: layoutStyleElement` to `init()`
- Removed `styleElement` from `attachResponsive()` and `attachPushAlgorithm()` calls
