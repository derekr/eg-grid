# Styling Guide

This guide covers how to customize the visual appearance of dragging, dropping, and layout transitions in EG Grid.

## Data Attributes

EG Grid adds these attributes during drag operations:

| Attribute | When Applied | Use For |
|-----------|--------------|---------|
| `data-egg-item` | Always (you add this) | Base item styles |
| `data-egg-dragging` | While item is being dragged | Drag state styles |
| `data-egg-dropping` | During FLIP animation after drop | Drop animation styles |

## Basic Drag Styles

```css
/* Base item appearance */
[data-egg-item] {
  cursor: grab;
  user-select: none;
  transition: box-shadow 0.2s, transform 0.2s;
}

/* While dragging */
[data-egg-dragging] {
  cursor: grabbing;
  transform: scale(1.05);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  z-index: 100;
}

/* During drop animation */
[data-egg-dropping] {
  z-index: 100;
}
```

## Focus States (Keyboard Navigation)

```css
/* Keyboard focus indicator */
[data-egg-item]:focus {
  outline: 3px solid #0066ff;
  outline-offset: 2px;
}

/* Optional: different style when grabbed via keyboard */
[data-egg-item]:focus[data-egg-dragging] {
  outline: 3px solid #00cc66;
}
```

## Drop Placeholder

Show where the item will land:

```css
.drop-placeholder {
  background: rgba(0, 102, 255, 0.1);
  border: 2px dashed rgba(0, 102, 255, 0.4);
  border-radius: 8px;
  pointer-events: none;
}
```

Create the placeholder in your algorithm:

```javascript
let placeholder = null;

function showPlaceholder(grid, cell, width = 1, height = 1) {
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'drop-placeholder';
    placeholder.style.viewTransitionName = 'none'; // Exclude from transitions
    grid.appendChild(placeholder);
  }

  placeholder.style.gridColumn = `${cell.column} / span ${width}`;
  placeholder.style.gridRow = `${cell.row} / span ${height}`;
}

function hidePlaceholder() {
  placeholder?.remove();
  placeholder = null;
}

// In your event handlers
grid.addEventListener('egg:drag-move', (e) => {
  showPlaceholder(grid, e.detail.cell);
});

grid.addEventListener('egg:drag-end', hidePlaceholder);
grid.addEventListener('egg:drag-cancel', hidePlaceholder);
```

## View Transition Styles

### Basic Setup

```css
/* Give each item a unique transition name */
.item {
  view-transition-name: var(--item-id);
}

/* Animation timing */
::view-transition-group(*) {
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}
```

```html
<div class="item" data-egg-item style="--item-id: item-1">A</div>
<div class="item" data-egg-item style="--item-id: item-2">B</div>
```

### Prevent Ghosting

View Transitions crossfade by default, causing ghosting when items overlap:

```css
/* Disable crossfade - only animate position */
::view-transition-old(*) {
  animation: none;
  opacity: 0;
}

::view-transition-new(*) {
  animation: none;
}
```

### Exclude Dragged Item

The dragged item follows the cursor—don't animate it:

```css
/* Suppress animation for dragged item */
::view-transition-old(dragging),
::view-transition-new(dragging),
::view-transition-group(dragging) {
  animation: none;
}
```

Your algorithm sets this name:

```javascript
draggedItem.style.viewTransitionName = 'dragging';
```

## Stacking Order (Z-Index)

During drag, multiple layers may overlap:

```css
/* Dragged item on top */
[data-egg-dragging] {
  z-index: 100;
}

/* Items animating via View Transitions */
::view-transition-group(*) {
  /* Default stacking is usually fine */
}

/* Drop animation */
[data-egg-dropping] {
  z-index: 100;
}
```

## Color Themes

### Light Theme

```css
[data-egg-item] {
  background: white;
  border: 1px solid #e0e0e0;
}

[data-egg-dragging] {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
}

.drop-placeholder {
  background: rgba(0, 102, 255, 0.08);
  border-color: rgba(0, 102, 255, 0.3);
}
```

### Dark Theme

```css
[data-egg-item] {
  background: #2a2a2a;
  border: 1px solid #404040;
}

[data-egg-dragging] {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.drop-placeholder {
  background: rgba(100, 180, 255, 0.1);
  border-color: rgba(100, 180, 255, 0.3);
}
```

## Reduced Motion

Respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable View Transition animations */
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }

  /* Disable transform effects */
  [data-egg-dragging] {
    transform: none;
  }

  /* Simpler visual feedback */
  [data-egg-item] {
    transition: none;
  }
}
```

## Custom Drag Preview

By default, the actual item is dragged. For a custom preview:

```javascript
// In your drag-start handler
grid.addEventListener('egg:drag-start', (e) => {
  const { item } = e.detail;

  // Create custom preview
  const preview = item.cloneNode(true);
  preview.classList.add('drag-preview');
  document.body.appendChild(preview);

  // Position at cursor
  // (You'd need to track this in drag-move)
});
```

```css
.drag-preview {
  position: fixed;
  pointer-events: none;
  opacity: 0.8;
  transform: rotate(3deg);
  /* Add any custom preview styles */
}
```

## Complete Example

```css
/* Base styles */
.grid {
  display: grid;
  grid-template-columns: repeat(4, 100px);
  grid-auto-rows: 100px;
  gap: 8px;
  padding: 8px;
  background: #f5f5f5;
  border-radius: 12px;
}

.item {
  background: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  cursor: grab;
  user-select: none;
  view-transition-name: var(--item-id);
}

/* Drag states */
[data-egg-dragging] {
  cursor: grabbing;
  transform: scale(1.05);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  z-index: 100;
}

[data-egg-dropping] {
  z-index: 100;
}

/* Focus for keyboard nav */
.item:focus {
  outline: 3px solid #0066ff;
  outline-offset: 2px;
}

/* View Transitions */
::view-transition-group(*) {
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

::view-transition-old(*) {
  animation: none;
  opacity: 0;
}

::view-transition-new(*) {
  animation: none;
}

::view-transition-old(dragging),
::view-transition-new(dragging),
::view-transition-group(dragging) {
  animation: none;
}

/* Placeholder */
.drop-placeholder {
  background: rgba(0, 102, 255, 0.1);
  border: 2px dashed rgba(0, 102, 255, 0.4);
  border-radius: 8px;
  pointer-events: none;
  view-transition-name: none;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }

  [data-egg-dragging] {
    transform: none;
  }
}
```

## Next Steps

- [View Transitions Guide](./view-transitions.md) - Animation deep dive
- [Accessibility Guide](./accessibility.md) - Screen reader customization
