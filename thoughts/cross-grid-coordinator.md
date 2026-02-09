# Cross-Grid Coordinator Plugin

## Context

EG Grid's core engine currently supports one grid at a time. This document explores how to support dragging items between multiple grids while staying dependency-free and maintaining the plugin architecture.

## Design Principles

1. **Coordinator is thin** - it only detects grid boundaries and routes events
2. **Per-grid algorithms** - each grid can have its own algorithm plugin (push, swap, shift, etc.)
3. **Preview on hover** - when dragging over another grid, show a projection of where the item would land
4. **DOM move on drop** - opinionated default behavior
5. **Explicit registration** - grids must be registered with coordinator (open to auto-detect later)

## When to Use EG Grid vs Pragmatic Drag and Drop

**EG Grid is compelling for:**
- Grid-to-grid of same/similar structure (dashboard rearrangement)
- Zero dependencies matters (embedded widgets, library authors)
- Full control over the layout algorithm
- Simple mental model (CSS Grid + events)

**Reach for Pragmatic DnD when:**
- Dragging between heterogeneous containers (grid → list → tree)
- Complex drop target logic (nested drop zones, conditional acceptance)
- Need their accessibility story out of the box
- Non-grid layouts

**Interop story:** EG Grid's DOM events integrate cleanly with PDD monitors. Users can write a small adapter if they need to bridge the two systems.

## Coordinator API

```typescript
import { init } from 'eg-grid';
import { attachPushAlgorithm } from 'eg-grid/algorithm-push';
import { attachSwapAlgorithm } from 'eg-grid/algorithm-swap';
import { createCoordinator } from 'eg-grid/coordinator';

const grid1 = init(document.getElementById('grid1'));
const grid2 = init(document.getElementById('grid2'));

// Different algorithms per grid
attachPushAlgorithm(grid1.element);
attachSwapAlgorithm(grid2.element);

// Coordinator enables cross-grid dragging
const coordinator = createCoordinator();
coordinator.register(grid1.element);
coordinator.register(grid2.element);
```

## Event Flow

### New Events (emitted by coordinator)

| Event | When | Who handles |
|-------|------|-------------|
| `egg:item-enter` | Foreign item enters grid | Target algorithm |
| `egg:item-move` | Foreign item moves within grid | Target algorithm |
| `egg:item-leave` | Item leaves grid (no drop) | Algorithm resets |
| `egg:item-transferred` | Item dropped on other grid | Source algorithm (cleanup) |
| `egg:item-received` | Item dropped here from other grid | Target algorithm (finalize) |

### Event Details

```typescript
// item-enter, item-leave
interface ItemEnterDetail {
  item: HTMLElement;
  cell: GridCell;
  colspan: number;
  rowspan: number;
  sourceGrid: HTMLElement;
}

// item-move
interface ItemMoveDetail {
  item: HTMLElement;
  cell: GridCell;
  x: number;
  y: number;
}

// item-transferred
interface ItemTransferredDetail {
  item: HTMLElement;
  toGrid: HTMLElement;
}

// item-received
interface ItemReceivedDetail {
  item: HTMLElement;
  cell: GridCell;
  fromGrid: HTMLElement;
}
```

## Coordinator Implementation

```typescript
// eg-grid/plugins/coordinator.ts

export function createCoordinator() {
  const grids = new Set<HTMLElement>();
  let sourceGrid: HTMLElement | null = null;
  let currentGrid: HTMLElement | null = null;
  let draggedItem: HTMLElement | null = null;

  function getGridFromPoint(x: number, y: number): HTMLElement | null {
    for (const grid of grids) {
      const rect = grid.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right &&
          y >= rect.top && y <= rect.bottom) {
        return grid;
      }
    }
    return null;
  }

  function handleDragStart(e: CustomEvent) {
    draggedItem = e.detail.item;
    sourceGrid = e.currentTarget as HTMLElement;
    currentGrid = sourceGrid;
  }

  function handleDragMove(e: CustomEvent) {
    if (!draggedItem) return;

    const { x, y, cell } = e.detail;
    const gridUnderPoint = getGridFromPoint(x, y);

    if (gridUnderPoint !== currentGrid) {
      // Leaving current grid
      currentGrid?.dispatchEvent(new CustomEvent('egg:item-leave', {
        bubbles: true,
        detail: {
          item: draggedItem,
          colspan: parseInt(draggedItem.dataset.eg-gridColspan || '1'),
          rowspan: parseInt(draggedItem.dataset.eg-gridRowspan || '1'),
        }
      }));

      // Entering new grid (or null if outside all grids)
      if (gridUnderPoint) {
        gridUnderPoint.dispatchEvent(new CustomEvent('egg:item-enter', {
          bubbles: true,
          detail: {
            item: draggedItem,
            cell,
            colspan: parseInt(draggedItem.dataset.eg-gridColspan || '1'),
            rowspan: parseInt(draggedItem.dataset.eg-gridRowspan || '1'),
            sourceGrid,
          }
        }));
      }

      currentGrid = gridUnderPoint;
    }

    // Forward move events to current grid if it's not the source
    if (currentGrid && currentGrid !== sourceGrid) {
      currentGrid.dispatchEvent(new CustomEvent('egg:item-move', {
        bubbles: true,
        detail: { item: draggedItem, cell, x, y }
      }));
    }
  }

  function handleDragEnd(e: CustomEvent) {
    if (!draggedItem) return;

    if (currentGrid && currentGrid !== sourceGrid) {
      // Dropped on different grid - transfer
      const { cell } = e.detail;

      // Notify source grid item is gone
      sourceGrid?.dispatchEvent(new CustomEvent('egg:item-transferred', {
        bubbles: true,
        detail: { item: draggedItem, toGrid: currentGrid }
      }));

      // Move DOM and notify target
      currentGrid.appendChild(draggedItem);
      currentGrid.dispatchEvent(new CustomEvent('egg:item-received', {
        bubbles: true,
        detail: { item: draggedItem, cell, fromGrid: sourceGrid }
      }));
    }

    draggedItem = null;
    sourceGrid = null;
    currentGrid = null;
  }

  function handleDragCancel() {
    if (currentGrid && currentGrid !== sourceGrid) {
      currentGrid.dispatchEvent(new CustomEvent('egg:item-leave', {
        bubbles: true,
        detail: { item: draggedItem }
      }));
    }
    draggedItem = null;
    sourceGrid = null;
    currentGrid = null;
  }

  return {
    register(grid: HTMLElement) {
      grids.add(grid);
      grid.addEventListener('egg:drag-start', handleDragStart as EventListener);
      grid.addEventListener('egg:drag-move', handleDragMove as EventListener);
      grid.addEventListener('egg:drag-end', handleDragEnd as EventListener);
      grid.addEventListener('egg:drag-cancel', handleDragCancel);
    },
    unregister(grid: HTMLElement) {
      grids.delete(grid);
      grid.removeEventListener('egg:drag-start', handleDragStart as EventListener);
      grid.removeEventListener('egg:drag-move', handleDragMove as EventListener);
      grid.removeEventListener('egg:drag-end', handleDragEnd as EventListener);
      grid.removeEventListener('egg:drag-cancel', handleDragCancel);
    },
  };
}
```

## Algorithm Plugin Updates

Algorithms need to handle foreign items. Example additions for algorithm-push.ts:

```typescript
let foreignItem: ItemPosition | null = null;

const onItemEnter = (e: CustomEvent) => {
  const { item, cell, colspan, rowspan } = e.detail;

  // Create virtual item for layout calculation
  foreignItem = {
    element: item, // Reference to actual element (still in source grid)
    column: cell.column,
    row: cell.row,
    width: colspan,
    height: rowspan,
  };

  // Store original positions for reset on leave
  storeOriginalPositions();

  // Calculate layout as if this item is being dragged here
  const layout = calculateLayoutWithForeignItem(cell, foreignItem);
  applyLayout(layout, item);
};

const onItemMove = (e: CustomEvent) => {
  if (!foreignItem) return;

  const { cell } = e.detail;
  foreignItem.column = cell.column;
  foreignItem.row = cell.row;

  const layout = calculateLayoutWithForeignItem(cell, foreignItem);
  applyLayout(layout, foreignItem.element);
};

const onItemLeave = () => {
  // Reset layout - item left without dropping
  restoreOriginalPositions();
  foreignItem = null;
};

const onItemReceived = (e: CustomEvent) => {
  // Item was dropped here - finalize position
  const { item, cell } = e.detail;
  item.dataset.eg-gridItem = ''; // Mark as eg-grid item
  setItemCell(item, cell);
  foreignItem = null;
};

// Register these handlers
gridElement.addEventListener('egg:item-enter', onItemEnter);
gridElement.addEventListener('egg:item-move', onItemMove);
gridElement.addEventListener('egg:item-leave', onItemLeave);
gridElement.addEventListener('egg:item-received', onItemReceived);
```

## Simpler API: Cross-Grid as Just Another Plugin

The coordinator concept adds complexity. Instead, cross-grid can just be a plugin that users enable on each grid:

```typescript
// Just another plugin, not a "coordinator"
import { init } from 'eg-grid';
import { enableCrossGrid } from 'eg-grid/plugins/cross-grid';

const grid1 = init(el1);
const grid2 = init(el2);

// Plugin auto-detects other eg-grid instances
enableCrossGrid(grid1);
enableCrossGrid(grid2);
```

The plugin internally manages the coordination without exposing a new concept to users.

## Pragmatic Drag and Drop Integration

### PDD Architecture (for reference)

- `draggable()` - makes elements draggable
- `dropTargetForElements()` - creates drop zones
- `monitorForElements()` - global event listeners
- Data can be attached to drag operations
- No formal plugin system - modular by design (~4.7kB core)

### PDD Animation Philosophy

PDD is intentionally **unopinionated about animations**:
- Uses **static visual indicators** (lines, borders, background colors)
- "A lack of animations helps make the interface feel snappy"
- FLIP/smooth animations are **DIY** - implement yourself using event callbacks
- [Open issue #150](https://github.com/atlassian/pragmatic-drag-and-drop/issues/150) requesting View Transitions support - **no solution yet**

### What Each Provides

```
┌─────────────────────────────────────────────────────────────────┐
│                    Capability Comparison                        │
├────────────────────────────┬────────────────────────────────────┤
│     Pragmatic DnD          │          EG Grid                   │
├────────────────────────────┼────────────────────────────────────┤
│ ✓ Cross-container drag     │ ✗ Grid-to-grid only (for now)     │
│ ✓ External files/text      │ ✗ Not supported                   │
│ ✓ Framework agnostic       │ ✓ Framework agnostic              │
│ ✓ Accessibility (general)  │ ✓ Accessibility (grid-focused)    │
│ ✗ View Transitions         │ ✓ View Transitions built-in       │
│ ✗ CSS Grid awareness       │ ✓ Native CSS Grid integration     │
│ ✗ Smooth reorder animation │ ✓ FLIP + View Transitions         │
│ ~ Drop indicators (lines)  │ ~ Layout algorithms (push/swap)   │
└────────────────────────────┴────────────────────────────────────┘
```

**Key differentiator:** View Transitions support. PDD has an open issue requesting it with no solution. EG Grid provides this out of the box.

### Integration Options

```
┌─────────────────────────────────────────────────────────────────┐
│ Option A: PDD as optional EG Grid enhancement                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  eg-grid (zero-dep)                                             │
│    └── eg-grid/plugins/pdd-bridge.ts (optional, peer dep)       │
│          - Uses PDD for cross-container to non-grid targets     │
│          - EG Grid handles grid-to-grid natively                │
│                                                                 │
│  User imports bridge only if they need PDD interop              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Option B: EG Grid utilities for PDD ecosystem                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  @atlaskit/pragmatic-drag-and-drop (user's choice)              │
│    └── eg-grid-pdd (separate package)                           │
│          - Adds CSS Grid cell detection to PDD                  │
│          - Provides grid-aware drop target utilities            │
│          - Layout algorithms as PDD-compatible functions        │
│                                                                 │
│  eg-grid core remains independent, zero-dep                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Recommendation

**For cross-grid (grid-to-grid):** Keep it as a simple EG Grid plugin. No new concepts, just enable on each grid.

**For grid-to-list/tree (heterogeneous):** That's PDD territory. Users can bridge with ~10 lines:

```typescript
// User writes simple bridge if needed
grid.element.addEventListener('egg:drag-end', (e) => {
  // Check if dropped outside grid, trigger PDD logic
});
```

**Philosophy:** Keep EG Grid focused on CSS Grid. Document the escape hatch to PDD. Don't build PDD adapters unless there's clear demand.

### Interop: PDD Users Who Want View Transitions

PDD users can use EG Grid utilities to add View Transition animations:

```typescript
// PDD user wants View Transition animations for their grid
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { getGridCell, applyWithViewTransition } from 'eg-grid/utilities';

// Use EG Grid's View Transition wrapper with PDD's events
monitorForElements({
  onDrop({ source, location }) {
    const grid = document.getElementById('grid');
    const cell = getGridCell(grid, location.current.input);

    applyWithViewTransition(grid, () => {
      // Your layout logic here
      moveItemToCell(source.element, cell);
    });
  }
});
```

### Bundle Strategy by Use Case

| Use Case | What to Bundle |
|----------|----------------|
| Standalone grid DnD | `eg-grid.js` + algorithm plugin |
| PDD project, want View Transitions | `eg-grid/utilities` (cell detection + VT wrapper) |
| PDD project, want grid accessibility | `eg-grid/accessibility` |
| PDD project, want both | `eg-grid/utilities` + `eg-grid/accessibility` |

This allows PDD users to cherry-pick EG Grid's unique capabilities without pulling in redundant drag handling.

## Open Questions

1. **Auto-detect grids?** - Could query `[data-eg-grid]` instead of explicit registration
2. **Transfer control?** - Should users be able to prevent/customize DOM transfer?
3. **Different cell sizes?** - How to handle grids with different column/row sizes?
4. **Animation on transfer?** - Should FLIP animate across grids?

## Future Considerations

- **Drop zones within grid** - Areas that accept drops but aren't cells
- **Conditional acceptance** - Grid can reject certain items
- **Data model sync** - Hooks for updating app state on transfer

## References

- [Pragmatic Drag and Drop - Core Package](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/)
- [PDD Monitors](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/monitors/)
- [PDD Design Guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines/) - explains their animation philosophy
- [PDD Issue #150 - View Transition API integration](https://github.com/atlassian/pragmatic-drag-and-drop/issues/150) - open request, no solution
- [PDD React Drop Indicator](https://atlassian.design/components/pragmatic-drag-and-drop/optional-packages/react-drop-indicator/)
- [GitHub - atlassian/pragmatic-drag-and-drop](https://github.com/atlassian/pragmatic-drag-and-drop)
