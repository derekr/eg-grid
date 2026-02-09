# Getting Started with EG Grid

This guide walks you through setting up EG Grid for basic drag-and-drop on a CSS Grid layout.

## Prerequisites

- A CSS Grid container with grid items
- ES modules support (or a bundler)

## Installation

Copy the dist files to your project:

```bash
cp eg-grid/dist/eg-grid.js your-project/
cp eg-grid/dist/algorithm-push.js your-project/  # optional
```

## Basic Setup

### 1. Create Your Grid HTML

```html
<div class="grid" id="my-grid">
  <div class="item" data-egg-item style="grid-column: 1; grid-row: 1">A</div>
  <div class="item" data-egg-item style="grid-column: 2; grid-row: 1">B</div>
  <div class="item" data-egg-item style="grid-column: 3; grid-row: 1">C</div>
  <div class="item" data-egg-item style="grid-column: 1; grid-row: 2">D</div>
</div>
```

Key points:
- Add `data-egg-item` to each draggable element
- Set initial positions with `grid-column` and `grid-row`
- Items must be direct children of the grid container

### 2. Add Basic Styles

```css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 120px);
  grid-auto-rows: 120px;
  gap: 8px;
}

.item {
  background: #f0f0f0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
}

/* Style while dragging */
[data-egg-dragging] {
  cursor: grabbing;
  opacity: 0.9;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
```

### 3. Initialize EG Grid

```html
<script type="module">
  import { init } from './eg-grid.js';

  const grid = init(document.getElementById('my-grid'));
</script>
```

That's it! You now have drag-and-drop enabled. But items won't move yet—you need to handle the events.

## Handling Drag Events

EG Grid emits events but doesn't move items automatically. You decide what happens:

```javascript
import { init } from './eg-grid.js';

const grid = init(document.getElementById('my-grid'));

// The push algorithm is included by default and handles drag events.
// For a custom handler without the built-in algorithm:
const grid = init(document.getElementById('my-grid'), { algorithm: false });
grid.element.addEventListener('egg:drag-end', (e) => {
  const { item, cell } = e.detail;
  item.style.gridColumn = String(cell.column);
  item.style.gridRow = String(cell.row);
});
```

### Available Events

| Event | When | Detail |
|-------|------|--------|
| `egg:drag-start` | Drag begins | `{ item, cell }` |
| `egg:drag-move` | Pointer moves to new cell | `{ item, cell, x, y }` |
| `egg:drag-end` | Drop within grid | `{ item, cell }` |
| `egg:drag-cancel` | Escape pressed or drop outside | `{ item }` |

## Using the Push Algorithm

For dashboard-style reordering where items push others out of the way:

```javascript
import { init } from './eg-grid.js';
import { attachPushAlgorithm } from './algorithm-push.js';

const grid = init(document.getElementById('my-grid'));
attachPushAlgorithm(grid.element);

// That's it! The algorithm handles drag-move and drag-end
```

## Adding Keyboard Support

The full bundle (`eg-grid.js`) includes keyboard navigation:

```html
<!-- Make items focusable -->
<div class="item" data-egg-item tabindex="0">A</div>
```

Controls:
- **Tab**: Focus items
- **Enter/Space**: Pick up focused item
- **Arrow keys**: Move held item
- **Escape**: Cancel drag

## Adding Accessibility

The full bundle announces actions to screen readers. Add labels for better announcements:

```html
<div
  class="item"
  data-egg-item
  data-egg-label="Revenue Chart"
  tabindex="0"
>
  ...
</div>
```

## Next Steps

- [Custom Algorithms](./custom-algorithms.md) - Build your own layout logic
- [Styling Guide](./styling.md) - Customize drag appearance
- [View Transitions](./view-transitions.md) - Add smooth animations
- [Accessibility](./accessibility.md) - Screen reader customization
