# Server-Side Rendering Responsive Grids

This guide explains how to generate responsive container query CSS on the server for flash-free initial renders.

## The Formula

Given your grid configuration:
- `maxColumns` - maximum column count (canonical layout)
- `minColumns` - minimum column count (default: 1)
- `cellSize` - cell width in pixels (e.g., 184)
- `gap` - gap between cells in pixels (e.g., 16)

**Breakpoint width for N columns:**
```
breakpointWidth(n) = n * cellSize + (n - 1) * gap
```

Example with `cellSize=184`, `gap=16`:
| Columns | Calculation | Breakpoint |
|---------|-------------|------------|
| 6 | 6×184 + 5×16 | 1184px |
| 5 | 5×184 + 4×16 | 984px |
| 4 | 4×184 + 3×16 | 784px |
| 3 | 3×184 + 2×16 | 584px |
| 2 | 2×184 + 1×16 | 384px |
| 1 | — | < 384px |

## Container Query Structure

```css
/* Canonical (maxColumns) - min-width only */
@container (min-width: {breakpoint(maxColumns)}px) {
  /* positions for maxColumns */
}

/* Middle breakpoints - range */
@container (min-width: {breakpoint(n)}px) and (max-width: {breakpoint(n+1) - 1}px) {
  /* positions for n columns */
}

/* Minimum (minColumns) - max-width only */
@container (max-width: {breakpoint(minColumns + 1) - 1}px) {
  /* positions for minColumns */
}
```

## Layout Derivation Algorithm

For column counts below `maxColumns`, derive positions using **first-fit compaction**:

```
function deriveLayout(targetColumns, canonicalPositions, items):
    # Sort items by canonical position (row first, then column)
    sorted = items.sortBy(item => (canonicalPositions[item.id].row, canonicalPositions[item.id].column))

    # 2D occupancy grid
    occupied = Array[MAX_ROWS][targetColumns] filled with null
    result = {}

    for item in sorted:
        width = min(item.width, targetColumns)  # Clamp to available columns
        height = item.height

        # Find first position where item fits
        for row in 0..MAX_ROWS:
            for col in 0..(targetColumns - width):
                if canFit(occupied, row, col, width, height):
                    result[item.id] = { column: col + 1, row: row + 1 }  # 1-indexed
                    markOccupied(occupied, row, col, width, height, item.id)
                    break outer

    return result

function canFit(occupied, startRow, startCol, width, height):
    for dy in 0..height:
        for dx in 0..width:
            if occupied[startRow + dy][startCol + dx] != null:
                return false
    return true
```

## Complete CSS Generation

```
function generateResponsiveCSS(items, canonicalPositions, config):
    css = []

    # Generate fallback (canonical positions, no container query)
    css.append("/* Fallback: canonical layout */")
    for (id, pos) in canonicalPositions:
        item = items[id]
        css.append("#{id} { grid-column: {pos.column} / span {item.width}; grid-row: {pos.row} / span {item.height}; }")

    # Generate container queries for each breakpoint
    for cols in maxColumns..minColumns:
        positions = (cols == maxColumns) ? canonicalPositions : deriveLayout(cols, canonicalPositions, items)
        minWidth = breakpointWidth(cols)

        # Build container query selector
        if cols == maxColumns:
            query = "@container (min-width: {minWidth}px)"
        else if cols == minColumns:
            maxWidth = breakpointWidth(cols + 1) - 1
            query = "@container (max-width: {maxWidth}px)"
        else:
            maxWidth = breakpointWidth(cols + 1) - 1
            query = "@container (min-width: {minWidth}px) and (max-width: {maxWidth}px)"

        css.append(query + " {")
        css.append("  #grid { grid-template-columns: repeat({cols}, 1fr); }")

        for (id, pos) in positions:
            item = items[id]
            w = min(item.width, cols)  # Clamp width
            css.append("  #{id} { grid-column: {pos.column} / span {w}; grid-row: {pos.row} / span {item.height}; }")

        css.append("}")

    return css.join("\n")
```

## Input Data Structure

Your server needs:

```json
{
  "config": {
    "maxColumns": 6,
    "minColumns": 1,
    "cellSize": 184,
    "gap": 16,
    "gridSelector": "#grid"
  },
  "items": [
    { "id": "item-1", "width": 2, "height": 2 },
    { "id": "item-2", "width": 2, "height": 1 }
  ],
  "canonicalPositions": {
    "item-1": { "column": 1, "row": 1 },
    "item-2": { "column": 3, "row": 1 }
  }
}
```

## HTML Structure

```html
<head>
  <style>
    /* Base grid styles */
    .grid-wrapper { container-type: inline-size; }
    .grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      grid-auto-rows: 184px;
      gap: 16px;
    }
  </style>
  <!-- Server-generated responsive CSS -->
  <style id="layout-styles">
    {{ generateResponsiveCSS(items, positions, config) }}
  </style>
</head>
<body>
  <div class="grid-wrapper">
    <div class="grid" id="grid">
      {% for item in items %}
      <div id="{{ item.id }}" data-egg-item
           data-egg-colspan="{{ item.width }}"
           data-egg-rowspan="{{ item.height }}">
        {{ item.content }}
      </div>
      {% endfor %}
    </div>
  </div>
</body>
```

## Avoiding Layout Shift (Flash)

Container queries are pure CSS and work without JS. The flash/layout shift issues come from JS re-injecting CSS that already exists.

### Critical Rules

1. **JS must respect server-rendered CSS** - Don't re-inject if `styleElement.textContent` already has content
2. **Only inject on user interaction** - JS should only modify CSS when user creates overrides (e.g., drags items)
3. **Fallback rules must come first** - They apply immediately; container queries apply after container is sized

### The Responsive Plugin Check

The responsive plugin checks for server-rendered CSS and skips injection:

```typescript
// In attachResponsive()
const hasServerRenderedCSS = !!styleElement.textContent?.trim();

if (!hasServerRenderedCSS) {
  injectCSS();  // Only inject if empty
}

// On layout model changes, only inject if there are user overrides
layoutModel.subscribe(() => {
  if (hasServerRenderedCSS && layoutModel.getOverrideColumnCounts().length === 0) {
    return;  // Server CSS is sufficient, no user changes yet
  }
  injectCSS();  // User has made changes, regenerate
});
```

### Common Causes of Flash

| Cause | Solution |
|-------|----------|
| Duplicate CSS rules (inline + container query) | Use only one source of truth |
| JS re-injecting identical CSS | Check for existing content before injection |
| Container query evaluating after fallback | Ensure fallback matches canonical layout |
| Missing fallback rules | Always include fallback before container queries |

## Progressive Enhancement

Once JS loads, eg-grid takes over:

```js
import { init, createLayoutModel, attachResponsive } from 'eg-grid';
import { attachPushAlgorithm } from 'eg-grid/algorithm-push';

// Build model from same data server used
const layoutModel = createLayoutModel({
  maxColumns: 6,
  items: serverItems,
  canonicalPositions: new Map(Object.entries(serverPositions))
});

const grid = init(document.getElementById('grid'));
const layoutStyles = document.getElementById('layout-styles');

// Responsive plugin detects server-rendered CSS and skips injection
// It will only inject CSS when user creates overrides via drag-and-drop
attachResponsive(grid.element, { layoutModel, styleElement: layoutStyles }, grid);

// Algorithm plugin enables drag-and-drop, saves changes to model
attachPushAlgorithm(grid.element, { layoutModel, core: grid });
```

## Handling Layout Changes

When a user drags an item, the algorithm plugin:
1. Calculates new layout
2. Saves to layout model via `layoutModel.saveLayout(columnCount, positions)`
3. Layout model notifies subscribers
4. Responsive plugin regenerates CSS

To persist changes, listen to the model:

```js
layoutModel.subscribe(() => {
  const positions = layoutModel.getCurrentLayout();
  // Send to server: POST /api/layout { positions, columnCount }
});
```

## Reference Implementation

See `eg-grid/layout-model.ts` for the canonical TypeScript implementation of:
- `deriveLayoutForColumns()` - first-fit compaction algorithm
- `generateAllBreakpointCSS()` - complete CSS generation

These are pure functions with no DOM dependencies, suitable as reference for porting to other languages.
