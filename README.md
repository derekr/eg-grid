# EG Grid

Zero-dependency CSS Grid drag-and-drop. One file. 8.8 KB gzipped.

**This is not a package you install.** Copy `src/eg-grid.ts` into your project, read it, and make it yours. Use your LLM to customize. No versions. No publishing. No semver.

## Why

| | EG Grid | Packery | gridster.js | react-grid-layout |
|---|---|---|---|---|
| **Minified** | 29 KB | ~38 KB | ~32 KB | ~43 KB |
| **Gzipped** | 8.8 KB | ~12 KB | ~10 KB | ~13 KB |
| **Dependencies** | 0 | 0 (bundled) | jQuery (~30 KB) | React (~42 KB) |
| **Total w/ deps** | 29 KB | ~48 KB | ~62 KB | ~85 KB+ |
| **Framework** | none | none | jQuery | React only |
| **Layout engine** | CSS Grid | abs positioning | abs positioning | CSS transforms |
| **Drag** | yes | yes (addon) | yes | yes |
| **Resize (8-way)** | yes | no | SE only | SE only |
| **Keyboard** | yes | no | no | no |
| **Accessibility** | yes (ARIA) | no | no | no |
| **View Transitions** | yes | no | no | no |
| **Vendorable** | 1 file | npm/CDN | npm/CDN | npm only |

## Quick Start

### Copy the file (recommended)

```bash
cp src/eg-grid.ts your-project/lib/eg-grid.ts
```

```html
<div class="grid" id="grid">
  <div data-egg-item="a" data-egg-colspan="2">A</div>
  <div data-egg-item="b">B</div>
  <div data-egg-item="c">C</div>
</div>
<style id="egg-styles"></style>
```

```ts
import { init } from './lib/eg-grid';

const core = init(document.getElementById('grid'), {
  algorithm: 'push',
  styleElement: document.getElementById('egg-styles'),
  resize: { handles: 'all' },
});
```

### Web Component

```html
<script type="module" src="eg-grid-element.js"></script>

<eg-grid columns="4" gap="8" algorithm="push" resize-handles="all">
  <div data-egg-item="a" data-egg-colspan="2">A</div>
  <div data-egg-item="b">B</div>
  <div data-egg-item="c">C</div>
</eg-grid>
```

## How It Works

CSS Grid does the layout. JavaScript only sets `grid-column` and `grid-row` via `<style>` injection. The browser computes all pixel positions, handles animations via View Transitions, and manages responsive behavior through container queries.

During drag, the item leaves grid flow (`position: fixed`) so the grid can reflow around it. On drop, it rejoins the grid at its new position.

**State machine**: `idle` → `selected` → `interacting` → `idle`. Three phases, tracked on `core.phase`.

**Events**: All coordination happens through custom events on the grid element (`egg-drag-start`, `egg-drag-move`, `egg-resize-end`, etc.).

**Data attributes**: State is expressed as `data-egg-*` attributes. Style with CSS:

```css
[data-egg-dragging] { opacity: 0.8; z-index: 100; }
[data-egg-selected] { outline: 2px solid gold; }
```

## Features

Everything is in one file. No plugins to configure — just `init()` options:

| Option | Default | Description |
|---|---|---|
| `algorithm` | `false` | `'push'` (dashboard), `'reorder'` (list), or `false` (manual) |
| `resize` | enabled | `{ handles: 'corners' \| 'edges' \| 'all' }` or `false` |
| `camera` | enabled | Auto-scroll during drag. `false` to disable |
| `placeholder` | enabled | Drop target indicator. `{ className }` or `false` |
| `keyboard` | enabled | Arrow key nav, Enter/Space grab. `false` to disable |
| `accessibility` | enabled | ARIA announcements. `false` to disable |
| `pointer` | enabled | Mouse/touch drag. `false` to disable |
| `responsive` | disabled | `{ layoutModel, cellSize, gap }` for container query breakpoints |
| `styleElement` | auto-created | `<style>` element for CSS injection |

## API

```ts
const core = init(element, options);

core.phase          // 'idle' | 'selected' | 'interacting'
core.interaction    // { type, mode, itemId, element, columnCount } | null
core.selectedItem   // HTMLElement | null
core.select(item)   // Programmatic select
core.deselect()     // Programmatic deselect
core.baseCSS        // Get/set base layout CSS
core.previewCSS     // Get/set preview CSS (during drag/resize)
core.commitStyles() // Flush CSS to <style> element
core.destroy()      // Clean up all listeners
```

### Events

Listen on the grid element:

```ts
element.addEventListener('egg-drag-end', (e) => {
  const { item, cell, colspan, rowspan, source } = e.detail;
});
```

| Event | Detail |
|---|---|
| `egg-select` | `{ item }` |
| `egg-deselect` | `{ item }` |
| `egg-drag-start` | `{ item, cell, colspan, rowspan, source }` |
| `egg-drag-move` | `{ item, cell, colspan, rowspan, source }` |
| `egg-drag-end` | `{ item, cell, colspan, rowspan, source }` |
| `egg-drag-cancel` | `{ item, source }` |
| `egg-resize-start` | `{ item, handle, colspan, rowspan, source }` |
| `egg-resize-move` | `{ item, handle, colspan, rowspan, source }` |
| `egg-resize-end` | `{ item, handle, colspan, rowspan, source }` |
| `egg-resize-cancel` | `{ item, source }` |
| `egg-column-count-change` | `{ columnCount }` |
| `egg-drop-preview` | `{ item, column, row, colspan, rowspan }` |

`source` is `'pointer'` or `'keyboard'`.

### Exported Utilities

```ts
import {
  getItemCell,            // Read item's current grid position
  getItemSize,            // Read item's colspan/rowspan
  getItemId,              // Resolve item's ID
  layoutToCSS,            // Convert layout map to CSS string
  readItemsFromDOM,       // Snapshot all items as ItemRect[]
  calculatePushLayout,    // Pure push algorithm
  calculateReorderLayout, // Pure reorder algorithm
} from './eg-grid';
```

## Responsive Layouts

For responsive breakpoints, use the layout model (separate file for tree-shaking):

```ts
import { init } from './eg-grid';
import { createLayoutModel } from './layout-model';

const layoutModel = createLayoutModel({
  maxColumns: 6,
  minColumns: 1,
  items: [
    { id: 'a', width: 2, height: 1 },
    { id: 'b', width: 1, height: 1 },
  ],
  canonicalPositions: new Map([
    ['a', { column: 1, row: 1 }],
    ['b', { column: 3, row: 1 }],
  ]),
});

const core = init(grid, {
  algorithm: 'push',
  responsive: { layoutModel, cellSize: 120, gap: 8 },
});
```

Container queries auto-generate breakpoints. Resize the container and items reflow.

## Keyboard

Items should have `tabindex="0"` (the web component sets this automatically).

| Key | Action |
|---|---|
| **Arrow keys** / **hjkl** | Nudge item by 1 cell |
| **Shift+Arrow** | Resize item |
| **Ctrl+Arrow** | Jump by item size |
| **Alt+Arrow** | Select adjacent item |
| **Enter** / **Space** | Pick up / drop item |
| **Escape** | Cancel or deselect |
| **Shift+G** | Toggle keyboard mode |

## Styling

### Data Attributes

The library sets these on items during interactions:

| Attribute | When |
|---|---|
| `data-egg-dragging` | Item is being dragged |
| `data-egg-dropping` | Item is animating to final position |
| `data-egg-selected` | Item is selected |
| `data-egg-resizing` | Item is being resized |
| `data-egg-handle-hover` | Mouse is over a resize handle (value: `se`, `nw`, etc.) |
| `data-egg-handle-active` | Resize is active on a handle |
| `data-egg-keyboard-mode` | Set on grid when keyboard mode is active |

### View Transitions

For animated layout changes, give items a `view-transition-name`:

```css
.item { view-transition-name: var(--item-id); }

::view-transition-group(*) {
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}
```

### Item Attributes

| Attribute | Purpose |
|---|---|
| `data-egg-item` | Mark as grid item (value = item ID) |
| `data-egg-colspan` | Column span (default: 1, or derived from CSS) |
| `data-egg-rowspan` | Row span (default: 1, or derived from CSS) |
| `data-egg-label` | Human-readable name for accessibility announcements |

## Bundles

Pre-built in `dist/`:

| File | Size (gzip) | Description |
|---|---|---|
| `eg-grid.js` | 8.8 KB | Core library |
| `eg-grid-element.js` | 10.9 KB | Web component (`<eg-grid>`) |
| `dev-overlay.js` | 3.1 KB | Debug panel (Shift+D) |

Build: `node --experimental-strip-types build.ts`

## Source Structure

```
src/
  eg-grid.ts            ← THE library (1,165 lines, everything in one file)
  eg-grid-element.ts    ← <eg-grid> web component wrapper
  layout-model.ts       ← Responsive layout model (optional, for breakpoints)
  bundles/element.ts    ← Web component bundle entry point
  plugins/dev-overlay.ts← Debug panel (optional, Shift+D)
```

## Vendor-First Philosophy

This library is designed to be vendored. Copy one file into your codebase and own it.

- **No npm.** No registry. No lock file entry.
- **No versions.** The code you copy is your version.
- **No API stability contract.** Modify the source to fit your needs.
- **LLM-friendly.** One file, ~1,100 lines. Feed it to your AI and ask for changes.
- **One grep away.** Every feature, every edge case, one file.

The alternative libraries require you to depend on someone else's release schedule, fight their API when it doesn't fit, and ship code you can't read. EG Grid is the opposite: you own every line.

## Core Values

1. **CSS Grid does the layout math** — JS sets `grid-column`/`grid-row`, the browser computes pixels
2. **Style injection, not inline styles** — View Transitions require stylesheet changes
3. **Data attributes for state** — `data-egg-dragging`, not `.is-dragging`
4. **Custom events for coordination** — `egg-drag-move`, not callback props
5. **Platform first** — Container queries, View Transitions, `scrollIntoView`, ARIA
6. **Zero dependencies** — No runtime deps. No build tool deps in production.
