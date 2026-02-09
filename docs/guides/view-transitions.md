# View Transitions Guide

View Transitions provide smooth, native animations when grid items move. This guide covers how EG Grid integrates with the View Transitions API.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    View Transition Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Capture "old" state     2. Run callback      3. Animate    │
│  ┌─────────────────────┐   ┌───────────────┐   ┌────────────┐ │
│  │ Browser snapshots   │   │ Your layout   │   │ Browser    │ │
│  │ all elements with   │──▶│ changes run   │──▶│ animates   │ │
│  │ view-transition-name│   │ (DOM updates) │   │ old → new  │ │
│  └─────────────────────┘   └───────────────┘   └────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The browser handles all the animation math. You just:
1. Give elements unique `view-transition-name` values
2. Wrap DOM changes in `document.startViewTransition()`

## Basic Setup

### 1. Assign Transition Names

Each item needs a unique `view-transition-name`:

```html
<div class="item" style="view-transition-name: item-a">A</div>
<div class="item" style="view-transition-name: item-b">B</div>
```

Or use CSS custom properties:

```html
<div class="item" style="--item-id: item-a">A</div>
<div class="item" style="--item-id: item-b">B</div>
```

```css
.item {
  view-transition-name: var(--item-id);
}
```

### 2. Wrap Changes in View Transition

```javascript
function moveItem(item, newCell) {
  if ('startViewTransition' in document) {
    document.startViewTransition(() => {
      item.style.gridColumn = String(newCell.column);
      item.style.gridRow = String(newCell.row);
    });
  } else {
    // Fallback: instant move
    item.style.gridColumn = String(newCell.column);
    item.style.gridRow = String(newCell.row);
  }
}
```

### 3. Style the Animation

```css
::view-transition-group(*) {
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}
```

## EG Grid-Specific Patterns

### Exclude the Dragged Item

The dragged item follows the cursor via JavaScript. Don't animate it:

```javascript
// In your algorithm's applyLayout function
function applyLayout(items, draggedItem) {
  // Set dragged item to named 'dragging' transition
  draggedItem.style.viewTransitionName = 'dragging';

  document.startViewTransition(() => {
    items.forEach(item => {
      if (item.element !== draggedItem) {
        item.element.style.gridColumn = String(item.column);
        item.element.style.gridRow = String(item.row);
      }
    });
  });
}
```

```css
/* Suppress all animation for 'dragging' */
::view-transition-old(dragging),
::view-transition-new(dragging),
::view-transition-group(dragging) {
  animation: none;
}
```

### Restore Transition Name After Drop

After the FLIP animation completes:

```javascript
animation.onfinish = () => {
  // Restore original view-transition-name
  const itemId = item.dataset.id || item.id;
  item.style.viewTransitionName = `item-${itemId}`;
};
```

### Prevent Ghosting

View Transitions crossfade between old and new states. When items overlap during animation, this creates a "ghost" effect:

```css
/* Disable the crossfade */
::view-transition-old(*) {
  animation: none;
  opacity: 0;  /* Hide old snapshot immediately */
}

::view-transition-new(*) {
  animation: none;  /* Show new snapshot immediately */
}
```

Now only position animates, not opacity.

## FLIP Animation on Drop

When the user releases, the dragged item needs to animate from its cursor position to its final grid position. EG Grid's pointer plugin uses FLIP:

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLIP on Drop                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  First: Record current position (where cursor released)        │
│    ↓                                                            │
│  Last: Reset styles, measure final grid position                │
│    ↓                                                            │
│  Invert: Calculate delta (first - last)                        │
│    ↓                                                            │
│  Play: Animate from inverted position to zero                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The pointer plugin handles this automatically. Your algorithm just needs to apply positions synchronously on `drag-end`:

```javascript
grid.addEventListener('egg:drag-end', (e) => {
  const { item, cell } = e.detail;

  // Apply synchronously (don't use View Transition here)
  // The pointer plugin's FLIP will animate the dropped item
  items.forEach(i => {
    i.element.style.gridColumn = String(i.column);
    i.element.style.gridRow = String(i.row);
  });
});
```

## Advanced Patterns

### Different Durations per Element

```css
/* Faster animation for small items */
::view-transition-group(small-item) {
  animation-duration: 150ms;
}

/* Slower for large items */
::view-transition-group(large-item) {
  animation-duration: 300ms;
}
```

### Custom Easing

```css
/* Bouncy effect */
::view-transition-group(*) {
  animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Smooth deceleration */
::view-transition-group(*) {
  animation-timing-function: cubic-bezier(0.0, 0.0, 0.2, 1);
}
```

### Staggered Animations

View Transitions animate all elements simultaneously. For staggered effects, use delays:

```css
::view-transition-group(item-1) { animation-delay: 0ms; }
::view-transition-group(item-2) { animation-delay: 20ms; }
::view-transition-group(item-3) { animation-delay: 40ms; }
```

Or generate dynamically:

```javascript
items.forEach((item, index) => {
  item.style.setProperty('--stagger-delay', `${index * 20}ms`);
});
```

```css
::view-transition-group(*) {
  animation-delay: var(--stagger-delay, 0ms);
}
```

### Scale During Transition

```css
@keyframes scale-in {
  from {
    transform: scale(0.95);
  }
  to {
    transform: scale(1);
  }
}

::view-transition-new(*):only-child {
  animation: scale-in 200ms ease-out;
}
```

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome | 111+ |
| Edge | 111+ |
| Safari | 18+ |
| Firefox | Not yet (use fallback) |

Always provide a fallback:

```javascript
if ('startViewTransition' in document) {
  document.startViewTransition(updateDOM);
} else {
  updateDOM();
}
```

## Debugging

### Chrome DevTools

1. Open DevTools → Animations panel
2. Start a drag operation
3. View Transitions appear as animation groups
4. Slow down animations with the timeline controls

### Visualize Snapshots

```css
/* Temporarily show old/new snapshots */
::view-transition-old(*) {
  border: 2px solid red;
}

::view-transition-new(*) {
  border: 2px solid green;
}
```

## Performance Tips

1. **Limit transition names** - Only items that move need unique names
2. **Avoid layout thrashing** - Batch all DOM reads before writes
3. **Use `will-change`** sparingly - Browser handles this during transitions
4. **Test on real devices** - View Transitions are GPU-accelerated but complex grids may stutter

## Complete Example

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 100px);
      grid-auto-rows: 100px;
      gap: 8px;
    }

    .item {
      view-transition-name: var(--item-id);
      background: white;
      border-radius: 8px;
    }

    /* Animation timing */
    ::view-transition-group(*) {
      animation-duration: 200ms;
      animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
    }

    /* Disable crossfade */
    ::view-transition-old(*) {
      animation: none;
      opacity: 0;
    }

    ::view-transition-new(*) {
      animation: none;
    }

    /* Exclude dragged item */
    ::view-transition-old(dragging),
    ::view-transition-new(dragging),
    ::view-transition-group(dragging) {
      animation: none;
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      ::view-transition-group(*) {
        animation: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="grid" id="grid">
    <div class="item" data-egg-item style="--item-id: a; grid-column: 1">A</div>
    <div class="item" data-egg-item style="--item-id: b; grid-column: 2">B</div>
    <div class="item" data-egg-item style="--item-id: c; grid-column: 3">C</div>
  </div>

  <script type="module">
    import { init } from './eg-grid.js';
    import { attachPushAlgorithm } from './algorithm-push.js';

    const grid = init(document.getElementById('grid'));
    attachPushAlgorithm(grid.element);
  </script>
</body>
</html>
```

## Next Steps

- [Styling Guide](./styling.md) - Visual feedback during drag
- [Custom Algorithms](./custom-algorithms.md) - Implement your own layout logic
