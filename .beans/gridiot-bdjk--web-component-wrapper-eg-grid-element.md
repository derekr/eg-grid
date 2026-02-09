---
# gridiot-bdjk
title: Web component wrapper (<eg-grid> element)
status: completed
type: feature
priority: normal
created_at: 2026-02-09T16:34:05Z
updated_at: 2026-02-09T18:31:52Z
blocked_by:
    - gridiot-cb6c
---

Create a web component wrapper for the grid library (renamed to eg-grid / End Game Grid).

## Design

### Element: `<eg-grid>`

- No Shadow DOM (items need parent page CSS, View Transitions are document-scoped)
- Element IS the grid container — sets display: grid and container-type: inline-size on itself
- Items stay as regular elements with data-eg-item attribute

### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| columns | number | (from CSS) | Max columns / canonical layout size |
| cell-size | number | — | Cell size in px (responsive breakpoints) |
| gap | number | — | Gap in px |
| algorithm | push/reorder/none | push | Layout algorithm |
| compaction | boolean | absent | Compact items upward after drag |
| resize-handles | corners/edges/all | absent (no resize) | Enable resize |
| no-camera | boolean | absent | Disable auto-scroll |
| no-placeholder | boolean | absent | Disable drop placeholder |
| no-keyboard | boolean | absent | Disable keyboard navigation |
| no-accessibility | boolean | absent | Disable ARIA announcements |
| placeholder-class | string | — | CSS class for placeholder element |

### JS Properties

- core: GridiotCore | null (escape hatch to full JS API)
- layoutModel: ResponsiveLayoutModel | null

### connectedCallback Flow

1. Create managed style element
2. Inject base CSS: eg-grid { display: grid; container-type: inline-size; }
3. Read [data-eg-item] children → build item definitions + positions
4. If columns attribute set → createLayoutModel() for responsive
5. Auto-setup items: set tabindex, clear inline grid-column/grid-row
6. Build InitOptions from attributes → call init(this, options)
7. Start MutationObserver { childList: true } for React compat

### Bundle Structure

- dist/eg-grid.js — JS API only
- dist/eg-grid-element.js — web component (self-contained, includes JS API)

## Todo

- [ ] Rename project: gridiot → eg-grid (file refs, data attributes, events, CSS selectors)
- [ ] Create eg-grid-element.ts with GridElement class
- [ ] Create bundles/element.ts entry point
- [ ] Add element entry to build.ts
- [ ] Create examples/web-component.html demo
- [ ] Update nav links in existing examples
- [ ] Verify build + bundle sizes


## Summary of Changes

Implemented `<eg-grid>` web component wrapper that lets users create fully interactive CSS Grid drag-and-drop layouts with zero JavaScript — just HTML attributes.

### Files Created
- **`eg-grid-element.ts`** — `EgGridElement` custom element class
- **`bundles/element.ts`** — Bundle entry point (re-exports everything + auto-registers element)
- **`examples/web-component.html`** — Demo page with 8 items, push algorithm, resize handles, responsive reflow

### Files Modified
- **`build.ts`** — Added `eg-grid-element` bundle entry
- **`examples/index.html`** — Added "Web Component" nav link
- **`examples/advanced.html`** — Added "Web Component" nav link

### Key Design Decisions
- **No Shadow DOM** — items need parent CSS, View Transitions are document-scoped
- **Sets `container-type: inline-size` on parent** — container queries can't target self, so the parent becomes the container context
- **Auto-sets `id` and `data-id` on items** — needed for CSS `#id` selectors used by responsive plugin and algorithm harness
- **MutationObserver filters by `data-egg-item`** — ignores internal DOM changes (style elements, placeholders, aria-live regions) to prevent spurious re-init during drag/resize
- **Responsive mode skips inline `grid-template-columns`** — inline styles can't be overridden by `@container` rules, so responsive mode lets CSS injection handle it

### Bundle Size
- `eg-grid-element.min.js`: 40.3 KB (12.4 KB gzipped) — adds ~900 bytes gzip over the base bundle
