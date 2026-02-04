# Grid Placement Patterns

Common CSS Grid placement patterns used in Gridiot.

---

## Single-Cell Item

```css
.item {
  grid-column: 2;      /* Column 2 */
  grid-row: 1;         /* Row 1 */
}
```

Equivalent to:
```css
.item {
  grid-column: 2 / span 1;
  grid-row: 1 / span 1;
}
```

---

## Multi-Cell Item (colspan/rowspan)

```css
/* 2 columns wide, 1 row tall */
.item {
  grid-column: 1 / span 2;
  grid-row: 1;
}

/* 2 columns wide, 3 rows tall */
.item {
  grid-column: 1 / span 2;
  grid-row: 1 / span 3;
}
```

---

## Edge Clamping

Prevent items from extending past grid bounds:

```typescript
// For a 6-column grid, a 2-wide item can start at columns 1-5
const maxColumn = gridColumns - colspan + 1;
const clampedColumn = Math.min(column, maxColumn);
```

---

## Computing Cell from Pointer Position

```typescript
function getCellFromPoint(x: number, y: number, gridInfo: GridInfo): GridCell {
  const { rect, cellWidth, cellHeight, gap } = gridInfo;

  // Relative position within grid
  const relX = x - rect.left;
  const relY = y - rect.top;

  // Cell index (1-based)
  const cellPlusGap = cellWidth + gap;
  const rowPlusGap = cellHeight + gap;

  const column = Math.floor(relX / cellPlusGap) + 1;
  const row = Math.floor(relY / rowPlusGap) + 1;

  return {
    column: Math.max(1, Math.min(column, gridInfo.columns)),
    row: Math.max(1, row)
  };
}
```

---

## Reading Grid Info from DOM

```typescript
function getGridInfo(gridElement: HTMLElement): GridInfo {
  const rect = gridElement.getBoundingClientRect();
  const style = getComputedStyle(gridElement);

  // Parse track sizes (space-separated pixel values)
  const columns = style.gridTemplateColumns
    .split(' ')
    .filter(Boolean)
    .map(v => parseFloat(v));

  const rows = style.gridTemplateRows
    .split(' ')
    .filter(Boolean)
    .map(v => parseFloat(v));

  const gap = parseFloat(style.columnGap) || 0;

  return {
    rect,
    columns,
    rows,
    gap,
    cellWidth: columns[0] || 0,
    cellHeight: rows[0] || 0
  };
}
```

---

## Generating Layout CSS

```typescript
function layoutToCSS(items: LayoutItem[], selector: string): string {
  return items.map(item => `
    ${selector}[data-id="${item.id}"] {
      grid-column: ${item.column} / span ${item.colspan};
      grid-row: ${item.row} / span ${item.rowspan};
    }
  `).join('\n');
}
```

---

## Position Equivalences

These all produce the same result for a 2-column item:

```css
/* Explicit start and end */
grid-column: 1 / 3;

/* Start with span */
grid-column: 1 / span 2;

/* Just span (auto-placed start) */
grid-column: span 2;
```

---

## Multi-Cell Item Bounds Check

Check if an item fits at a position:

```typescript
function itemFitsAt(
  column: number,
  row: number,
  colspan: number,
  rowspan: number,
  gridColumns: number,
  gridRows: number
): boolean {
  return (
    column >= 1 &&
    row >= 1 &&
    column + colspan - 1 <= gridColumns &&
    row + rowspan - 1 <= gridRows
  );
}
```

---

## Collision Detection

Check if two items overlap:

```typescript
function itemsOverlap(a: LayoutItem, b: LayoutItem): boolean {
  const aRight = a.column + a.colspan;
  const aBottom = a.row + a.rowspan;
  const bRight = b.column + b.colspan;
  const bBottom = b.row + b.rowspan;

  return !(
    aRight <= b.column ||   // a is left of b
    bRight <= a.column ||   // b is left of a
    aBottom <= b.row ||     // a is above b
    bBottom <= a.row        // b is above a
  );
}
```

---

## See Also

- [CSS Grid](./css-grid.md) - Full spec reference
- [View Transitions](./view-transitions.md) - Animating layout changes
