# AGENTS.md

Guidelines for AI agents working on this codebase.

## CSS Spec Documentation

**Read these docs when working on core CSS features:**

| Doc | When to read |
|-----|--------------|
| [docs/css-grid.md](docs/css-grid.md) | Grid placement, track sizing, `grid-column`/`grid-row` |
| [docs/view-transitions.md](docs/view-transitions.md) | Animating layout changes, `view-transition-name` |
| [docs/grid-placement-patterns.md](docs/grid-placement-patterns.md) | Common placement code patterns |
| [docs/animation-patterns.md](docs/animation-patterns.md) | FLIP animation, View Transitions integration |

These docs distill the W3C specs ([CSS Grid Level 1](https://www.w3.org/TR/css-grid-1/), [View Transitions Level 1](https://www.w3.org/TR/css-view-transitions-1/)) into the context most relevant for this library.

## Commands

- To build – `node --experimental-strip-types build.ts`
- To serve – `pnpx vite .`

Outputs to `dist/`:
- `gridiot.js` - Full bundle (all plugins)
- Individual plugins for add-on use


## Project Overview

**Gridiot** is a zero-dependency CSS Grid drag-and-drop library. The core philosophy is **separation of concerns**: the library handles input detection and grid measurement, while layout algorithms are pluggable.

### Goals

- **No npm publish** - This library is not published to npm. Use via git or copy files directly.
- **No dependencies** - Zero runtime dependencies. Avoid dev dependencies too; prefer built-in Node/browser APIs.
- **Platform-first** - Maximize use of browser features, minimize JavaScript.

### Plugin Architecture

Plugins are separate files with `attach*()` functions. `init()` in `engine.ts` wires them up directly based on options. Each plugin returns a cleanup function. Individual plugins can also be imported and attached manually for custom builds.

### Architecture

```
engine.ts           - Core (grid measurement, events, state machine)
layout-model.ts     - Responsive layout state management
types.ts            - TypeScript type definitions

plugins/
  pointer.ts        - Mouse/touch drag handling
  keyboard.ts       - Arrow keys, pick-up/drop
  accessibility.ts  - ARIA announcements
  algorithm-push-core.ts  - Pure layout algorithm (no DOM)
  algorithm-push.ts       - DOM integration for algorithm
  camera.ts         - Viewport auto-scroll
  resize.ts         - Item resizing
  placeholder.ts    - Drop target indicator
  responsive.ts     - Breakpoint detection + CSS injection
  dev-overlay.ts    - Debug panel (Shift+D)

bundles/
  index.ts          - Full bundle (all plugins)
```

## Core Principles

### 1. Platform First, JavaScript Second

**Use browser/platform features for everything except interaction orchestration.**

JavaScript should only:
- Capture and interpret user input (pointer events, keyboard events)
- Convert coordinates to grid cells
- Emit custom events for coordination
- Execute layout algorithms
- Generate CSS strings

The browser handles:
- All positioning (CSS Grid)
- All animations (View Transitions API, CSS animations)
- All scrolling (CSS scroll-margin, scrollIntoView)
- All visual states (CSS attribute selectors)
- All responsive behavior (container queries)

### 2. CSS Grid Does the Layout Math

Never calculate pixel positions for layout. CSS Grid handles it:

```css
.item {
  grid-column: 1 / span 2;  /* JS sets this */
  grid-row: 1 / span 1;     /* JS sets this */
}
```

JavaScript only sets which cell an item occupies. The browser computes actual pixel positions.

### 3. Style Injection, Not Inline Styles

**Always inject CSS via `<style>` elements. Never use inline `style=` attributes for layout.**

Why? View Transitions require stylesheet changes to capture before/after states:

```ts
// CORRECT: Style injection
const style = document.getElementById('layout-styles');
style.textContent = `#item-1 { grid-column: 2; grid-row: 1; }`;

// WRONG: Inline styles break View Transitions
element.style.gridColumn = '2';
```

Inline styles are only acceptable during active drag (when item is position: fixed and out of grid flow).

### 4. Separate Logic from DOM

Layout algorithms must be pure functions with no DOM access:

```ts
// algorithm-push-core.ts - PURE, testable
function calculateLayout(items: LayoutItem[], targetCell: GridCell): LayoutItem[] {
  // Only works with data, returns new layout
}

// algorithm-push.ts - DOM integration
function attachPushAlgorithm(element: HTMLElement, options) {
  // Listens to events, calls pure algorithm, updates DOM
}
```

This separation enables:
- Unit testing without DOM
- Reuse across different rendering targets
- Clearer reasoning about behavior

### 5. Data Attributes for State

Use `data-*` attributes for state, CSS selectors for styling:

```html
<div data-gridiot-item data-gridiot-dragging data-gridiot-colspan="2">
```

```css
[data-gridiot-dragging] {
  opacity: 0.8;
  z-index: 100;
}
```

Never toggle classes or inline styles for state. Data attributes are queryable and debuggable.

### 6. Events for Coordination

Plugins communicate via custom events, not direct function calls:

```ts
// Plugin emits
core.emit('gridiot:drag-move', { item, cell, colspan, rowspan });

// Consumer handles
element.addEventListener('gridiot:drag-move', (e) => {
  // Run algorithm, update layout
});
```

For shared state between plugins, use the state machine or direct properties on core:

```ts
// Check interaction state
const state = core.stateMachine.getState();
if (state.phase === 'interacting') { /* ... */ }

// Camera scrolling flag (set by camera.ts, read by algorithm-harness.ts)
core.cameraScrolling // boolean
```

## Implementation Patterns

### Fixed Positioning During Drag

During drag, items leave grid flow so the grid can reflow:

```ts
// Drag start
item.style.position = 'fixed';
item.style.left = `${rect.left}px`;
// Item is now out of grid flow

// Drag end
item.style.position = '';
// Algorithm plugin sets final position via CSS injection
// Item rejoins grid flow
```

### View Transitions for Animation

Always use View Transitions when available:

```ts
if (document.startViewTransition) {
  document.startViewTransition(() => {
    // Update CSS via core.styles or inline styles
    updateLayout(item, cell);
  });
} else {
  // FLIP fallback
  updateLayout(item, cell);
}
```

Items need `view-transition-name` to animate:

```css
.item {
  view-transition-name: var(--item-id);
}
```

### Container Queries for Responsive

Use container queries, not media queries:

```css
.grid {
  container-type: inline-size;
}

@container (min-width: 1100px) {
  /* 6-column layout */
}

@container (min-width: 650px) and (max-width: 1099px) {
  /* 4-column layout */
}
```

## Reference Implementation

**Consult `original-prototype.html` when implementing features.**

The prototype demonstrates working implementations of:
- Responsive layout switching
- View Transitions integration
- Drag with placeholder preview
- Debug/config panels
- Keyboard navigation patterns

If something worked in the prototype, understand how before reimplementing.

## File Reference

| File | Purpose |
|------|---------|
| `engine.ts` | Grid measurement, cell detection, event emission |
| `types.ts` | All TypeScript interfaces |
| `layout-model.ts` | Responsive layout state |
| `plugins/pointer.ts` | Pointer events, visual drag |
| `plugins/keyboard.ts` | Arrow key navigation |
| `plugins/algorithm-push-core.ts` | Pure push-down algorithm |
| `plugins/algorithm-push.ts` | DOM integration for algorithm |
| `original-prototype.html` | Reference implementation |

## Common Mistakes to Avoid

1. **Calculating pixel positions** - Let CSS Grid do it
2. **Using inline styles for layout** - Breaks View Transitions
3. **DOM access in algorithm code** - Keep algorithms pure
4. **Direct plugin-to-plugin calls** - Use events or state machine
5. **Media queries instead of container queries** - Container queries are more flexible
6. **Reimplementing without checking prototype** - Prototype has working patterns
