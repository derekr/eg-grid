# Custom Layout Algorithms

Gridiot separates input handling from layout logic. This guide shows how to implement your own layout algorithm.

## How Algorithms Work

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Pointer/Key    │     │    Your Algo    │     │   Grid Items    │
│    Plugin       │────▶│    (events)     │────▶│   (positions)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │ drag-start            │ Save original positions
        │ drag-move             │ Calculate new layout
        │ drag-end              │ Apply final positions
        │ drag-cancel           │ Restore original positions
```

Your algorithm listens to drag events and updates item positions.

## Basic Structure

```typescript
export function attachMyAlgorithm(gridElement: HTMLElement): () => void {
  let draggedItem: HTMLElement | null = null;
  let originalPositions: Map<HTMLElement, { column: number; row: number }> | null = null;

  const onDragStart = (e: CustomEvent) => {
    draggedItem = e.detail.item;

    // Save positions for potential cancel
    originalPositions = new Map();
    gridElement.querySelectorAll('[data-gridiot-item]').forEach((el) => {
      const style = getComputedStyle(el);
      originalPositions.set(el, {
        column: parseInt(style.gridColumnStart) || 1,
        row: parseInt(style.gridRowStart) || 1,
      });
    });
  };

  const onDragMove = (e: CustomEvent) => {
    if (!draggedItem) return;
    const { cell } = e.detail;

    // Your layout logic here
    calculateAndApplyLayout(cell);
  };

  const onDragEnd = (e: CustomEvent) => {
    if (!draggedItem) return;
    const { cell } = e.detail;

    // Finalize layout
    applyFinalLayout(cell);

    draggedItem = null;
    originalPositions = null;
  };

  const onDragCancel = () => {
    if (!originalPositions) return;

    // Restore original positions
    originalPositions.forEach((pos, el) => {
      el.style.gridColumn = String(pos.column);
      el.style.gridRow = String(pos.row);
    });

    draggedItem = null;
    originalPositions = null;
  };

  // Register listeners
  gridElement.addEventListener('gridiot:drag-start', onDragStart);
  gridElement.addEventListener('gridiot:drag-move', onDragMove);
  gridElement.addEventListener('gridiot:drag-end', onDragEnd);
  gridElement.addEventListener('gridiot:drag-cancel', onDragCancel);

  // Return cleanup function
  return () => {
    gridElement.removeEventListener('gridiot:drag-start', onDragStart);
    gridElement.removeEventListener('gridiot:drag-move', onDragMove);
    gridElement.removeEventListener('gridiot:drag-end', onDragEnd);
    gridElement.removeEventListener('gridiot:drag-cancel', onDragCancel);
  };
}
```

## Algorithm Examples

### Swap Algorithm

Exchange positions between dragged item and target:

```typescript
function calculateSwapLayout(draggedItem, targetCell, items) {
  const draggedCell = getItemCell(draggedItem);

  // Find item at target position
  const targetItem = items.find(item => {
    if (item === draggedItem) return false;
    const cell = getItemCell(item);
    return cell.column === targetCell.column && cell.row === targetCell.row;
  });

  // Swap positions
  setItemCell(draggedItem, targetCell);
  if (targetItem) {
    setItemCell(targetItem, draggedCell);
  }
}
```

### Insert Algorithm

Shift items to make room at target position:

```typescript
function calculateInsertLayout(draggedItem, targetCell, items) {
  const sortedItems = [...items]
    .filter(item => item !== draggedItem)
    .sort((a, b) => {
      const cellA = getItemCell(a);
      const cellB = getItemCell(b);
      return cellA.row - cellB.row || cellA.column - cellB.column;
    });

  // Find insertion index
  const targetIndex = sortedItems.findIndex(item => {
    const cell = getItemCell(item);
    return cell.row > targetCell.row ||
      (cell.row === targetCell.row && cell.column >= targetCell.column);
  });

  // Reorder items
  const draggedIndex = sortedItems.indexOf(draggedItem);
  sortedItems.splice(draggedIndex, 1);
  sortedItems.splice(targetIndex, 0, draggedItem);

  // Apply new positions in grid order
  let col = 1, row = 1;
  const columns = 4; // Your grid column count

  sortedItems.forEach(item => {
    setItemCell(item, { column: col, row });
    col++;
    if (col > columns) {
      col = 1;
      row++;
    }
  });
}
```

### Push-Down Algorithm

The built-in push algorithm pushes items down on collision and compacts up:

```typescript
function pushDown(items, movedItem) {
  const colliders = items.filter(item =>
    item !== movedItem && itemsOverlap(movedItem, item)
  );

  for (const collider of colliders) {
    // Push collider below the moved item
    collider.row = movedItem.row + movedItem.height;
    // Recursively push items this collider now overlaps
    pushDown(items, collider);
  }
}

function compactUp(items, exclude) {
  const sorted = [...items]
    .filter(item => item !== exclude)
    .sort((a, b) => a.row - b.row);

  for (const item of sorted) {
    // Try moving up until collision
    while (item.row > 1) {
      item.row--;
      if (items.some(other => other !== item && itemsOverlap(item, other))) {
        item.row++;
        break;
      }
    }
  }
}
```

## Using View Transitions

Wrap layout changes in View Transitions for smooth animations:

```typescript
function applyLayout(items, exclude) {
  const applyChanges = () => {
    items.forEach(item => {
      if (item.element !== exclude) {
        item.element.style.gridColumn = String(item.column);
        item.element.style.gridRow = String(item.row);
      }
    });
  };

  if ('startViewTransition' in document) {
    // Exclude dragged item from transition (it follows cursor)
    exclude.style.viewTransitionName = 'dragging';
    document.startViewTransition(applyChanges);
  } else {
    applyChanges();
  }
}
```

Required CSS:

```css
/* Each item needs a unique view-transition-name */
.item {
  view-transition-name: var(--item-id);
}

/* Suppress animation for the dragged item */
::view-transition-old(dragging),
::view-transition-new(dragging),
::view-transition-group(dragging) {
  animation: none;
}

/* Animate position changes */
::view-transition-group(*) {
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

/* Disable crossfade (prevents ghosting) */
::view-transition-old(*) {
  animation: none;
  opacity: 0;
}

::view-transition-new(*) {
  animation: none;
}
```

## Handling Multi-Cell Items

For items that span multiple columns/rows:

```typescript
function getItemDimensions(item: HTMLElement) {
  return {
    colspan: parseInt(item.dataset.gridiotColspan || '1'),
    rowspan: parseInt(item.dataset.gridiotRowspan || '1'),
  };
}

function itemsOverlap(a, b) {
  return !(
    a.column + a.width <= b.column ||
    b.column + b.width <= a.column ||
    a.row + a.height <= b.row ||
    b.row + b.height <= a.row
  );
}
```

HTML:

```html
<div
  data-gridiot-item
  data-gridiot-colspan="2"
  data-gridiot-rowspan="2"
  style="grid-column: 1 / span 2; grid-row: 1 / span 2"
>
  Large Item
</div>
```

## Tips

1. **Save state on drag-start** - Always capture original positions for cancel
2. **Exclude dragged item** - Don't reposition the item being dragged (pointer handles it)
3. **Use View Transitions** - For smooth animations during drag-move
4. **Apply synchronously on drag-end** - The pointer's FLIP animation expects immediate DOM updates
5. **Debounce if needed** - Hysteresis is handled by the pointer plugin, but complex algorithms might need additional debouncing

## Next Steps

- [View Transitions Guide](./view-transitions.md) - Deep dive on animations
- [Styling Guide](./styling.md) - Visual feedback during drag
