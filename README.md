# EG Grid

Zero-dependency CSS Grid drag-and-drop library.

CSS handles layout and animation. JavaScript orchestrates user input. View Transitions make it feel alive.

## Quick Start

### Web Component

No JS setup required. Include the script, write HTML:

```html
<script type="module" src="eg-grid-element.js"></script>

<eg-grid columns="4" gap="8" algorithm="push" resize-handles="all">
  <div data-egg-item="a">A</div>
  <div data-egg-item="b">B</div>
  <div data-egg-item="c">C</div>
</eg-grid>
```

### Programmatic

For full control, use `init()` directly:

```html
<style>
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  [data-egg-item="a"] { grid-column: 1 / span 2; grid-row: 1; }
  [data-egg-item="b"] { grid-column: 3; grid-row: 1; }
</style>

<div class="grid" id="grid">
  <div data-egg-item="a">A</div>
  <div data-egg-item="b">B</div>
</div>

<script type="module">
  import { init } from './eg-grid.js';
  const core = init(document.getElementById('grid'));
</script>
```

## How It Works

```
                              ┌──────────────────────┐
                              │     State Machine     │
                              │                       │
                              │  idle → selected →    │
                              │  interacting →        │
                              │  committing → selected│
                              └──────────┬───────────┘
                                         │ orchestrates
                  ┌──────────────────────┼──────────────────────┐
                  │                      │                      │
          ┌───────▼───────┐    ┌────────▼────────┐    ┌───────▼───────┐
          │    Input       │    │   Algorithm      │    │    Output     │
          │                │    │                  │    │               │
          │  Pointer       │    │  Push (default)  │    │  CSS inject   │
          │  Keyboard      │    │  Reorder         │    │  View Trans.  │
          │  Resize        │    │  Server-side     │    │  ARIA live    │
          └───────┬───────┘    └────────┬────────┘    └───────┬───────┘
                  │                      │                      │
                  │     egg-drag-move    │   new layout CSS     │
                  │ ──────────────────►  │ ──────────────────►  │
                  │                      │                      │
                  └──────────────────────┴──────────────────────┘
                                         │
                                   CSS Grid does
                                   the actual layout
```

The core engine measures the grid, converts pointer coordinates to cell positions, and emits events. Plugins handle discrete responsibilities — input capture, layout calculation, visual feedback — but all coordinate through the engine's state machine and event system.

**The browser does the heavy lifting.** JavaScript never calculates pixel positions. It figures out *which cell* an item should occupy, generates CSS, and lets the browser handle positioning, animation, and responsive reflow.

### State Machine

One interaction at a time. Column count is captured at interaction start and held constant until commit.

```
              SELECT              START_INTERACTION
  ┌──────┐ ──────────► ┌──────────┐ ──────────────► ┌──────────────┐
  │ idle │              │ selected │                  │ interacting  │
  └──────┘ ◄────────── └──────────┘ ◄────────────── └──────┬───────┘
              DESELECT     ▲  CANCEL_INTERACTION           │
                           │                    COMMIT_INTERACTION
                           │  FINISH_COMMIT          │
                           │                   ┌─────▼──────┐
                           └─────────────────  │ committing  │
                                               └────────────┘
```

### What Handles What

| Responsibility | Handled by |
|---|---|
| Item positioning | CSS Grid (`grid-column`, `grid-row`) |
| Responsive reflow | CSS container queries |
| Drop animations | View Transitions API |
| Visual states | CSS attribute selectors (`[data-egg-dragging]`) |
| Scroll into view | `scrollIntoView()` + `scroll-margin` |
| Pointer tracking | Pointer plugin (JS) |
| Cell calculation | Core engine (JS) |
| Layout algorithm | Algorithm plugin (JS) — or your server |
| CSS generation | Algorithm harness → `<style>` injection |
| State coordination | State machine (JS) |
| Accessibility | ARIA live region announcements (JS) |

### Plugins

Plugins are internal modules with discrete responsibilities. They're not registered at runtime — `init()` wires them up based on options. Each returns a cleanup function.

```
eg-grid.js
├── Core engine        Grid measurement, cell detection, state machine, events
├── Pointer            Mouse/touch drag with hysteresis and fixed positioning
├── Keyboard           Arrow keys, hjkl, Enter/Space pick-up/drop, Shift+G mode
├── Accessibility      ARIA live announcements for drag and resize
├── Algorithm: Push    Collision → push down, compact up (dashboard-style)
├── Algorithm: Reorder Reflow items around dragged item (list-style)
├── Algorithm harness  Shared logic: DOM reads, CSS generation, View Transitions
├── Camera             Auto-scroll viewport when dragging near edges
├── Resize             Handle detection on edges/corners, resize events
├── Placeholder        Visual drop target indicator
└── Responsive         Container query CSS injection for breakpoints
```

Disable any plugin by passing `false`:

```js
init(grid, {
  camera: false,
  resize: false,
  keyboard: false,
});
```

## Algorithms

Two built-in algorithms handle what happens when items collide during drag:

**Push** (default) — Items push down to make room. Empty space compacts upward. Designed for dashboards and widget layouts.

**Reorder** — Items reflow around the dragged item, filling gaps naturally. Designed for sortable lists and galleries.

```js
// Push (default)
init(grid);

// Reorder
init(grid, { algorithm: 'reorder' });

// No algorithm — events only, you handle layout
init(grid, { algorithm: false });
```

### Server-Side Layout

Set `algorithm: false` to disable client-side layout calculation. Listen for drag/resize events and send them to your backend, which computes the new layout and returns updated CSS. This is useful for:

- Real-time multiplayer (server is source of truth)
- Complex custom algorithms
- Persisting layout changes server-side

The pure algorithm functions (`calculateLayout`, `compactUp`) have no DOM dependencies and can run in any JS environment.

## Server-Rendered vs Client-Side

EG Grid works in two modes. Both produce the same result — the difference is who provides the initial layout CSS.

### Server-Rendered

You provide CSS that positions items before JavaScript loads. No flash of unstyled content. The library enhances the existing grid with drag/drop.

```html
<style>
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  [data-egg-item="a"] { grid-column: 1 / span 2; grid-row: 1; }
  [data-egg-item="b"] { grid-column: 3; grid-row: 1; }
</style>

<div class="grid" id="grid">
  <div data-egg-item="a">A</div>
  <div data-egg-item="b">B</div>
</div>
```

Persist layout changes by listening for `egg-drag-end` or `egg-resize-end` events and updating your server/database.

### Client-Side

The library generates all layout CSS. Simpler setup for SPAs where JavaScript is always available.

```html
<eg-grid columns="4" gap="8" algorithm="push">
  <div data-egg-item="a">A</div>
  <div data-egg-item="b">B</div>
</eg-grid>
```

## `<eg-grid>` Web Component

A thin wrapper that calls `init()` for you. No Shadow DOM — items use your CSS, View Transitions work document-wide.

```html
<eg-grid columns="4" gap="8"
         algorithm="push"
         resize-handles="all"
         placeholder-class="drop-placeholder">
  <div data-egg-item="a">A</div>
  <div data-egg-item="b">B</div>
</eg-grid>
```

### Attributes

| Attribute | Description |
|---|---|
| `columns` | Max column count |
| `cell-size` | Min cell width in px (enables responsive breakpoints) |
| `gap` | Grid gap in px |
| `algorithm` | `push` (default), `reorder`, or `none` |
| `resize-handles` | `corners`, `edges`, or `all` |
| `placeholder-class` | CSS class for drop placeholder |
| `no-camera` | Disable auto-scroll |
| `no-keyboard` | Disable keyboard navigation |
| `no-accessibility` | Disable ARIA announcements |
| `no-placeholder` | Disable placeholder |

### Responsive

Add `cell-size` to auto-generate container query breakpoints that reflow items as the grid container resizes:

```html
<eg-grid columns="6" cell-size="140" gap="8" algorithm="push">
```

Without `cell-size`, column count stays fixed. With it, the responsive plugin generates `@container` rules that adjust columns based on available width.

## Events

All events use dash-separated names (e.g. `egg-drag-start`) and bubble from the grid element.

| Event | Detail | When |
|---|---|---|
| `egg-drag-start` | `{ item, cell, colspan, rowspan, source }` | Drag begins |
| `egg-drag-move` | `{ item, cell, x, y, colspan, rowspan, source }` | Pointer moves to new cell |
| `egg-drag-end` | `{ item, cell, colspan, rowspan, source }` | Drop |
| `egg-drag-cancel` | `{ item, source }` | Escape or pointer leaves grid |
| `egg-resize-start` | `{ item, handle, colspan, rowspan, source }` | Resize begins |
| `egg-resize-move` | `{ item, handle, colspan, rowspan, source }` | Size changes |
| `egg-resize-end` | `{ item, handle, colspan, rowspan, source }` | Resize committed |
| `egg-resize-cancel` | `{ item, source }` | Resize cancelled |
| `egg-select` | `{ item }` | Item selected |
| `egg-deselect` | `{ item }` | Selection cleared |
| `egg-column-count-change` | `{ columnCount }` | Responsive breakpoint change |
| `egg-drop-preview` | `{ item, column, row, colspan, rowspan }` | Reorder algorithm preview position |

`source` is `'pointer'` or `'keyboard'`.

## Styling

### Data Attributes

Items are styled via CSS attribute selectors. The library sets these automatically:

```css
/* Dragging */
[data-egg-dragging] { cursor: grabbing; z-index: 100; transform: scale(1.03); }
[data-egg-dropping] { z-index: 100; }

/* Selection */
[data-egg-selected] { outline: 2px solid #fbbf24; }

/* Resize handles */
[data-egg-handle-hover="se"]::after { /* show SE corner indicator */ }
[data-egg-handle-active="se"]::after { /* highlight active handle */ }

/* Resizing */
[data-egg-resizing] { z-index: 100; }

/* Keyboard mode */
[data-egg-keyboard-mode] { outline: 2px solid rgba(251, 191, 36, 0.3); }
```

### View Transitions

For animated layout changes, give items a `view-transition-name`:

```css
.item { view-transition-name: var(--item-id); }

::view-transition-group(*) {
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}
```

The `--item-id` custom property is set automatically by the web component, or manually in programmatic use.

### Item Attributes

| Attribute | Purpose |
|---|---|
| `data-egg-item` | Mark as grid item (value is the item ID) |
| `data-egg-colspan` | Column span (default: 1, or derived from CSS) |
| `data-egg-rowspan` | Row span (default: 1, or derived from CSS) |
| `data-egg-label` | Human-readable name for accessibility |

## Keyboard

| Key | Action |
|---|---|
| **Shift+G** | Toggle keyboard mode |
| **Arrow keys** / **hjkl** | Nudge item by 1 cell |
| **Shift+Arrow** / **Shift+hjkl** | Resize item |
| **Ctrl+Arrow** / **Ctrl+hjkl** | Jump by item size |
| **Alt+Arrow** / **Alt+hjkl** | Select adjacent item |
| **Enter** / **Space** | Pick up / drop item |
| **Escape** | Cancel or deselect |

## Accessibility

The accessibility plugin announces drag and resize actions via an ARIA live region.

Label items with `data-egg-label`:

```html
<div data-egg-item="chart" data-egg-label="Revenue Chart">...</div>
```

Override announcements with template attributes (`{label}`, `{row}`, `{column}`, `{colspan}`, `{rowspan}`):

```html
<div data-egg-item="chart"
     data-egg-announce-grab="{label} picked up"
     data-egg-announce-move="Row {row}, column {column}"
     data-egg-announce-drop="{label} placed">
```

## Bundles

```
dist/
  eg-grid.js           Full bundle — all plugins
  eg-grid-element.js   Web component — <eg-grid> + all plugins
  algorithm-push.js    Push algorithm (standalone)
  algorithm-reorder.js Reorder algorithm (standalone)
  camera.js            Auto-scroll (standalone)
  resize.js            Resize handles (standalone)
  placeholder.js       Drop placeholder (standalone)
  dev-overlay.js       Debug panel (standalone, Shift+D)
```

## Building

```bash
# Library bundles
node --experimental-strip-types build.ts

# Examples site
pnpm run build:site
```

## Browser Support

- Chrome 111+ (View Transitions)
- Safari 18+ (View Transitions)
- Firefox 128+ (View Transitions with known issues — see `docs/known-issues.md`)

View Transitions degrade gracefully — layout changes still work, they just aren't animated.

## Guiding Principles

1. **CSS does the layout** — JavaScript figures out which cell, CSS Grid positions the item
2. **Style injection, not inline styles** — `<style>` elements so View Transitions can animate between states
3. **Data attributes for state** — `[data-egg-dragging]` not `.dragging` — queryable, debuggable, no class conflicts
4. **Events for coordination** — plugins communicate via custom events on the grid element
5. **Algorithms are separate** — input handling is universal, layout logic is pluggable
6. **Platform first** — `scrollIntoView()` not scroll math, container queries not resize observers, View Transitions not FLIP

## License

[Beerware](LICENSE)
