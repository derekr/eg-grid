# CSS Grid Layout (W3C Spec Reference)

> Source: https://www.w3.org/TR/css-grid-1/

This document captures critical CSS Grid concepts for EG Grid development. The library relies on CSS Grid for all layout positioning.

## Core Principle

**CSS Grid does the layout math.** EG Grid sets `grid-column` and `grid-row` values; the browser computes pixel positions.

---

## Grid Container

Created with `display: grid`. Establishes an independent formatting context where:
- Floats don't intrude
- Margins don't collapse
- Children become grid items

```css
.grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: auto;
  gap: 16px;
}
```

---

## Grid Item Placement

### Properties

| Property | Purpose | Example |
|----------|---------|---------|
| `grid-column-start` | Start line | `1` |
| `grid-column-end` | End line | `3` or `span 2` |
| `grid-column` | Shorthand | `1 / span 2` |
| `grid-row-start` | Start line | `1` |
| `grid-row-end` | End line | `span 1` |
| `grid-row` | Shorthand | `1 / span 1` |

### Line Numbers

- **Positive numbers**: Count from start (1-indexed)
- **Negative numbers**: Count from end (-1 = last line)
- Lines exist between tracks, not on them

```
     1    2    3    4    5    6    7
     |    |    |    |    |    |    |
    -7   -6   -5   -4   -3   -2   -1
```

### The `span` Keyword

Indicates how many tracks an item spans:

```css
/* These are equivalent for a 2-column item starting at column 1 */
grid-column: 1 / 3;
grid-column: 1 / span 2;
```

**Important:** `span` only works as the end value. `span 2 / 3` is invalid.

---

## Track Sizing

### fr Units (Flexible)

Represents a fraction of leftover space after fixed/content sizing:

```css
grid-template-columns: 1fr 2fr 1fr;  /* 25% | 50% | 25% */
grid-template-columns: 200px 1fr;    /* Fixed | Remaining */
```

### minmax()

Defines size ranges:

```css
grid-template-columns: minmax(100px, 1fr) minmax(200px, 2fr);
```

### auto

- As maximum: uses `max-content` (content determines size)
- As minimum: uses item's `min-width/height` or content minimum

---

## Gap (Gutters)

```css
gap: 16px;           /* Both row and column */
row-gap: 16px;       /* Rows only */
column-gap: 16px;    /* Columns only */
```

**Note:** Gaps only appear between tracks, not at container edges.

---

## Auto-Placement

When items lack explicit placement, the browser assigns them automatically:

```css
grid-auto-flow: row;     /* Fill rows first (default) */
grid-auto-flow: column;  /* Fill columns first */
grid-auto-flow: dense;   /* Fill gaps, may reorder */
```

**Warning:** Visual reordering via `dense` or `order` doesn't change DOM order, which affects accessibility and keyboard navigation.

---

## Alignment

### Item Alignment (within cell)

```css
/* Horizontal */
justify-self: start | end | center | stretch;
justify-items: start;  /* All items */

/* Vertical */
align-self: start | end | center | stretch;
align-items: start;    /* All items */
```

### Grid Alignment (within container)

```css
justify-content: start | end | center | space-between | space-around;
align-content: start | end | center | space-between | space-around;
```

---

## EG Grid-Specific Patterns

### Reading Grid Position

```typescript
const style = getComputedStyle(item);
const column = parseInt(style.gridColumnStart, 10);
const row = parseInt(style.gridRowStart, 10);
```

### Setting Grid Position

```typescript
// Via style injection (preferred for View Transitions)
styleElement.textContent = `#item { grid-column: 2 / span 2; grid-row: 1; }`;

// Via inline styles (only during active drag)
item.style.gridColumn = '2 / span 2';
item.style.gridRow = '1';
```

### Computing Grid Dimensions

```typescript
const style = getComputedStyle(gridElement);
const columns = style.gridTemplateColumns.split(' ').map(parseFloat);
const rows = style.gridTemplateRows.split(' ').map(parseFloat);
const gap = parseFloat(style.columnGap) || 0;
```

---

## Constraints & Edge Cases

| Issue | Description |
|-------|-------------|
| **Z-index works** | Grid items can use `z-index` even with `position: static` |
| **Overlapping items** | Allowed; later items paint on top by default |
| **Large grids** | UAs may clamp to [-10000, 10000] range |
| **Float/vertical-align** | Have no effect on grid items |
| **Percentage sizing** | Resolves against container, not grid cell |

---

## See Also

- [View Transitions](./view-transitions.md) - Animating grid changes
- [Grid Placement Patterns](./grid-placement-patterns.md) - Common placement scenarios
