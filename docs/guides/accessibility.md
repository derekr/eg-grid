# Accessibility Guide

Gridiot includes built-in accessibility support for keyboard navigation and screen readers. This guide covers how to use and customize these features.

## What's Included

The full bundle (`gridiot.js`) includes:

- **Keyboard plugin**: Navigate and drag items with keyboard
- **Accessibility plugin**: ARIA live announcements for screen readers

## Keyboard Navigation

### Enable Keyboard Focus

Make items focusable with `tabindex`:

```html
<div data-gridiot-item tabindex="0">A</div>
<div data-gridiot-item tabindex="0">B</div>
```

### Controls

| Key | Action |
|-----|--------|
| Tab | Move focus between items |
| Enter / Space | Pick up or drop focused item |
| Arrow keys | Move held item in grid |
| Escape | Cancel drag, restore position |

### Focus Styles

```css
[data-gridiot-item]:focus {
  outline: 3px solid #0066ff;
  outline-offset: 2px;
}

/* Different style when item is grabbed */
[data-gridiot-item]:focus[data-gridiot-dragging] {
  outline-color: #00cc66;
}
```

## Screen Reader Announcements

### How It Works

Gridiot creates an ARIA live region that announces:
- When an item is grabbed
- When an item moves to a new cell
- When an item is dropped
- When a drag is cancelled

### Default Announcements

| Event | Default Message |
|-------|-----------------|
| Grab | "{label} grabbed from row {row}, column {column}" |
| Move | "Moved to row {row}, column {column}" |
| Drop | "{label} dropped at row {row}, column {column}" |
| Cancel | "{label} returned to row {row}, column {column}" |

### Labeling Items

Provide meaningful names for screen readers:

```html
<div
  data-gridiot-item
  data-gridiot-label="Revenue Chart"
  tabindex="0"
>
  ...
</div>
```

Label precedence:
1. `data-gridiot-label`
2. `aria-label`
3. `id`
4. Fallback: "Item"

### Custom Announcements

Override default messages with template attributes:

```html
<!-- Per-item override -->
<div
  data-gridiot-item
  data-gridiot-label="Sales Chart"
  data-gridiot-announce-grab="{label} selected. Use arrow keys to move."
  data-gridiot-announce-drop="{label} placed at position {row}, {column}."
  tabindex="0"
>
  ...
</div>
```

Available placeholders:
- `{label}` - Item's label
- `{row}` - Current row number
- `{column}` - Current column number

### Grid-Wide Defaults

Set default announcements for all items in a grid:

```html
<div
  id="my-grid"
  data-gridiot-announce-grab="{label} picked up from {row}, {column}."
  data-gridiot-announce-move="Now at row {row}, column {column}."
  data-gridiot-announce-drop="{label} placed."
  data-gridiot-announce-cancel="Cancelled. {label} back at {row}, {column}."
>
  <div data-gridiot-item data-gridiot-label="Chart A">...</div>
  <div data-gridiot-item data-gridiot-label="Chart B">...</div>
</div>
```

### Precedence

1. Item-level attribute (`data-gridiot-announce-*` on item)
2. Grid-level attribute (`data-gridiot-announce-*` on grid)
3. Default message

## ARIA Roles and Attributes

### Recommended Markup

```html
<div
  role="application"
  aria-label="Dashboard grid. Use arrow keys to rearrange items."
  id="my-grid"
>
  <div
    data-gridiot-item
    role="listitem"
    aria-label="Revenue Chart"
    data-gridiot-label="Revenue Chart"
    tabindex="0"
  >
    ...
  </div>
</div>
```

### During Drag

Gridiot automatically sets:
- `aria-grabbed="true"` on dragged item (deprecated but still useful)
- Announces state changes via live region

## Testing with Screen Readers

### VoiceOver (macOS)

1. Enable: Cmd + F5
2. Tab to focus grid items
3. Press Enter/Space to grab
4. Use arrows to move
5. Listen for announcements

### NVDA (Windows)

1. Enable NVDA
2. Tab to focus items
3. Enter/Space to grab
4. Arrow keys to move
5. Verify announcements in speech viewer

### Common Issues

| Issue | Solution |
|-------|----------|
| No announcements | Check live region exists, verify `aria-live="polite"` |
| Announcements too verbose | Simplify custom messages |
| Focus lost after drop | Ensure item remains focusable |
| Wrong position announced | Check row/column calculation |

## Reduced Motion

Respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable animations */
  ::view-transition-group(*) {
    animation: none !important;
  }

  [data-gridiot-dragging] {
    transform: none;
    transition: none;
  }
}
```

The keyboard plugin continues to work—only visual animations are affected.

## Internationalization

For non-English announcements, use custom messages:

```html
<!-- German -->
<div
  id="grid"
  data-gridiot-announce-grab="{label} aufgenommen von Zeile {row}, Spalte {column}."
  data-gridiot-announce-move="Bewegt zu Zeile {row}, Spalte {column}."
  data-gridiot-announce-drop="{label} abgelegt bei Zeile {row}, Spalte {column}."
  data-gridiot-announce-cancel="{label} zurück zu Zeile {row}, Spalte {column}."
>
  ...
</div>
```

Or set dynamically:

```javascript
const grid = document.getElementById('grid');
const messages = getLocalizedMessages(userLocale);

grid.dataset.gridiotAnnounceGrab = messages.grab;
grid.dataset.gridiotAnnounceMove = messages.move;
grid.dataset.gridiotAnnounceDrop = messages.drop;
grid.dataset.gridiotAnnounceCancel = messages.cancel;
```

## Custom Accessibility Plugin

For advanced needs, create your own accessibility handling:

```javascript
// Custom accessibility plugin — listen to drag events on the grid element
function attachCustomAccessibility(gridElement) {
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'assertive'); // More urgent
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.className = 'sr-only';
  document.body.appendChild(liveRegion);

  function announce(message) {
    liveRegion.textContent = '';
    requestAnimationFrame(() => {
      liveRegion.textContent = message;
    });
  }

  const onDragStart = (e) => {
    const { item } = e.detail;
    const label = item.getAttribute('data-gridiot-label') || 'Item';
    announce(`Started dragging ${label}`);
  };

  // ... other event handlers

  gridElement.addEventListener('gridiot:drag-start', onDragStart);

  return () => {
    gridElement.removeEventListener('gridiot:drag-start', onDragStart);
    liveRegion.remove();
  };
}
```

## Accessibility Checklist

- [ ] All items have `tabindex="0"`
- [ ] All items have `data-gridiot-label` or `aria-label`
- [ ] Focus styles are visible
- [ ] Keyboard controls work (Enter/Space, arrows, Escape)
- [ ] Screen reader announces grab/move/drop/cancel
- [ ] Reduced motion preferences respected
- [ ] Grid has appropriate `role` and `aria-label`
- [ ] Tested with actual screen reader

## Next Steps

- [Keyboard Navigation Source](../plugins/keyboard.ts) - Implementation details
- [Accessibility Plugin Source](../plugins/accessibility.ts) - How announcements work
- [Styling Guide](./styling.md) - Focus and drag state styles
