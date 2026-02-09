# Animation Patterns

Animation techniques used in EG Grid for smooth grid interactions.

---

## View Transitions (Preferred)

The platform-native way to animate DOM state changes:

```typescript
function animateLayoutChange(applyChange: () => void): Promise<void> {
  if (document.startViewTransition) {
    const transition = document.startViewTransition(applyChange);
    return transition.finished;
  } else {
    applyChange();
    return Promise.resolve();
  }
}
```

### Requirements

1. Elements need `view-transition-name`:
   ```css
   .grid-item {
     view-transition-name: var(--item-id);
   }
   ```

2. Changes must be via stylesheet, not inline styles:
   ```typescript
   // Update a <style> element, not element.style
   styleElement.textContent = newCSS;
   ```

3. Names must be unique (duplicates abort transition)

---

## FLIP Animation (Fallback)

First, Last, Invert, Play - manual animation when View Transitions unavailable.

### Basic FLIP

```typescript
function animateFLIP(element: HTMLElement, applyChange: () => void) {
  // FIRST: Capture current state
  const first = element.getBoundingClientRect();

  // Apply the DOM change
  applyChange();

  // LAST: Capture new state
  const last = element.getBoundingClientRect();

  // INVERT: Calculate the delta
  const deltaX = first.left - last.left;
  const deltaY = first.top - last.top;
  const scaleX = first.width / last.width;
  const scaleY = first.height / last.height;

  // PLAY: Animate from inverted to final
  element.animate([
    {
      transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
      transformOrigin: 'top left'
    },
    {
      transform: 'translate(0, 0) scale(1, 1)',
      transformOrigin: 'top left'
    }
  ], {
    duration: 200,
    easing: 'ease-out',
    fill: 'none'  // Important: don't persist transform
  });
}
```

### FLIP with Callback

```typescript
function animateFLIPWithTracking(
  element: HTMLElement,
  firstRect: DOMRect,
  options: {
    duration?: number;
    easing?: string;
    includeScale?: boolean;
    onFinish?: () => void;
  } = {}
): Animation | null {
  const {
    duration = 200,
    easing = 'ease-out',
    includeScale = false,
    onFinish
  } = options;

  const last = element.getBoundingClientRect();

  const deltaX = firstRect.left - last.left;
  const deltaY = firstRect.top - last.top;

  // Skip if no movement
  if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
    onFinish?.();
    return null;
  }

  let fromTransform = `translate(${deltaX}px, ${deltaY}px)`;
  let toTransform = 'translate(0, 0)';

  if (includeScale && firstRect.width && firstRect.height) {
    const scaleX = firstRect.width / last.width;
    const scaleY = firstRect.height / last.height;
    fromTransform += ` scale(${scaleX}, ${scaleY})`;
    toTransform += ' scale(1, 1)';
  }

  const animation = element.animate([
    { transform: fromTransform, transformOrigin: 'top left' },
    { transform: toTransform, transformOrigin: 'top left' }
  ], {
    duration,
    easing,
    fill: 'none'
  });

  animation.onfinish = () => {
    element.style.transform = '';  // Explicit cleanup
    onFinish?.();
  };

  return animation;
}
```

---

## Fixed Positioning During Drag

Items leave grid flow during drag so the grid can reflow around them:

```typescript
function startDrag(item: HTMLElement) {
  const rect = item.getBoundingClientRect();

  // Remove from grid flow
  item.style.position = 'fixed';
  item.style.left = `${rect.left}px`;
  item.style.top = `${rect.top}px`;
  item.style.width = `${rect.width}px`;
  item.style.height = `${rect.height}px`;
  item.style.zIndex = '100';

  // Exclude from View Transitions
  item.style.viewTransitionName = 'dragging';
}

function endDrag(item: HTMLElement, targetCell: GridCell) {
  // Capture position before clearing fixed
  const firstRect = item.getBoundingClientRect();

  // Clear fixed positioning
  item.style.position = '';
  item.style.left = '';
  item.style.top = '';
  item.style.width = '';
  item.style.height = '';
  item.style.zIndex = '';

  // Set new grid position
  item.style.gridColumn = `${targetCell.column} / span ${colspan}`;
  item.style.gridRow = `${targetCell.row} / span ${rowspan}`;

  // Animate from old position to new grid position
  animateFLIPWithTracking(item, firstRect);

  // Restore view transition name
  item.style.viewTransitionName = item.id;
}
```

---

## Combining View Transitions + FLIP

View Transitions animate other items; FLIP animates the dragged item:

```typescript
async function dropItem(item: HTMLElement, targetCell: GridCell) {
  const firstRect = item.getBoundingClientRect();

  // Exclude dragged item from View Transition
  item.style.viewTransitionName = 'none';

  // Animate other items with View Transition
  const transition = document.startViewTransition(() => {
    // Clear fixed positioning, set grid position
    clearFixedStyles(item);
    setGridPosition(item, targetCell);
  });

  // Wait for pseudo-elements to be created
  await transition.ready;

  // FLIP animate the dragged item
  animateFLIPWithTracking(item, firstRect, {
    onFinish: () => {
      // Restore view transition name
      item.style.viewTransitionName = item.id;
    }
  });

  await transition.finished;
}
```

---

## Transform Cleanup

**Critical:** Always clear transforms after FLIP animations:

```typescript
animation.onfinish = () => {
  element.style.transform = '';  // Prevent stuck transforms
};
```

Without this, the element may appear stuck in its animated position.

---

## Timing Coordination

When combining scroll, layout, and animation:

```typescript
async function moveWithScroll(item: HTMLElement, targetCell: GridCell) {
  // 1. Apply layout change (triggers View Transition)
  const transition = document.startViewTransition(() => {
    setGridPosition(item, targetCell);
  });

  // 2. Wait for View Transition to complete
  await transition.finished;

  // 3. Scroll to show item (after animation)
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
```

---

## See Also

- [View Transitions](./view-transitions.md) - Platform animation API
- [CSS Grid](./css-grid.md) - Grid layout fundamentals
