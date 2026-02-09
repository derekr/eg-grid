# Drag Grid Architecture

A zero-dependency, composable drag-and-drop library for CSS Grid layouts with View Transitions animations.

## Design Principles

1. **Items encode positioning** - Grid items own their `grid-column`/`grid-row` values
2. **Algorithm agnostic** - Core doesn't know about swap, insert, reorder, etc.
3. **Composable plugins** - Users pick only what they need
4. **Zero dependencies** - Core uses only native APIs
5. **Framework agnostic** - Works with vanilla JS, React, Datastar, etc.

## Core Responsibilities (~50-100 lines)

The core does exactly three things:

1. **Grid cell calculation** - Convert pointer coordinates to grid cell `{column, row}`
2. **FLIP animations** - Animate items smoothly when positions change via View Transitions API
3. **Change detection** - MutationObserver watches for position changes on items

```js
// Core API
class DragGridCore {
  constructor(element, options) {
    this.element = element
    this.plugins = options.plugins || []
    this.#observeChanges()
    this.#initPlugins()
  }

  // Convert point to grid cell
  getCellFromPoint(x, y) {
    // Calculate based on grid template + gaps
    return { column, row }
  }

  // Called by plugins when drag state changes
  emit(event, detail) {
    this.element.dispatchEvent(new CustomEvent(`drag-grid:${event}`, { detail }))
  }

  // Animate any position changes
  #observeChanges() {
    const observer = new MutationObserver((mutations) => {
      // Detect grid-column/grid-row changes
      // Trigger View Transition FLIP animation
    })
    observer.observe(this.element, {
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    })
  }
}
```

## Plugin Architecture

Inspired by [Datastar](https://github.com/starfederation/datastar), plugins self-register via side-effect imports. This enables tree-shaking and custom bundle composition.

### Auto-Init with Options

Plugins register themselves when imported and receive configuration through `init()`:

```ts
// Simple usage - all plugins with defaults
const grid = init(document.querySelector('.grid'));

// With responsive layout model
const grid = init(document.querySelector('.grid'), {
  layoutModel,
  styleElement,
});

// With plugin-specific options
const grid = init(document.querySelector('.grid'), {
  layoutModel,
  styleElement,
  plugins: {
    camera: { mode: 'center', edgeSize: 80 },
    resize: { handles: 'corners', minSize: { colspan: 1, rowspan: 1 } },
  },
});

// Disable specific plugins
const grid = init(document.querySelector('.grid'), {
  disablePlugins: ['camera', 'resize'],
});
```

### Plugin Interface

```ts
interface Plugin<T = unknown> {
  name: string;
  init(core: EggCore, options?: T): (() => void) | void;
}
```

Plugins receive:
- `core`: The EggCore instance with element, event emission, cell calculation
- `options`: Plugin-specific options merged with shared resources (layoutModel, styleElement)

### Self-Registering Plugins

Plugins register themselves at module load time:

```ts
// plugins/camera.ts
import { registerPlugin } from '../engine';

export function attachCamera(element, options) {
  // Implementation...
  return { setMode, scrollTo, destroy };
}

// Auto-register for init()
registerPlugin({
  name: 'camera',
  init(core, options) {
    const instance = attachCamera(core.element, {
      ...options,
      core: options?.core ?? core,
    });
    return () => instance.destroy();
  },
});
```

The `attach*` functions remain available for manual usage when more control is needed.

### Bundle Composition

Bundles are just different import combinations:

```js
// Side-effect imports register plugins
import '../plugins/keyboard';
import '../plugins/pointer';
import '../plugins/pointer';
import '../plugins/scroll';

// bundles/drag-grid-core.ts - Engine only, no plugins
export { init, core, registerPlugin } from './engine';

// bundles/drag-grid.ts - Full bundle with all plugins
export { init, core, registerPlugin } from './engine';

// bundles/drag-grid-minimal.ts - Just pointer
export { init, core, registerPlugin } from './engine';
```

### Custom Bundles

Users can create their own bundles:

```js
// my-custom-bundle.ts
import { core, init } from 'drag-grid/core';
import 'drag-grid/plugins/keyboard';
// Pick only what you need
import 'drag-grid/plugins/pointer';

// Add your own plugins
import './my-custom-plugin';

export { init, core };
```

### Plugin Interface

```ts
interface Plugin {
	name: string;
	init(): (() => void) | void; // Optional cleanup function
}
```

Plugins can:

- Add event listeners to `core.element`
- Call `core.emit(event, detail)` to dispatch events
- Use `core.getCellFromPoint(x, y)` for grid math
- Listen to other plugins' events via `core.element.addEventListener('drag-grid:*')`

## Available Plugins

| Plugin    | Import                                  | Description                          | Size      |
| --------- | --------------------------------------- | ------------------------------------ | --------- |
| pointer   | `import 'drag-grid/plugins/pointer'`    | Pointer events drag detection        | ~30 lines |
| keyboard  | `import 'drag-grid/plugins/keyboard'`   | Arrow keys, Enter/Space pick up/drop | ~50 lines |
| scroll    | `import 'drag-grid/plugins/scroll'`     | Auto-scroll near edges during drag   | ~30 lines |
| debug     | `import 'drag-grid/plugins/debug'`      | Visual overlay showing grid cells    | ~50 lines |
| pragmatic | `import 'drag-grid/adapters/pragmatic'` | Pragmatic DnD adapter                | ~20 lines |

### Keyboard Plugin

Arrow key navigation with Enter/Space to pick up/drop.

```js
// plugins/keyboard.ts
import { core, registerPlugin } from 'drag-grid/engine';

registerPlugin({
	name: 'keyboard',
	init() {
		let heldItem = null;

		const onKeyDown = (e) => {
			const focused = document.activeElement;
			if (!core.element.contains(focused)) return;

			const item = focused.closest('[data-drag-item]');
			if (!item) return;

			// Pick up / drop
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				if (heldItem) {
					core.emit('drag-end', {
						item: heldItem,
						cell: getCurrentCell(heldItem),
					});
					heldItem = null;
				} else {
					heldItem = item;
					core.emit('drag-start', { item });
				}
				return;
			}

			// Cancel
			if (e.key === 'Escape' && heldItem) {
				core.emit('drag-cancel', { item: heldItem });
				heldItem = null;
				return;
			}

			// Move
			if (
				heldItem &&
				['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
			) {
				e.preventDefault();
				const cell = getAdjacentCell(heldItem, e.key);
				core.emit('drag-move', { item: heldItem, cell });
			}
		};

		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	},
});
```

### Scroll Plugin

Auto-scroll when dragging near container edges. Listens to events from other plugins.

```js
// plugins/scroll.ts
import { core, registerPlugin } from 'drag-grid/engine';

const THRESHOLD = 50;
const SPEED = 10;

registerPlugin({
	name: 'scroll',
	init() {
		let scrollInterval = null;

		core.element.addEventListener('drag-grid:drag-move', (e) => {
			const { x, y } = e.detail;
			const rect = core.element.getBoundingClientRect();

			const scrollX =
				x < rect.left + THRESHOLD ? -1 : x > rect.right - THRESHOLD ? 1 : 0;
			const scrollY =
				y < rect.top + THRESHOLD ? -1 : y > rect.bottom - THRESHOLD ? 1 : 0;

			if (scrollX || scrollY) {
				if (!scrollInterval) {
					scrollInterval = setInterval(() => {
						core.element.scrollBy(scrollX * SPEED, scrollY * SPEED);
					}, 16);
				}
			} else {
				clearInterval(scrollInterval);
				scrollInterval = null;
			}
		});

		core.element.addEventListener('drag-grid:drag-end', () => {
			clearInterval(scrollInterval);
			scrollInterval = null;
		});
	},
});
```

## Usage Examples

### Vanilla JS - Client-side Algorithm

```js
// Import core + plugins (side-effect imports register them)
import { init } from 'drag-grid/core';
import 'drag-grid/plugins/keyboard';
import 'drag-grid/plugins/pointer';

import { swap } from './algorithms/swap';

// Initialize on a grid element
const grid = init(document.querySelector('.grid'));

grid.element.addEventListener('drag-grid:drag-move', (e) => {
	const { item, cell } = e.detail;
	const positions = swap(getCurrentPositions(), item, cell);
	applyPositions(positions); // Update grid-column/grid-row on items
	// Core automatically animates via View Transitions
});

grid.element.addEventListener('drag-grid:drag-end', (e) => {
	// Persist to backend
	savePositions(getCurrentPositions());
});
```

### Vanilla JS - Different Algorithms

```js
import { insert, reorder, swap } from './algorithms';

// User chooses algorithm
const algorithm = getUserPreference(); // 'swap' | 'insert' | 'reorder'

const algorithms = { swap, insert, reorder };

grid.element.addEventListener('drag-grid:drag-move', (e) => {
	const { item, cell } = e.detail;
	const positions = algorithms[algorithm](getCurrentPositions(), item, cell);
	applyPositions(positions);
});
```

### React Integration

```tsx
// Create a custom bundle for your app
// lib/drag-grid.ts
import { init } from 'drag-grid/core'
import 'drag-grid/plugins/pointer'
import 'drag-grid/plugins/keyboard'
export { init }

// components/Dashboard.tsx
import { init } from '../lib/drag-grid'
import { useEffect, useRef, useState } from 'react'

function Dashboard({ initialItems }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState(initialItems)

  useEffect(() => {
    const grid = init(gridRef.current)

    const handleMove = (e) => {
      const { item, cell } = e.detail
      setItems((prev) => swapAlgorithm(prev, item.dataset.id, cell))
    }

    const handleEnd = () => {
      saveToBackend(items)
    }

    gridRef.current.addEventListener('drag-grid:drag-move', handleMove)
    gridRef.current.addEventListener('drag-grid:drag-end', handleEnd)

    return () => grid.destroy()
  }, [])

  return (
    <div ref={gridRef} className="grid">
      {items.map((item) => (
        <div
          key={item.id}
          data-drag-item
          data-id={item.id}
          style={{ gridColumn: item.column, gridRow: item.row }}
        >
          {item.content}
        </div>
      ))}
    </div>
  )
}
```

### Datastar / Backend-Driven

For backend-driven frameworks, the frontend only handles drag detection. The backend computes new positions and sends updated HTML.

```html
<!-- Items have data-* attributes for Datastar -->
<div
	class="grid"
	data-on-drag-grid:drag-end="$$post('/api/reorder', { itemId: $event.detail.item.dataset.id, cell: $event.detail.cell })"
>
	<div data-drag-item data-id="1" style="grid-column: 1; grid-row: 1">A</div>
	<div data-drag-item data-id="2" style="grid-column: 2; grid-row: 1">B</div>
</div>

<script type="module">
	// Minimal bundle - just pointer, no keyboard
	import { init } from 'drag-grid/core';
	import 'drag-grid/plugins/pointer';

	init(document.querySelector('.grid'));

	// Datastar handles the rest:
	// 1. POST to /api/reorder with item + target cell
	// 2. Backend computes new positions (using whatever algorithm)
	// 3. Backend returns updated HTML
	// 4. Datastar morphs the DOM
	// 5. Core's MutationObserver sees changes, animates via View Transitions
</script>
```

Backend (Node/Python/Go/etc):

```python
@app.post('/api/reorder')
def reorder(item_id: str, cell: dict):
    positions = get_positions_from_db()
    new_positions = swap_algorithm(positions, item_id, cell)  # Or any algorithm
    save_positions(new_positions)
    return render_grid_html(new_positions)  # Datastar morphs this in
```

The beauty: Core doesn't care. It just sees positions change and animates.

### Live Preview During Drag (Optimistic)

For smoother UX, run a simple algorithm client-side during drag, but let backend be authoritative on drop:

```html
<script type="module">
	import { init } from 'drag-grid/core';
	import 'drag-grid/plugins/pointer';

	import { simpleSwap } from './algorithms';

	const grid = init(document.querySelector('.grid'));
	let originalPositions = null;

	grid.element.addEventListener('drag-grid:drag-start', () => {
		originalPositions = capturePositions(); // Save for rollback
	});

	grid.element.addEventListener('drag-grid:drag-move', (e) => {
		// Optimistic preview with simple client-side algorithm
		const preview = simpleSwap(originalPositions, e.detail.item, e.detail.cell);
		applyPositions(preview);
	});

	grid.element.addEventListener('drag-grid:drag-end', async (e) => {
		// Let backend compute authoritative positions
		const result = await fetch('/api/reorder', {
			method: 'POST',
			body: JSON.stringify({
				itemId: e.detail.item.dataset.id,
				cell: e.detail.cell,
			}),
		});
		const finalPositions = await result.json();
		applyPositions(finalPositions); // May differ from preview - core animates the correction
	});
</script>
```

## Algorithm Interface

Algorithms are simple pure functions. Core doesn't care about them - they're user-provided.

```ts
type Position = {
	id: string;
	column: number;
	row: number;
	colSpan?: number;
	rowSpan?: number;
};
type Cell = { column: number; row: number };

type Algorithm = (
	positions: Position[],
	draggedItemId: string,
	targetCell: Cell,
) => Position[];
```

Example algorithms:

```js
// Swap: Exchange positions of two items
function swap(positions, draggedId, targetCell) {
	const dragged = positions.find((p) => p.id === draggedId);
	const target = positions.find(
		(p) => p.column === targetCell.column && p.row === targetCell.row,
	);

	if (target) {
		return positions.map((p) => {
			if (p.id === draggedId)
				return { ...p, column: targetCell.column, row: targetCell.row };
			if (p.id === target.id)
				return { ...p, column: dragged.column, row: dragged.row };
			return p;
		});
	}
	return positions;
}

// Insert: Shift items to make room
function insert(positions, draggedId, targetCell) {
	// Implementation
}

// Free placement: Just move dragged item, no effect on others
function freePlace(positions, draggedId, targetCell) {
	return positions.map((p) =>
		p.id === draggedId
			? { ...p, column: targetCell.column, row: targetCell.row }
			: p,
	);
}
```

## Pre-built Bundles

For convenience, pre-built bundles with common plugin combinations:

```js
// Option 1: Full bundle (~5KB) - includes pointer, keyboard, scroll
import { init } from 'drag-grid'

// Option 2: Minimal bundle (~2KB) - just pointer
import { init } from 'drag-grid/minimal'

// Option 3: Core only (~1KB) - no plugins, bring your own
import { init } from 'drag-grid/core'
```

Bundle source files:

```js
import '../plugins/keyboard';
import '../plugins/pointer';
import '../plugins/pointer';
import '../plugins/scroll';

// bundles/drag-grid.ts (full)
export { init, registerPlugin } from '../engine';

// bundles/drag-grid-minimal.ts
export { init, registerPlugin } from '../engine';

// bundles/drag-grid-core.ts
export { init, registerPlugin } from '../engine';
// No plugins - user imports what they need
```

## Web Component (Optional)

A thin web component wrapper for HTML-first usage:

```html
<script type="module">
	// Import registers <drag-grid> custom element
	import 'drag-grid/element';
	import 'drag-grid/plugins/keyboard';
	import 'drag-grid/plugins/pointer';
</script>

<drag-grid>
	<div data-drag-item style="grid-column: 1; grid-row: 1">A</div>
	<div data-drag-item style="grid-column: 2; grid-row: 1">B</div>
</drag-grid>

<script>
	document
		.querySelector('drag-grid')
		.addEventListener('drag-grid:drag-end', (e) => {
			// Handle drop
		});
</script>
```

The web component automatically initializes and uses whatever plugins have been registered.

## Summary

| Layer           | Responsibility                          | Size       |
| --------------- | --------------------------------------- | ---------- |
| Core/Engine     | Grid math, animations, change detection | ~100 lines |
| pointer plugin  | Pointer event handling                  | ~30 lines  |
| keyboard plugin | Keyboard navigation                     | ~50 lines  |
| scroll plugin   | Auto-scroll during drag                 | ~30 lines  |
| debug plugin    | Visual debugging overlay                | ~50 lines  |
| Algorithms      | User-provided, not part of library      | -          |

**Architecture inspired by [Datastar](https://github.com/starfederation/datastar):**

- Plugins self-register via side-effect imports
- Bundles are just different import combinations
- Users can create custom bundles with exactly what they need
- Tree-shaking removes unused plugins

Core is algorithm-agnostic. It just:

1. Emits drag events with grid coordinates
2. Animates when positions change

Everything else is composition.
