# Gridiot

Zero-dependency CSS Grid drag-and-drop library with View Transitions support.

## Features

- Works with native CSS Grid layouts
- Pointer (mouse/touch) and keyboard support
- Screen reader accessibility with ARIA live announcements
- View Transitions API for smooth animations
- Plugin architecture for custom input handling
- TypeScript-first with type-safe events
- Tree-shakeable bundles

## Architecture

Gridiot separates **input handling** (how you drag) from **layout logic** (what happens when you drag). The core engine provides grid-aware primitives, while plugins handle the rest.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your App                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐    Events     ┌─────────────────────────┐    │
│   │   Gridiot   │ ────────────► │   Your Event Handlers   │    │
│   │    Core     │               │   (Layout Algorithm)    │    │
│   └─────────────┘               └─────────────────────────┘    │
│          │                                                      │
│          │ Plugins auto-register                                │
│          ▼                                                      │
│   ┌─────────────────────────────────────────────┐              │
│   │              Input Plugins                   │              │
│   ├───────────────┬───────────────┬─────────────┤              │
│   │    Pointer    │   Keyboard    │ Accessibility│              │
│   │  (mouse/touch)│  (arrows/tab) │ (ARIA live) │              │
│   └───────────────┴───────────────┴─────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Core Engine Responsibilities

```
┌─────────────────────────────────────────┐
│            Gridiot Core                 │
├─────────────────────────────────────────┤
│  • Parse CSS Grid layout (columns/rows) │
│  • Convert point → cell coordinates     │
│  • Emit drag events on grid element     │
│  • Manage plugin lifecycle              │
│  • Provide grid measurement utilities   │
└─────────────────────────────────────────┘
         │
         │ Does NOT handle:
         │  • Visual dragging (that's pointer plugin)
         │  • Layout algorithms (that's your code)
         │  • Multi-cell items (read data attributes)
         │
         ▼
┌─────────────────────────────────────────┐
│         What You Implement              │
├─────────────────────────────────────────┤
│  • Layout algorithm (swap/push/insert)  │
│  • Visual feedback (placeholders, etc)  │
│  • Data model updates                   │
│  • Persistence                          │
└─────────────────────────────────────────┘
```

### Event Flow

```
  User drags item                Your drag-move handler
        │                                │
        ▼                                ▼
┌───────────────┐  drag-start   ┌───────────────────┐
│    Pointer    │ ───────────►  │  Save original    │
│    Plugin     │               │  positions        │
└───────────────┘               └───────────────────┘
        │
        │  drag-move (cell changed)
        ▼
┌───────────────┐  drag-move    ┌───────────────────┐
│  Core emits   │ ───────────►  │  Calculate new    │
│  with cell    │               │  layout, apply    │
└───────────────┘               │  with View Trans. │
        │                       └───────────────────┘
        │  drag-end
        ▼
┌───────────────┐  drag-end     ┌───────────────────┐
│  Core emits   │ ───────────►  │  Finalize layout  │
│  final cell   │               │  Update data      │
└───────────────┘               └───────────────────┘
```

### Why This Design?

**Algorithms are opinionated.** Different apps need different behaviors:
- Dashboard: Push items down, compact up
- Kanban: Insert at position, shift others
- Gallery: Simple swap

By keeping algorithms in userland, Gridiot stays small and flexible. Use the built-in algorithm plugins or write your own.

**Input methods are universal.** Pointer, keyboard, and accessibility handling are the same regardless of layout algorithm. These ship as plugins you can mix and match.

### Architecture Philosophy: CSS-First, JS for Coordination

Gridiot maximizes use of modern CSS and browser APIs. JavaScript handles orchestration and user input, not layout calculations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CSS HANDLES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYOUT:                                                                     │
│    • CSS Grid (grid-template-columns, grid-auto-rows, gap)                  │
│    • Item positioning (grid-column, grid-row)                               │
│    • Responsive layouts (container queries, media queries)                  │
│                                                                              │
│  ANIMATIONS:                                                                 │
│    • View Transitions API (view-transition-name per item)                   │
│    • ::view-transition-group for z-index during animations                  │
│    • CSS transitions for hover/focus states                                 │
│                                                                              │
│  SCROLL POSITIONING:                                                         │
│    • scroll-margin on items (e.g., scroll-margin: 25vh)                     │
│    • scrollIntoView() with block: 'nearest' lets browser handle math        │
│    • scroll-behavior: smooth for native smooth scrolling                    │
│                                                                              │
│  VISUAL STATES:                                                              │
│    • [data-gridiot-dragging], [data-gridiot-selected] selectors             │
│    • body.is-dragging for global drag state                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           JAVASCRIPT HANDLES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  INPUT ORCHESTRATION:                                                        │
│    • Pointer event capture and normalization                                │
│    • Keyboard event handling (Shift+G mode, arrows, etc.)                   │
│    • Cell calculation from pointer coordinates                              │
│                                                                              │
│  EVENT EMISSION:                                                             │
│    • Custom events (gridiot:drag-start, gridiot:select, etc.)               │
│    • Event detail with item, cell, dimensions                               │
│                                                                              │
│  PLUGIN COORDINATION:                                                        │
│    • Provider registry for cross-plugin state                               │
│    • Timing/settle delays for scroll-layout coordination                    │
│                                                                              │
│  ALGORITHM EXECUTION:                                                        │
│    • Collision detection and layout calculation                             │
│    • CSS string generation (layoutToCSS → inject into <style>)              │
│    • Triggering View Transitions (document.startViewTransition)             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Guiding Principles:**

1. **Use Baseline features** - Only use CSS/JS features with broad browser support ([Baseline](https://web.dev/baseline/))
2. **Delegate to the browser** - If CSS can handle it, don't write JS for it
3. **CSS for positioning math** - `scroll-margin`, `scrollIntoView()`, Grid layout
4. **JS for orchestration** - Event handling, state coordination, algorithm logic
5. **Animations via View Transitions** - No manual FLIP or JavaScript animation

### Bundle Architecture

```
gridiot.js (full)
├── Core engine
├── Pointer plugin (visual drag, hysteresis, FLIP)
├── Keyboard plugin (arrow keys, enter/space)
└── Accessibility plugin (ARIA live regions)

gridiot-minimal.js
├── Core engine
└── Pointer plugin

gridiot-core.js
└── Core engine only (bring your own plugins)

algorithm-push.js (optional add-on)
└── Push-down layout algorithm with compact-up

camera.js (optional add-on)
└── Auto-scroll when dragging near edges or navigating off-screen

placeholder.js (optional add-on)
└── Visual drop target indicator

dev-overlay.js (optional add-on)
└── Debug/config overlay (Shift+D)
```

## Installation

```bash
# Copy the dist files to your project
cp gridiot/dist/gridiot.js your-project/
```

## Quick Start

```html
<div class="grid" id="grid">
  <div data-gridiot-item style="grid-column: 1; grid-row: 1">A</div>
  <div data-gridiot-item style="grid-column: 2; grid-row: 1">B</div>
  <div data-gridiot-item style="grid-column: 3; grid-row: 1">C</div>
</div>

<script type="module">
  import { init, getItemCell, setItemCell } from './gridiot.js';

  const grid = init(document.getElementById('grid'));

  grid.element.addEventListener('gridiot:drag-move', (e) => {
    const { item, cell } = e.detail;
    // Move item to new cell
    setItemCell(item, cell);
  });
</script>
```

## Bundles

Three bundle sizes available:

| Bundle | Size | Includes |
|--------|------|----------|
| `gridiot.js` | Full | Pointer + keyboard + accessibility plugins |
| `gridiot-minimal.js` | Minimal | Pointer plugin only |
| `gridiot-core.js` | Core | No plugins (bring your own) |

## API

### `init(element: HTMLElement, options?: InitOptions): GridiotCore`

Initialize Gridiot on a CSS Grid container.

```js
// Simple - all plugins with defaults
const grid = init(document.getElementById('grid'));

// With responsive layout support
const grid = init(document.getElementById('grid'), {
  layoutModel,
  styleElement,
});

// With plugin-specific options
const grid = init(document.getElementById('grid'), {
  layoutModel,
  styleElement,
  plugins: {
    camera: { mode: 'center', edgeSize: 80 },
    resize: { handles: 'corners', minSize: { colspan: 1, rowspan: 1 } },
  },
});

// Disable specific plugins
const grid = init(document.getElementById('grid'), {
  disablePlugins: ['camera', 'resize'],
});
```

#### InitOptions

```ts
interface InitOptions {
  /** Layout model for multi-breakpoint responsive support */
  layoutModel?: ResponsiveLayoutModel;
  /** Style element for CSS injection (used by responsive + algorithm plugins) */
  styleElement?: HTMLStyleElement;
  /** Plugin-specific configuration */
  plugins?: {
    camera?: CameraPluginOptions;
    resize?: ResizePluginOptions;
    placeholder?: PlaceholderPluginOptions;
    'algorithm-push'?: AlgorithmPushPluginOptions;
    responsive?: ResponsivePluginOptions;
  };
  /** List of plugin names to disable */
  disablePlugins?: string[];
}
```

### `getItemCell(item: HTMLElement): GridCell`

Get the current grid position of an item.

```js
const cell = getItemCell(item);
// { column: 2, row: 1 }
```

### `setItemCell(item: HTMLElement, cell: GridCell): void`

Set an item's grid position.

```js
setItemCell(item, { column: 3, row: 2 });
```

### `registerPlugin(plugin: Plugin): void`

Register a custom input plugin. Plugins auto-register via side-effect imports, so this is mainly for custom plugins.

```ts
registerPlugin({
  name: 'touch-gesture',
  init(core, options) {
    // options includes plugin-specific config + shared resources
    const { layoutModel, styleElement, ...pluginOptions } = options ?? {};

    // Set up listeners
    return () => {
      // Cleanup
    };
  }
});
```

Built-in plugins also export `attach*` functions for manual usage when you need more control:

```js
import { attachCamera, attachResize, attachPlaceholder, attachPushAlgorithm, attachResponsive } from 'gridiot';

// Manual plugin attachment (bypasses auto-init)
const camera = attachCamera(grid.element, { mode: 'center', core: grid });
const resize = attachResize(grid.element, { handles: 'corners', core: grid });
```

### `GridiotCore`

The core instance returned by `init()`:

```ts
interface GridiotCore {
  element: HTMLElement;
  getCellFromPoint(x: number, y: number): GridCell | null;
  emit<T>(event: string, detail: T): void;
  destroy(): void;
}
```

## Events

All events bubble and are dispatched on the grid element.

### `gridiot:drag-start`

Fired when dragging begins.

```ts
grid.element.addEventListener('gridiot:drag-start', (e) => {
  const { item, cell, colspan, rowspan } = e.detail;
  // item: HTMLElement being dragged
  // cell: { column, row } starting position
  // colspan, rowspan: item dimensions
});
```

### `gridiot:drag-move`

Fired continuously as the drag target moves over cells.

```ts
grid.element.addEventListener('gridiot:drag-move', (e) => {
  const { item, cell, x, y, colspan, rowspan } = e.detail;
  // cell: current cell under pointer
  // x, y: pointer coordinates (0 for keyboard)
  // colspan, rowspan: item dimensions
});
```

### `gridiot:drag-end`

Fired when dragging ends successfully (within grid bounds).

```ts
grid.element.addEventListener('gridiot:drag-end', (e) => {
  const { item, cell, colspan, rowspan } = e.detail;
  // cell: final drop position
  // colspan, rowspan: item dimensions
});
```

### `gridiot:drag-cancel`

Fired when dragging is cancelled (Escape key, pointer leaves grid, etc.).

```ts
grid.element.addEventListener('gridiot:drag-cancel', (e) => {
  const { item } = e.detail;
});
```

### `gridiot:select`

Fired when an item is selected (clicked or focused).

```ts
grid.element.addEventListener('gridiot:select', (e) => {
  const { item } = e.detail;
});
```

### `gridiot:deselect`

Fired when selection is cleared (Escape, click outside, etc.).

```ts
grid.element.addEventListener('gridiot:deselect', (e) => {
  const { item } = e.detail; // Previously selected item, or null
});
```

## Styling

### Item Attributes

- `data-gridiot-item` - Mark elements as draggable grid items
- `data-gridiot-colspan` - Number of columns the item spans (default: 1)
- `data-gridiot-rowspan` - Number of rows the item spans (default: 1)
- `data-gridiot-dragging` - Added automatically during pointer drag
- `data-gridiot-dropping` - Added during FLIP animation after drop
- `data-gridiot-selected` - Added when item is selected
- `data-gridiot-resizing` - Added during resize operation
- `data-gridiot-handle-hover` - Set to handle name (`se`, `nw`, etc.) when hovering a resize handle
- `data-gridiot-handle-active` - Set to handle name during active resize

```css
[data-gridiot-item] {
  cursor: grab;
}

[data-gridiot-dragging] {
  cursor: grabbing;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

[data-gridiot-selected] {
  outline: 3px solid #fbbf24;
  outline-offset: 2px;
}
```

### Resize Handle Styling

Use CSS pseudo-elements to create visible resize handles based on the data attributes:

```css
/* Base handle style - hidden by default */
[data-gridiot-item]::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

/* Position handle at bottom-right corner */
[data-gridiot-item]::after {
  bottom: 4px;
  right: 4px;
  background: rgba(59, 130, 246, 0.6);
  border-radius: 2px;
}

/* Show handle on hover */
[data-gridiot-item][data-gridiot-handle-hover="se"]::after,
[data-gridiot-item][data-gridiot-handle-hover="sw"]::after,
[data-gridiot-item][data-gridiot-handle-hover="ne"]::after,
[data-gridiot-item][data-gridiot-handle-hover="nw"]::after {
  opacity: 1;
}

/* Highlight during active resize */
[data-gridiot-item][data-gridiot-handle-active]::after {
  opacity: 1;
  background: rgba(59, 130, 246, 0.9);
}
```

Handle names: `n`, `s`, `e`, `w` (edges), `nw`, `ne`, `sw`, `se` (corners).

### Body Class

During pointer drag, `is-dragging` is added to `document.body`. Use this to prevent text selection:

```css
body.is-dragging {
  user-select: none;
  cursor: grabbing;
}
```

### Grid Attributes

- `data-gridiot-keyboard-mode` - Added to grid when keyboard mode is active (Shift+G)

```css
.grid[data-gridiot-keyboard-mode] {
  outline: 2px solid rgba(251, 191, 36, 0.3);
  outline-offset: 4px;
}
```

### View Transitions

For smooth animated movement, use CSS View Transitions:

```css
.item {
  view-transition-name: var(--item-id);
}

::view-transition-group(*) {
  animation-duration: 200ms;
}
```

```html
<div data-gridiot-item style="--item-id: item-1">A</div>
```

Then wrap position changes in a View Transition:

```js
grid.element.addEventListener('gridiot:drag-move', (e) => {
  const { item, cell } = e.detail;

  if ('startViewTransition' in document) {
    document.startViewTransition(() => {
      setItemCell(item, cell);
    });
  } else {
    setItemCell(item, cell);
  }
});
```

## Keyboard Support

When using the full bundle (`gridiot.js`), keyboard navigation is included:

### Keyboard Mode

Press **Shift+G** to toggle keyboard mode. When active, the grid shows a visual indicator and you can navigate without clicking first.

### Navigation Keys

| Key | Action |
|-----|--------|
| **Shift+G** | Toggle keyboard mode |
| **Arrow keys** or **hjkl** | Nudge selected item by 1 cell |
| **Shift+Arrow** or **Shift+hjkl** | Resize selected item |
| **Ctrl+Arrow** or **Ctrl+hjkl** | Jump by item size |
| **Alt+Arrow** or **Alt+hjkl** | Select adjacent item |
| **Enter** or **Space** | Pick up / drop item |
| **Escape** | Cancel drag or deselect |

### Pick Up Mode

Press Enter/Space to "pick up" an item. While held:
- Arrow keys move the item and show preview
- Enter/Space drops the item
- Escape cancels and restores original position

### Quick Nudge

Without picking up, arrow keys perform instant nudge (drag-start + drag-end in one action).

Items should have `tabindex="0"` to be focusable:

```html
<div data-gridiot-item tabindex="0">A</div>
```

## Accessibility

The full bundle includes screen reader support via ARIA live announcements. The accessibility plugin announces:

- When an item is grabbed
- When an item moves to a new cell
- When an item is dropped
- When a drag is cancelled

### Labeling Items

Use `data-gridiot-label` to provide a human-readable name for items:

```html
<div data-gridiot-item data-gridiot-label="Revenue Chart">...</div>
```

Falls back to `aria-label`, then `id`, then "Item".

### Custom Announcements

Override default announcements with template attributes. Use `{label}`, `{row}`, and `{column}` placeholders:

```html
<!-- Per-item override -->
<div
  data-gridiot-item
  data-gridiot-label="Sales Chart"
  data-gridiot-announce-grab="{label} selected at {row}, {column}."
  data-gridiot-announce-drop="Placed {label}."
>
  ...
</div>

<!-- Grid-wide default -->
<div
  id="grid"
  data-gridiot-announce-move="Now at row {row}, column {column}."
>
  ...
</div>
```

**Available attributes:**
- `data-gridiot-announce-grab` - When item is picked up
- `data-gridiot-announce-move` - When item moves to a new cell
- `data-gridiot-announce-drop` - When item is dropped
- `data-gridiot-announce-cancel` - When drag is cancelled

**Attribute precedence:** Item attribute > Grid attribute > Default

## Layout Algorithms

Gridiot doesn't enforce a specific layout algorithm. You can use a built-in algorithm plugin or implement your own.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Algorithm Options                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Built-in Plugin          Roll Your Own                         │
│  ┌─────────────────┐      ┌─────────────────────────────────┐  │
│  │ algorithm-push  │      │  Listen to drag events          │  │
│  │                 │      │  Calculate new positions        │  │
│  │ • Push down on  │  OR  │  Apply with View Transitions    │  │
│  │   collision     │      │                                 │  │
│  │ • Compact up    │      │  Examples: swap, insert, snap   │  │
│  └─────────────────┘      └─────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Using the Push Algorithm Plugin

```js
import { init } from './gridiot.js';
import { attachPushAlgorithm } from './algorithm-push.js';

const grid = init(document.getElementById('grid'));
attachPushAlgorithm(grid.element);

// That's it! Items push down on collision, compact up when space opens.
```

### Push Algorithm Options

```js
attachPushAlgorithm(grid.element, {
  // Inject CSS into a <style> element (recommended for View Transitions)
  styleElement: document.getElementById('layout-styles'),

  // CSS selector prefix for generated rules (default: '#')
  selectorPrefix: '#',

  // Whether to compact items upward after collisions (default: true)
  compaction: true,
});
```

**CSS Injection Mode:** When `styleElement` is provided, the algorithm generates CSS rules instead of setting inline styles. This works better with View Transitions because the browser can animate between stylesheet states.

```html
<style id="layout-styles"></style>
```

**Compaction:** When `true`, items float upward to fill gaps after collisions are resolved. Set to `false` if you want items to stay where they're pushed.

### Custom: Swap

```js
function swap(draggedItem, targetCell) {
  const items = [...document.querySelectorAll('[data-gridiot-item]')];
  const draggedCell = getItemCell(draggedItem);

  const targetItem = items.find(item => {
    if (item === draggedItem) return false;
    const cell = getItemCell(item);
    return cell.column === targetCell.column && cell.row === targetCell.row;
  });

  setItemCell(draggedItem, targetCell);
  if (targetItem) {
    setItemCell(targetItem, draggedCell);
  }
}
```

### Custom: Insert (shift items)

```js
function insert(draggedItem, targetCell) {
  // Shift items between old and new position
  // Implementation depends on your grid structure
}
```

## Building

```bash
npx tsx gridiot/build.ts
```

Outputs to `gridiot/dist/`.

## Browser Support

- Chrome 111+ (View Transitions)
- Safari 18+ (View Transitions)
- Firefox (works without View Transitions, falls back gracefully)

## Placeholder

The placeholder plugin shows a visual indicator where the dragged item will land.

```js
import { init } from './gridiot.js';
import { attachPlaceholder } from './placeholder.js';

const grid = init(document.getElementById('grid'));
const placeholder = attachPlaceholder(grid.element, {
  className: 'drop-placeholder', // CSS class (default: 'gridiot-placeholder')
});

// Optional: inject default styles
import { attachPlaceholderStyles } from './placeholder.js';
attachPlaceholderStyles();

// Later, to clean up:
placeholder.destroy();
```

### Styling

Add CSS for your placeholder class:

```css
.drop-placeholder {
  background: rgba(255, 255, 255, 0.1);
  border: 2px dashed rgba(255, 255, 255, 0.4);
  border-radius: 8px;
}
```

Or use the built-in styles with `attachPlaceholderStyles()`.

### API

```js
placeholder.show(column, row, colspan, rowspan); // Manually show
placeholder.hide();     // Manually hide
placeholder.destroy();  // Remove listeners and clean up
```

## Dev Overlay

The dev overlay plugin provides a debugging and configuration panel for development.

```js
import { attachDevOverlay } from './dev-overlay.js';

const devOverlay = attachDevOverlay(gridElement, {
  visible: false,      // Start hidden
  initialTab: 'debug', // 'debug' or 'config'
  toggleKey: 'D',      // Shift+D to toggle
});
```

### Keyboard Shortcut

Press **Shift+D** to toggle the overlay.

### Debug Tab

Shows real-time information:
- **Grid Info:** Columns, rows, cell dimensions, gap
- **Items:** List of all items with their positions
- **Event Log:** Live feed of drag events

### Config Tab

Runtime configuration with registered options:
- Boolean toggles
- Action buttons

### Registering Config Options

Plugins can register their options with the overlay:

```js
// Boolean toggle
devOverlay.registerOption({
  key: 'compaction',
  label: 'Compact items upward',
  type: 'boolean',
  value: true,
  onChange: (value) => {
    // Handle change
  }
});

// Action button
devOverlay.registerOption({
  key: 'compact-now',
  label: 'Compact Now',
  type: 'action',
  onAction: () => {
    // Perform action
  }
});
```

### API

```js
devOverlay.show();    // Show the overlay
devOverlay.hide();    // Hide the overlay
devOverlay.toggle();  // Toggle visibility
devOverlay.destroy(); // Remove and clean up
```

## Examples

- `example.html` - Basic swap algorithm
- `example-advanced.html` - Multi-cell items, push algorithm, dev overlay

## Building

```bash
npx tsx gridiot/build.ts
```

Outputs to `gridiot/dist/`:
- `gridiot.js` - Full bundle with all input plugins
- `gridiot-minimal.js` - Pointer plugin only
- `gridiot-core.js` - Core engine only
- `algorithm-push.js` - Push-down layout algorithm
- `dev-overlay.js` - Debug/config overlay
- `placeholder.js` - Drop placeholder indicator

## Browser Support

- Chrome 111+ (View Transitions)
- Safari 18+ (View Transitions)
- Firefox (works without View Transitions, falls back gracefully)
