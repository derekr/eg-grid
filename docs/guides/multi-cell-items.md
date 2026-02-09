# Multi-Cell Items

This guide covers how to work with items that span multiple columns and/or rows.

## Basic Setup

### HTML

Use `data-egg-colspan` and `data-egg-rowspan` attributes:

```html
<div
  data-egg-item
  data-egg-colspan="2"
  data-egg-rowspan="2"
  style="grid-column: 1 / span 2; grid-row: 1 / span 2"
>
  Large Widget
</div>

<div
  data-egg-item
  data-egg-colspan="1"
  data-egg-rowspan="1"
  style="grid-column: 3; grid-row: 1"
>
  Small Widget
</div>
```

### CSS Grid Alignment

Keep inline styles in sync with data attributes:

```javascript
function setItemPosition(item, cell) {
  const colspan = parseInt(item.dataset.eg-gridColspan || '1');
  const rowspan = parseInt(item.dataset.eg-gridRowspan || '1');

  item.style.gridColumn = `${cell.column} / span ${colspan}`;
  item.style.gridRow = `${cell.row} / span ${rowspan}`;
}
```

## Algorithm Considerations

### Reading Dimensions

```javascript
function getItemDimensions(item) {
  return {
    width: parseInt(item.dataset.eg-gridColspan || '1'),
    height: parseInt(item.dataset.eg-gridRowspan || '1'),
  };
}
```

### Collision Detection

Check if two multi-cell items overlap:

```javascript
function itemsOverlap(a, b) {
  // a and b have: column, row, width, height
  const aRight = a.column + a.width;
  const aBottom = a.row + a.height;
  const bRight = b.column + b.width;
  const bBottom = b.row + b.height;

  return !(
    aRight <= b.column ||  // a is left of b
    bRight <= a.column ||  // b is left of a
    aBottom <= b.row ||    // a is above b
    bBottom <= a.row       // b is above a
  );
}
```

### Grid Bounds

Prevent items from exceeding grid boundaries:

```javascript
function clampToGrid(cell, itemWidth, itemHeight, gridColumns) {
  return {
    column: Math.min(cell.column, gridColumns - itemWidth + 1),
    row: Math.max(1, cell.row),
  };
}
```

## Targeting with Card Center

For large items, target based on center point rather than top-left:

```javascript
// In pointer plugin, already implemented
const cardCenterX = itemRect.left + itemRect.width / 2;
const cardCenterY = itemRect.top + itemRect.height / 2;
const cell = getCellFromPoint(cardCenterX, cardCenterY);
```

This feels more natural when dragging multi-cell items.

## Push Algorithm with Multi-Cell

The push algorithm handles multi-cell items automatically:

```javascript
function pushDown(items, movedItem) {
  const colliders = items.filter(item =>
    item !== movedItem && itemsOverlap(movedItem, item)
  );

  for (const collider of colliders) {
    // Push to row below the moved item (considering its height)
    collider.row = movedItem.row + movedItem.height;
    pushDown(items, collider);
  }
}
```

## Visual Feedback

### Placeholder for Multi-Cell Items

```javascript
function showPlaceholder(grid, cell, item) {
  const colspan = parseInt(item.dataset.eg-gridColspan || '1');
  const rowspan = parseInt(item.dataset.eg-gridRowspan || '1');

  placeholder.style.gridColumn = `${cell.column} / span ${colspan}`;
  placeholder.style.gridRow = `${cell.row} / span ${rowspan}`;
}
```

### Dragging Appearance

The item maintains its size while dragging:

```css
[data-egg-dragging] {
  /* Pointer plugin sets width/height to match original size */
  /* via inline styles during drag */
}
```

## Resizing Items

EG Grid focuses on drag-and-drop, not resizing. For resize functionality:

```javascript
// Separate resize handles
item.querySelector('.resize-handle').addEventListener('pointerdown', (e) => {
  e.stopPropagation(); // Prevent eg-grid drag
  startResize(item, e);
});

function onResize(item, newWidth, newHeight) {
  item.dataset.eg-gridColspan = String(newWidth);
  item.dataset.eg-gridRowspan = String(newHeight);
  item.style.gridColumn = `${col} / span ${newWidth}`;
  item.style.gridRow = `${row} / span ${newHeight}`;

  // Recalculate layout (push overlapping items)
  recalculateLayout();
}
```

## Example: Dashboard Layout

```html
<div class="dashboard-grid" id="grid">
  <!-- Large chart: 2x2 -->
  <div
    class="widget"
    data-egg-item
    data-egg-label="Revenue Chart"
    data-egg-colspan="2"
    data-egg-rowspan="2"
    style="grid-column: 1 / span 2; grid-row: 1 / span 2; --item-id: revenue"
    tabindex="0"
  >
    <h3>Revenue</h3>
    <canvas id="revenue-chart"></canvas>
  </div>

  <!-- Metric cards: 1x1 each -->
  <div
    class="widget"
    data-egg-item
    data-egg-label="Total Users"
    style="grid-column: 3; grid-row: 1; --item-id: users"
    tabindex="0"
  >
    <h4>Users</h4>
    <span class="metric">12,345</span>
  </div>

  <div
    class="widget"
    data-egg-item
    data-egg-label="Conversion Rate"
    style="grid-column: 4; grid-row: 1; --item-id: conversion"
    tabindex="0"
  >
    <h4>Conversion</h4>
    <span class="metric">3.2%</span>
  </div>

  <!-- Wide chart: 2x1 -->
  <div
    class="widget"
    data-egg-item
    data-egg-label="Traffic Sources"
    data-egg-colspan="2"
    style="grid-column: 3 / span 2; grid-row: 2; --item-id: traffic"
    tabindex="0"
  >
    <h3>Traffic Sources</h3>
    <canvas id="traffic-chart"></canvas>
  </div>
</div>
```

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 150px;
  gap: 16px;
  padding: 16px;
}

.widget {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  view-transition-name: var(--item-id);
}
```

## Accessibility for Multi-Cell Items

Include size in announcements:

```html
<div
  data-egg-item
  data-egg-label="Revenue Chart (2 columns, 2 rows)"
  data-egg-colspan="2"
  data-egg-rowspan="2"
>
  ...
</div>
```

Or customize the announcement:

```html
<div
  id="grid"
  data-egg-announce-grab="{label} grabbed. Spans multiple cells."
  data-egg-announce-drop="{label} placed at row {row}, column {column}."
>
  ...
</div>
```

## Tips

1. **Keep data attributes in sync** with CSS grid-column/grid-row spans
2. **Use card center targeting** for natural multi-cell dragging
3. **Test collision detection** thoroughly with various sizes
4. **Consider grid boundaries** - don't let items overflow
5. **Provide clear visual feedback** - placeholder should match item size

## Next Steps

- [Custom Algorithms](./custom-algorithms.md) - Handle multi-cell in your layout logic
- [Styling Guide](./styling.md) - Visual feedback for large items
