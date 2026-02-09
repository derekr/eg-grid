# EG Grid Guides

Welcome to the EG Grid documentation. These guides cover everything from basic setup to advanced customization.

## Getting Started

- **[Getting Started](./getting-started.md)** - Basic setup and your first drag-and-drop grid

## Core Concepts

- **[Custom Algorithms](./custom-algorithms.md)** - Build your own layout logic (swap, insert, push)
- **[Persistence](./persistence.md)** - Save and restore layout state (browser or backend)
- **[View Transitions](./view-transitions.md)** - Smooth animations with the View Transitions API
- **[Multi-Cell Items](./multi-cell-items.md)** - Items that span multiple columns/rows

## Customization

- **[Styling](./styling.md)** - Customize drag appearance, placeholders, and themes
- **[Accessibility](./accessibility.md)** - Keyboard navigation and screen reader support

## Quick Reference

### Bundles

| Bundle | Size | Includes |
|--------|------|----------|
| `eg-grid.js` | Full | Pointer + keyboard + accessibility |
| `eg-grid-minimal.js` | Minimal | Pointer only |
| `eg-grid-core.js` | Core | No plugins (BYO) |
| `algorithm-push.js` | Add-on | Push-down layout algorithm |
| `algorithm-reorder.js` | Add-on | Reorder/reflow layout algorithm |

### Events

| Event | Detail | When |
|-------|--------|------|
| `egg:drag-start` | `{ item, cell }` | Drag begins |
| `egg:drag-move` | `{ item, cell, x, y }` | Cell changes during drag |
| `egg:drag-end` | `{ item, cell }` | Drop within grid |
| `egg:drag-cancel` | `{ item }` | Escape or drop outside |

### Data Attributes

| Attribute | Purpose |
|-----------|---------|
| `data-egg-item` | Mark as draggable |
| `data-egg-label` | Screen reader label |
| `data-egg-colspan` | Column span (default: 1) |
| `data-egg-rowspan` | Row span (default: 1) |
| `data-egg-dragging` | Added during drag (auto) |
| `data-egg-dropping` | Added during drop animation (auto) |

### CSS Selectors

```css
/* Base item */
[data-egg-item] { }

/* While dragging */
[data-egg-dragging] { }

/* During drop animation */
[data-egg-dropping] { }

/* Keyboard focus */
[data-egg-item]:focus { }

/* View Transitions */
::view-transition-group(*) { }
::view-transition-old(*) { }
::view-transition-new(*) { }
::view-transition-group(dragging) { }
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your App                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐    Events     ┌─────────────────────────┐    │
│   │   EG Grid   │ ────────────► │   Your Event Handlers   │    │
│   │    Core     │               │   (Layout Algorithm)    │    │
│   └─────────────┘               └─────────────────────────┘    │
│          │                                                      │
│          │ Plugins                                              │
│          ▼                                                      │
│   ┌───────────────┬───────────────┬─────────────┐              │
│   │    Pointer    │   Keyboard    │ Accessibility│              │
│   └───────────────┴───────────────┴─────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Need Help?

- Check the [example.html](../../example.html) for a working demo
- Review the [README](../../README.md) for API reference
- Look at [thoughts/](../../thoughts/) for design decisions
