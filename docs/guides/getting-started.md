# Getting Started with Gridiot

This guide walks you through setting up Gridiot for basic drag-and-drop on a CSS Grid layout.

## Prerequisites

- A CSS Grid container with grid items
- ES modules support (or a bundler)

## Installation

Copy the dist files to your project:

```bash
cp gridiot/dist/gridiot.js your-project/
cp gridiot/dist/algorithm-push.js your-project/  # optional
```

## Basic Setup

### 1. Create Your Grid HTML

```html
<div class="grid" id="my-grid">
  <div class="item" data-gridiot-item style="grid-column: 1; grid-row: 1">A</div>
  <div class="item" data-gridiot-item style="grid-column: 2; grid-row: 1">B</div>
  <div class="item" data-gridiot-item style="grid-column: 3; grid-row: 1">C</div>
  <div class="item" data-gridiot-item style="grid-column: 1; grid-row: 2">D</div>
</div>
```

Key points:
- Add `data-gridiot-item` to each draggable element
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
[data-gridiot-dragging] {
  cursor: grabbing;
  opacity: 0.9;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
```

### 3. Initialize Gridiot

```html
<script type="module">
  import { init } from './gridiot.js';

  const grid = init(document.getElementById('my-grid'));
</script>
```

That's it! You now have drag-and-drop enabled. But items won't move yet—you need to handle the events.

## Handling Drag Events

Gridiot emits events but doesn't move items automatically. You decide what happens:

```javascript
import { init, setItemCell, getItemCell } from './gridiot.js';

const grid = init(document.getElementById('my-grid'));

// Simple: move item to wherever it's dropped
grid.element.addEventListener('gridiot:drag-end', (e) => {
  const { item, cell } = e.detail;
  setItemCell(item, cell);
});
```

### Available Events

| Event | When | Detail |
|-------|------|--------|
| `gridiot:drag-start` | Drag begins | `{ item, cell }` |
| `gridiot:drag-move` | Pointer moves to new cell | `{ item, cell, x, y }` |
| `gridiot:drag-end` | Drop within grid | `{ item, cell }` |
| `gridiot:drag-cancel` | Escape pressed or drop outside | `{ item }` |

## Using the Push Algorithm

For dashboard-style reordering where items push others out of the way:

```javascript
import { init } from './gridiot.js';
import { attachPushAlgorithm } from './algorithm-push.js';

const grid = init(document.getElementById('my-grid'));
attachPushAlgorithm(grid.element);

// That's it! The algorithm handles drag-move and drag-end
```

## Adding Keyboard Support

The full bundle (`gridiot.js`) includes keyboard navigation:

```html
<!-- Make items focusable -->
<div class="item" data-gridiot-item tabindex="0">A</div>
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
  data-gridiot-item
  data-gridiot-label="Revenue Chart"
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
