# Gridiot Guides

Welcome to the Gridiot documentation. These guides cover everything from basic setup to advanced customization.

## Getting Started

- **[Getting Started](./getting-started.md)** - Basic setup and your first drag-and-drop grid

## Core Concepts

- **[Custom Algorithms](./custom-algorithms.md)** - Build your own layout logic (swap, insert, push)
- **[View Transitions](./view-transitions.md)** - Smooth animations with the View Transitions API
- **[Multi-Cell Items](./multi-cell-items.md)** - Items that span multiple columns/rows

## Customization

- **[Styling](./styling.md)** - Customize drag appearance, placeholders, and themes
- **[Accessibility](./accessibility.md)** - Keyboard navigation and screen reader support

## Quick Reference

### Bundles

| Bundle | Size | Includes |
|--------|------|----------|
| `gridiot.js` | Full | Pointer + keyboard + accessibility |
| `gridiot-minimal.js` | Minimal | Pointer only |
| `gridiot-core.js` | Core | No plugins (BYO) |
| `algorithm-push.js` | Add-on | Push-down layout algorithm |

### Events

| Event | Detail | When |
|-------|--------|------|
| `gridiot:drag-start` | `{ item, cell }` | Drag begins |
| `gridiot:drag-move` | `{ item, cell, x, y }` | Cell changes during drag |
| `gridiot:drag-end` | `{ item, cell }` | Drop within grid |
| `gridiot:drag-cancel` | `{ item }` | Escape or drop outside |

### Data Attributes

| Attribute | Purpose |
|-----------|---------|
| `data-gridiot-item` | Mark as draggable |
| `data-gridiot-label` | Screen reader label |
| `data-gridiot-colspan` | Column span (default: 1) |
| `data-gridiot-rowspan` | Row span (default: 1) |
| `data-gridiot-dragging` | Added during drag (auto) |
| `data-gridiot-dropping` | Added during drop animation (auto) |

### CSS Selectors

```css
/* Base item */
[data-gridiot-item] { }

/* While dragging */
[data-gridiot-dragging] { }

/* During drop animation */
[data-gridiot-dropping] { }

/* Keyboard focus */
[data-gridiot-item]:focus { }

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
│   │   Gridiot   │ ────────────► │   Your Event Handlers   │    │
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
