# CSS View Transitions (W3C Spec Reference)

> Source: https://www.w3.org/TR/css-view-transitions-1/

This document captures critical View Transitions concepts for EG Grid development. The library uses View Transitions to animate grid layout changes.

## Core Principle

**View Transitions animate between DOM states.** The browser captures snapshots before and after a change, then crossfades between them with customizable animations.

---

## Basic Usage

```typescript
if (document.startViewTransition) {
  document.startViewTransition(() => {
    // Make DOM changes here
    updateGridLayout();
  });
} else {
  // Fallback: apply changes without animation
  updateGridLayout();
}
```

---

## Lifecycle Phases

1. **`pending-capture`** - After `startViewTransition()` called, before callback runs
2. **`update-callback-called`** - Callback runs, DOM changes applied
3. **`animating`** - Pseudo-elements created, animations execute
4. **`done`** - Animations complete, pseudo-elements removed

**Critical:** The callback is *always* called, even if the transition fails. DOM changes happen regardless of animation success.

---

## JavaScript API

```typescript
const transition = document.startViewTransition(updateCallback);

// Three promises for different lifecycle points:
transition.updateCallbackDone  // Resolves when DOM change completes
transition.ready               // Resolves when pseudo-elements created
transition.finished            // Resolves when animations complete

// Cancel animation (DOM change still happens):
transition.skipTransition();
```

### Waiting for Animation

```typescript
const transition = document.startViewTransition(() => {
  applyNewLayout();
});

// Wait for animation before next action
await transition.finished;
```

---

## The `view-transition-name` Property

```css
.grid-item {
  view-transition-name: var(--item-id);
}
```

**Purpose:** Tags elements for independent capture and animation.

**Requirements:**
- Must be unique across all elements
- Element must not be fragmented (no multi-column, etc.)
- Element must be rendered (not `display: none`)

**Gotcha:** Duplicate names abort the entire transition.

---

## Pseudo-Element Tree

During animation, the browser creates this structure:

```
::view-transition
├── ::view-transition-group(item-1)
│   └── ::view-transition-image-pair(item-1)
│       ├── ::view-transition-old(item-1)   ← snapshot before
│       └── ::view-transition-new(item-1)   ← snapshot after
├── ::view-transition-group(item-2)
│   └── ...
└── ::view-transition-group(root)
    └── ...
```

---

## Customizing Animations

### Basic Customization

```css
/* Slow down all transitions */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 500ms;
}

/* Custom animation for specific item */
::view-transition-new(sidebar) {
  animation: 300ms ease-out slide-in;
}
```

### Per-Item Animations

```css
/* Items animate independently */
::view-transition-group(*) {
  animation-duration: 200ms;
  animation-timing-function: ease-out;
}
```

### Default Behavior

By default, `::view-transition-group` animates:
- `width` and `height` (if changed)
- `transform` (position change)

Old/new images crossfade automatically.

---

## EG Grid-Specific Patterns

### Animating Grid Layout Changes

```typescript
// Inject new CSS, animate the change
document.startViewTransition(() => {
  layoutStyleElement.textContent = generateLayoutCSS(newLayout);
});
```

### Excluding Items from Transition

During drag, the dragged item should not participate:

```css
[data-egg-dragging] {
  view-transition-name: none;  /* Exclude from transition */
}
```

Or use a reserved name:

```typescript
item.style.viewTransitionName = 'dragging';  // Won't match other items
```

### Waiting for Transition Before Next Operation

```typescript
async function moveItem(item, targetCell) {
  const transition = document.startViewTransition(() => {
    setItemPosition(item, targetCell);
  });

  await transition.finished;
  // Safe to do next operation
}
```

---

## Constraints & Gotchas

| Issue | Description |
|-------|-------------|
| **Unique names required** | Duplicate `view-transition-name` aborts transition |
| **Document must be visible** | Hidden documents throw `InvalidStateError` |
| **No concurrent transitions** | New transition aborts previous one |
| **Style injection required** | Inline styles don't trigger transitions properly |
| **Hit-testing disabled** | Elements get `pointer-events: none` during animation |
| **Same-document only** | This spec covers SPA transitions, not navigation |

### The Inline Style Problem

View Transitions capture element styles from stylesheets. Inline `style=` changes may not animate correctly:

```typescript
// BAD: May not animate
item.style.gridColumn = '2';

// GOOD: Animates correctly
styleElement.textContent = '#item { grid-column: 2; }';
```

---

## FLIP Fallback

When View Transitions aren't available, use FLIP (First, Last, Invert, Play):

```typescript
function animateWithFLIP(element, applyChange) {
  // First: capture current position
  const first = element.getBoundingClientRect();

  // Apply the change
  applyChange();

  // Last: capture new position
  const last = element.getBoundingClientRect();

  // Invert: calculate offset
  const deltaX = first.left - last.left;
  const deltaY = first.top - last.top;

  // Play: animate from inverted position to final
  element.animate([
    { transform: `translate(${deltaX}px, ${deltaY}px)` },
    { transform: 'translate(0, 0)' }
  ], {
    duration: 200,
    easing: 'ease-out'
  });
}
```

---

## See Also

- [CSS Grid](./css-grid.md) - Grid layout fundamentals
- [Animation Patterns](./animation-patterns.md) - FLIP and other techniques
