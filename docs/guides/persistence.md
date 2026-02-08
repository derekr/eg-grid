# Persisting Layout State

Gridiot computes layout in the browser but doesn't prescribe how you store it. This guide covers persistence strategies for both built-in algorithms, and how to choose between them.

## Two models, two mental models

The push and reorder algorithms have fundamentally different sources of truth:

| | Push | Reorder |
|---|---|---|
| **Source of truth** | Positions (`{column, row}` per item) | Sequence (item order) |
| **What a drag changes** | One item's position; others shift | One item's index in the sequence |
| **Responsive behavior** | Positions stored per breakpoint | Same order, different column count = different positions |
| **What to persist** | Positions per column count | Order + item sizes |
| **Derived from stored state** | Nothing (positions are canonical) | Positions (via `reflowItems`) |

### Push: persist positions

Each item has an explicit `{column, row}` at each breakpoint. Moving an item changes its position and may cascade changes to other items.

```
Stored state:
  breakpoint 6-col: { "item-a": {col:1, row:1}, "item-b": {col:3, row:1}, ... }
  breakpoint 4-col: { "item-a": {col:1, row:1}, "item-b": {col:3, row:1}, ... }
  breakpoint 2-col: { "item-a": {col:1, row:1}, "item-b": {col:1, row:2}, ... }

On drag-end → save all positions for the current column count
```

The `ResponsiveLayoutModel` already implements this: canonical positions at `maxColumns`, optional overrides at other column counts, auto-derivation for everything else.

### Reorder: persist order

Items have a logical sequence. Positions are derived by reflowing items into the grid at the current column count. The same order produces different positions at different breakpoints automatically.

```
Stored state:
  order: ["item-a", "item-c", "item-d", "item-b", "item-e", ...]
  sizes: { "item-a": {w:2, h:1}, "item-b": {w:1, h:1}, ... }

On drag-end → save new order
On resize-end → save new order + updated size
At any column count → reflowItems(orderedItems, columnCount) → positions
```

This is simpler: one list of IDs, no per-breakpoint data. Responsive layout is free.

## Representing order

### Array index (simple)

Store items as an ordered array. Reordering means splicing.

```typescript
// State
const order = ["item-a", "item-b", "item-c", "item-d"];

// User drags item-c to position 1
order.splice(2, 1);       // remove from index 2
order.splice(1, 0, "item-c"); // insert at index 1
// → ["item-a", "item-c", "item-b", "item-d"]

// Save: PUT /api/layout { order: ["item-a", "item-c", "item-b", "item-d"] }
```

**Tradeoffs:** Simple to understand. Every reorder requires saving the full list. Fine for localStorage, fine for small lists, but every save touches every item's implicit position.

### Sort key (column-friendly)

Store a numeric `sort_order` column on each item. Reordering updates one or a few rows.

```sql
-- Items table
id        | sort_order | width | height
item-a    | 100        | 2     | 1
item-b    | 200        | 1     | 1
item-c    | 300        | 1     | 1
item-d    | 400        | 1     | 2
```

```typescript
// User drags item-c between item-a and item-b
// New sort_order = midpoint of neighbors
const newOrder = (100 + 200) / 2; // 150

await db.update("items", { id: "item-c", sort_order: 150 });
// Only 1 row updated
```

**Tradeoffs:** O(1) updates in the common case. Occasional renumbering needed when midpoints exhaust precision (after many inserts between the same neighbors). Integer sort keys exhaust faster than floats.

### Fractional indexing (robust)

Use string-based fractional indices for arbitrary-precision ordering without renumbering. Libraries like [fractional-indexing](https://github.com/rocicorp/fractional-indexing) generate keys that sort lexicographically.

```typescript
import { generateKeyBetween } from "fractional-indexing";

// Initial keys
// item-a: "a0", item-b: "a1", item-c: "a2", item-d: "a3"

// Drag item-c between item-a and item-b
const newKey = generateKeyBetween("a0", "a1"); // → "a0V"

await db.update("items", { id: "item-c", order_key: "a0V" });
// 1 row, no renumbering ever needed
```

**Tradeoffs:** Best for real-time collaboration and frequent reordering. String keys grow slowly over time but never need bulk renumbering. Well-suited for CRDTs.

## Integration patterns

### localStorage (client-only)

Simplest option. Good for prototypes and single-user apps.

```typescript
import { attachReorderAlgorithm, reflowItems, getItemOrder } from "gridiot";
import { readItemsFromDOM } from "gridiot/algorithm-push";

// Load
const saved = JSON.parse(localStorage.getItem("grid-order") || "null");

// Apply saved order on init (before first render, or re-render items in order)
if (saved) {
  applyOrder(saved.order, saved.sizes);
}

// Save on drag-end
gridElement.addEventListener("gridiot:drag-end", () => {
  // Read current layout, extract order
  const items = readItemsFromDOM(gridElement);
  const ordered = getItemOrder(items);

  localStorage.setItem("grid-order", JSON.stringify({
    order: ordered.map(it => it.id),
    sizes: Object.fromEntries(ordered.map(it => [it.id, { w: it.width, h: it.height }])),
  }));
});
```

### Backend API (multi-user)

Save order to your API. The key insight: you only need to send the changed item's new position in the sequence, not the full layout.

```typescript
gridElement.addEventListener("gridiot:drag-end", async (e) => {
  const items = readItemsFromDOM(gridElement);
  const ordered = getItemOrder(items);
  const movedId = e.detail.item.dataset.id;
  const newIndex = ordered.findIndex(it => it.id === movedId);

  // Option A: send full order
  await fetch("/api/layout", {
    method: "PUT",
    body: JSON.stringify({ order: ordered.map(it => it.id) }),
  });

  // Option B: send just the move (backend computes new sort key)
  await fetch(`/api/items/${movedId}/reorder`, {
    method: "PATCH",
    body: JSON.stringify({
      afterId: newIndex > 0 ? ordered[newIndex - 1].id : null,
      beforeId: newIndex < ordered.length - 1 ? ordered[newIndex + 1].id : null,
    }),
  });
});
```

### With ResponsiveLayoutModel (push algorithm)

The existing `ResponsiveLayoutModel` is designed for push-style persistence. It stores positions per column count and generates container query CSS.

```typescript
import { createLayoutModel } from "gridiot";
import { attachPushAlgorithm } from "gridiot/algorithm-push";
import { attachResponsive } from "gridiot/responsive";

const layoutModel = createLayoutModel({
  maxColumns: 6,
  items: [/* ... */],
  canonicalPositions: loadFromDB(), // Map<string, {column, row}>
});

attachPushAlgorithm(gridElement, { core, layoutModel });
attachResponsive(gridElement, { layoutModel, cellSize: 120, gap: 8 }, core);

// layoutModel.subscribe() fires when positions change
layoutModel.subscribe(() => {
  saveToDB(layoutModel); // serialize positions + overrides
});
```

This does not apply to the reorder algorithm. Reorder derives positions from order, so storing positions per breakpoint is redundant.

## Restoring layout from persisted state

### Push: set positions directly

Positions map 1:1 to CSS grid placement. Restore by injecting CSS or setting inline styles.

```typescript
// From DB: { "item-a": {column: 1, row: 1}, "item-b": {column: 3, row: 1}, ... }
const positions = await loadPositions(currentColumnCount);

for (const [id, pos] of positions) {
  const el = document.getElementById(id);
  const colspan = parseInt(el.dataset.gridiotColspan || "1");
  const rowspan = parseInt(el.dataset.gridiotRowspan || "1");
  el.style.gridColumn = `${pos.column} / span ${colspan}`;
  el.style.gridRow = `${pos.row} / span ${rowspan}`;
}
```

### Reorder: reflow from order

Reconstruct positions by reflowing the saved order at the current column count.

```typescript
import { reflowItems } from "gridiot/algorithm-reorder";

// From DB: ["item-a", "item-c", "item-b", ...]
const order = await loadOrder();
const sizes = await loadSizes(); // { "item-a": {w:2, h:1}, ... }

// Build ItemRect array in saved order
const columns = getCurrentColumnCount();
const items = order.map(id => ({
  id,
  column: 1, row: 1, // placeholder, reflow will compute
  width: sizes[id].w,
  height: sizes[id].h,
}));

// Reflow computes positions
const layout = reflowItems(items, columns);

// Apply
for (const item of layout) {
  const el = document.getElementById(item.id);
  el.style.gridColumn = `${item.column} / span ${item.width}`;
  el.style.gridRow = `${item.row} / span ${item.height}`;
}
```

## Choosing an algorithm for your use case

| Use case | Algorithm | Why |
|---|---|---|
| Dashboard with fixed widget positions | Push | Users place widgets at specific grid cells |
| Kanban board, photo gallery, app launcher | Reorder | Items have inherent order, positions are derived |
| Mixed (some pinned, some flowing) | Push | Pin important items, let push handle collisions |
| Real-time collaboration | Reorder + fractional indexing | Order is a single sortable field, minimal conflicts |
| Server-rendered layouts with per-breakpoint control | Push + `ResponsiveLayoutModel` | Full control over every breakpoint |
| Dynamic item counts (add/remove items frequently) | Reorder | Adding an item = appending to order; reflow handles the rest |
