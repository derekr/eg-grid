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
- `eg-grid.js` / `eg-grid.min.js` - Core library (all features in one file)
- `eg-grid-element.js` / `eg-grid-element.min.js` - Web component
- `dev-overlay.js` / `dev-overlay.min.js` - Debug panel (optional)

## Project Overview

**EG Grid** is a zero-dependency CSS Grid drag-and-drop library in a single file (~1,165 lines). The core philosophy is **vendor-first**: copy the file into your project, read it, and make it yours. Use your LLM to customize. No versions, no publishing, no npm.

### Goals

- **Vendor-first** - Copy one file, own every line. No npm, no semver.
- **No dependencies** - Zero runtime dependencies.
- **Platform-first** - CSS Grid for layout, View Transitions for animation, container queries for responsive.
- **LLM-friendly** - One file, readable code. Feed it to your AI.

### Source Structure

```
src/
  eg-grid.ts            ← THE library (everything in one file)
  eg-grid-element.ts    ← <eg-grid> web component wrapper
  layout-model.ts       ← Responsive layout model (optional)
  bundles/element.ts    ← Web component bundle entry
  plugins/dev-overlay.ts← Debug panel (Shift+D, optional)
```

`eg-grid.ts` contains: core engine, state machine, pointer handling, keyboard handling, accessibility, push algorithm, algorithm harness, camera scroll, resize, placeholder, and responsive plugins. All in one file.

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
core.baseCSS = `[data-egg-item="a"] { grid-column: 2; grid-row: 1; }`;
core.commitStyles();

// WRONG: Inline styles break View Transitions
element.style.gridColumn = '2';
```

Inline styles are only acceptable during active drag (when item is position: fixed and out of grid flow).

### 4. Separate Logic from DOM

Layout algorithms are pure functions with no DOM access:

```ts
// Pure, testable
calculatePushLayout(items, draggedId, targetCell, columnCount);

// DOM integration is in the algorithm harness section of eg-grid.ts
```

### 5. Data Attributes for State

Use `data-*` attributes for state, CSS selectors for styling:

```html
<div data-egg-item data-egg-dragging data-egg-colspan="2">
```

```css
[data-egg-dragging] {
  opacity: 0.8;
  z-index: 100;
}
```

Never toggle classes or inline styles for state. Data attributes are queryable and debuggable.

### 6. Events for Coordination

Internal features communicate via custom events, not direct function calls:

```ts
// Emit
core.emit('egg-drag-move', { item, cell, colspan, rowspan });

// Listen
element.addEventListener('egg-drag-move', (e) => {
  // Run algorithm, update layout
});
```

State is tracked directly on the core object:

```ts
core.phase         // 'idle' | 'selected' | 'interacting'
core.interaction   // { type, mode, itemId, element, columnCount } | null
core.selectedItem  // HTMLElement | null
core.cameraScrolling // boolean (set by camera, read by algorithm)
```

## Key Interfaces

```ts
interface EggCore {
  element: HTMLElement
  phase: 'idle' | 'selected' | 'interacting'
  interaction: { type: 'drag' | 'resize'; mode: 'pointer' | 'keyboard'; itemId: string; element: HTMLElement; columnCount: number } | null
  selectedItem: HTMLElement | null
  cameraScrolling: boolean
  select(item: HTMLElement | null): void
  deselect(): void
  getCellFromPoint(x: number, y: number): GridCell | null
  getGridInfo(): { rect: DOMRect; columns: number[]; rows: number[]; gap: number; cellWidth: number; cellHeight: number }
  emit(event: string, detail: any): void
  commitStyles(): void
  baseCSS: string
  previewCSS: string
  destroy(): void
}

interface InitOptions {
  algorithm?: 'push' | false
  resize?: { handles?: 'corners' | 'edges' | 'all'; ... } | false
  camera?: { ... } | false
  placeholder?: { className?: string } | false
  accessibility?: false
  pointer?: false
  keyboard?: false
  responsive?: { layoutModel: ResponsiveLayoutModel; cellSize?: number; gap?: number }
  layoutModel?: ResponsiveLayoutModel
  styleElement?: HTMLStyleElement
}
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
// Algorithm sets final position via CSS injection
// Item rejoins grid flow
```

### View Transitions for Animation

Always use View Transitions when available:

```ts
if (document.startViewTransition) {
  document.startViewTransition(() => {
    updateLayout(item, cell);
  });
} else {
  updateLayout(item, cell);
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
```

## File Reference

| File | Purpose |
|------|---------|
| `src/eg-grid.ts` | THE library — all features in one file |
| `src/layout-model.ts` | Responsive layout state (optional, for breakpoints) |
| `src/eg-grid-element.ts` | `<eg-grid>` web component |
| `src/plugins/dev-overlay.ts` | Debug panel (Shift+D) |
| `src/bundles/element.ts` | Web component bundle entry |
| `build.ts` | Build script (Vite library mode) |
| `vite.config.ts` | Dev server + examples site build |

## Common Mistakes to Avoid

1. **Calculating pixel positions** - Let CSS Grid do it
2. **Using inline styles for layout** - Breaks View Transitions
3. **DOM access in algorithm code** - Keep algorithms pure
4. **Media queries instead of container queries** - Container queries are more flexible
5. **Referencing old multi-file architecture** - Everything is in `eg-grid.ts` now (no `engine.ts`, `state-machine.ts`, `types.ts`, or separate plugin files)
