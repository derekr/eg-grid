# Gridiot TODO

Tasks to achieve feature parity with the grid-layout.html prototype.

## High Priority

### Refactor Algorithm Plugins to Be Pure (No DOM)
**Status:** ✅ Completed
**Complexity:** Medium
**Files:** `plugins/algorithm-push.ts`, `plugins/algorithm-push-core.ts`, `engine.ts`

Currently `algorithm-push.ts` has DOM dependencies:
- Reads positions via `getComputedStyle` and `querySelectorAll`
- Writes directly to `element.style.gridColumn`
- Has built-in event listeners for drag events

Should match the prototype pattern in `grid-layout.html`:
1. Algorithm returns `ItemRect[]` layout (already done in `algorithm-push-core.ts`)
2. Caller converts result to CSS string
3. CSS injected into `<style>` tag
4. View Transitions animate the change

**Tasks:**
- [x] Extract pure algorithm to `algorithm-push-core.ts`
- [x] Add property-based tests for overlap invariant
- [x] Make `algorithm-push.ts` just re-export the core functions
- [x] Move event handling to Gridiot core or separate integration layer
- [x] Add CSS generation utility (`layoutToCSS(items, cols) → string`)
- [x] Update examples to inject CSS instead of mutating element styles

**Blocked by:** Nothing

---

### Selection State & Events
**Status:** ✅ Completed
**Complexity:** Medium
**Files:** `engine.ts`, `types.ts`, `plugins/pointer.ts`, `plugins/keyboard.ts`

The prototype tracks a `selectedItemId` with visual feedback (yellow outline). Gridiot has no selection concept.

**Tasks:**
- [x] Add `selectedItem: HTMLElement | null` to core state
- [x] Add events: `gridiot:select`, `gridiot:deselect`
- [x] Emit select on click (pointer plugin)
- [x] Emit deselect on Escape or click outside (keyboard plugin)
- [x] Add `data-gridiot-selected` attribute for CSS styling
- [ ] Document selection API in README

**Blocked by:** Nothing

---

### Keyboard Navigation
**Status:** ✅ Completed
**Complexity:** Medium-High
**Files:** `plugins/keyboard.ts`

The prototype supports full keyboard navigation:
- Shift+K enters keyboard mode
- hjkl/arrows nudge selected item
- Ctrl+nav jumps over cards
- Alt+nav selects adjacent card
- Escape deselects

**Tasks:**
- [x] Implement keyboard mode toggle (Shift+K)
- [x] Implement nudge with hjkl/arrows
- [x] Implement jump with Ctrl+nav (jumps by item size)
- [x] Implement adjacent selection with Alt+nav
- [x] Emit appropriate events for algorithm plugins to handle
- [x] Add keyboard navigation to example-advanced.html

**Blocked by:** Selection State & Events (now complete)

---

### Include Item Dimensions in Events
**Status:** ✅ Completed
**Complexity:** Low
**Files:** `plugins/pointer.ts`, `plugins/keyboard.ts`, `types.ts`

Events now include `colspan` and `rowspan` alongside `{ item, cell }`.

**Tasks:**
- [x] Add `colspan` and `rowspan` to `DragStartDetail`, `DragMoveDetail`, `DragEndDetail`
- [x] Read dimensions once at drag start and include in all events
- [x] Update types in `types.ts`
- [x] Update example-advanced.html to use event data instead of reading attributes

**Blocked by:** Nothing

---

## Medium Priority

### Algorithm Configuration
**Status:** ✅ Completed
**Complexity:** Medium
**Files:** `plugins/algorithm-push.ts`, `plugins/algorithm-push-core.ts`

The push algorithm now supports configurable options.

**Tasks:**
- [x] Define `CalculateLayoutOptions` interface in core
- [x] Update `AttachPushAlgorithmOptions` with `compaction` option
- [x] Implement `compaction: boolean` option (default: true)
- [x] `nudgeAmount` already implemented via Ctrl+nav in keyboard plugin
- [ ] Document options in README

**Blocked by:** Nothing

---

### Additional Layout Algorithms
**Status:** Files exist but not integrated
**Complexity:** Medium per algorithm
**Files:** `plugins/algorithm-*.ts`

The prototype supports 5 algorithms. Gridiot has:
- ✅ push-down (implemented)
- ⬜ reorder (file exists: `algorithm-reorder.ts`)
- ⬜ swap (file exists: `algorithm-swap.ts`)
- ⬜ insert (file exists: `algorithm-insert.ts`)
- ⬜ snap-to-gap (file exists: `algorithm-snap.ts`)

**Tasks:**
- [ ] Verify reorder algorithm works with current event model
- [ ] Verify swap algorithm works with current event model
- [ ] Verify insert algorithm works with current event model
- [ ] Verify snap-to-gap algorithm works with current event model
- [ ] Add algorithm selection example
- [ ] Document algorithm differences in README

**Blocked by:** Nothing (but keyboard navigation needs algorithm support)

---

### Item Resize Plugin
**Status:** Not started
**Complexity:** Medium-High
**Files:** `plugins/resize.ts` (new)

Allow users to resize items by dragging corners/edges. Resizes adjust colspan/rowspan.

**Core behavior:**
- Grab any corner to resize (default: all 4 corners, configurable)
- Drag to resize - smooth visual expansion during drag
- Snap to grid units (cells) on release
- Respects min/max constraints (e.g., min 1x1, max 4x4)

**UX details (to refine):**
- During drag: smooth interpolated size (not snapped)
- Visual feedback: show target size (e.g., "2×3" label or ghost outline)
- On release: snap to nearest grid unit
- Consider: magnetic snapping as you approach unit boundaries?

**Styling (customizable like placeholder):**
- Resize handles (corner/edge indicators)
- Resize preview/ghost
- Active resize state on item
- CSS classes: `.gridiot-resize-handle`, `[data-gridiot-resizing]`

**Events:**
```typescript
gridiot:resize-start  { item, originalSize: { colspan, rowspan } }
gridiot:resize-move   { item, currentSize: { colspan, rowspan }, preview: { width, height } }
gridiot:resize-end    { item, newSize: { colspan, rowspan } }
gridiot:resize-cancel { item }
```

**External trigger API:**
```typescript
const resize = attachResize(gridElement, options);

// Programmatic resize (e.g., from aspect ratio buttons)
resize.setSize(item, { colspan: 2, rowspan: 2 });

// Preset aspect ratios
resize.setAspectRatio(item, '16:9');  // Calculates best fit
resize.setAspectRatio(item, '1:1');   // Square
```

**Configuration options:**
```typescript
{
  handles: 'corners' | 'edges' | 'all',     // Which handles to show
  handleSize: 12,                            // Handle hit area in pixels
  minSize: { colspan: 1, rowspan: 1 },       // Minimum allowed size
  maxSize: { colspan: 6, rowspan: 6 },       // Maximum allowed size
  snapThreshold: 0.3,                        // Fraction of cell to trigger snap preview
  showSizeLabel: true,                       // Show "2×3" during resize
  handleClassName: 'gridiot-resize-handle',  // Custom handle styling
  core: GridiotCore                          // For provider registration
}
```

**Integration with layout:**
- On resize-end, update item's `data-gridiot-colspan`/`data-gridiot-rowspan`
- Trigger layout recalculation (push other items if needed)
- Save to layoutModel if provided (like drag does)

**Tasks:**
- [ ] Design resize handle UI (CSS-only? pseudo-elements? injected elements?)
- [ ] Implement corner detection and resize initiation
- [ ] Track resize delta and calculate new colspan/rowspan
- [ ] Smooth visual resize during drag (transform: scale or actual size?)
- [ ] Snap-to-grid logic on release
- [ ] Emit resize events
- [ ] Integrate with push algorithm (resize may cause collisions)
- [ ] External API for programmatic resize
- [ ] Aspect ratio presets
- [ ] Add to example-advanced.html with dev overlay toggle
- [ ] Handle interaction with drag (don't start drag when clicking handle)

**Decisions:**
- Use actual grid changes during resize (like drag preview), not CSS transform
- Persist only on mouseup (same pattern as drag-end)
- No built-in undo - caller manages persistence via events

**Open question:**
- How to handle resize that would cause overflow (item pushed off grid)?

**Blocked by:** Nothing

---

### Velocity-Based Physics Effects
**Status:** Not started
**Complexity:** Medium
**Files:** `plugins/pointer.ts`, `plugins/physics.ts` (new)

Apply CSS transforms to the dragged item based on velocity to give it weight/inertia - the card "sways" when being pulled quickly.

**Visual effect:**
- Moving right quickly → card tilts right (rotates clockwise)
- Moving left quickly → card tilts left (rotates counter-clockwise)
- Stopping → card settles back to neutral with easing
- Optional: slight skew for "stretching" feel

**Implementation approach:**
1. Track velocity in pointer plugin (sample-based smoothing over ~100ms window)
2. Expose `velocityX`, `velocityY` in the `'drag'` provider
3. Create physics plugin that:
   - Queries velocity from provider on each frame (or pointermove)
   - Applies `transform: rotate(Xdeg) skewX(Ydeg)` based on velocity
   - Clamps rotation to reasonable range (e.g., ±8°)
4. On drag-end: animate transform back to neutral with spring/ease-out

**Key parameters to tune:**
- `ROTATION_FACTOR = 0.01` - degrees per px/s of velocity
- `MAX_ROTATION = 8` - maximum tilt in degrees
- `SKEW_FACTOR = 0.005` - optional skew for stretch effect
- `SMOOTHING_WINDOW = 100` - ms for velocity averaging

**Tasks:**
- [ ] Add velocity tracking to pointer plugin (VelocitySample[] ring buffer)
- [ ] Expose velocityX/velocityY in 'drag' provider
- [ ] Create physics plugin with configurable parameters
- [ ] Apply transforms during drag
- [ ] Animate back to neutral on drop
- [ ] Add to example-advanced.html with toggle in dev overlay

**Blocked by:** Nothing

---

### Viewport Camera / Auto-Scroll
**Status:** ✅ Completed
**Complexity:** Medium-High
**Files:** `plugins/camera.ts`

Camera plugin that handles viewport scrolling to keep active items visible.

**Features implemented:**
1. **Edge scroll during drag:** Auto-scroll when pointer is near viewport edges
2. **Keyboard nav scroll:** Scroll to keep item visible after nudge/move
3. **Selection scroll:** Scroll to show newly selected items

**CSS-first approach:**
- Uses CSS `scroll-margin` on items for positioning (e.g., `scroll-margin: 25vh 10vw`)
- JS just calls `scrollIntoView({ block: 'nearest' })` - browser handles math
- Edge detection for pointer drag uses JS `scrollBy()` with velocity

**Plugin coordination:**
- Registers `'camera'` provider with `{ isScrolling, mode }` state
- Algorithm plugin queries `isScrolling` to defer layout updates during scroll
- Emits `gridiot:camera-settled` event when scrolling stops (after settle delay)
- Algorithm tracks `pendingCell` during scroll, applies on settle or clears when normal drag resumes

**Configuration options:**
```typescript
{
  mode: 'contain' | 'center' | 'off',
  edgeSize: 80,        // pixels from edge to trigger scroll
  scrollSpeed: 12,     // pixels per frame
  scrollMargin: 64,    // JS-side margin (CSS scroll-margin preferred)
  settleDelay: 50,     // ms after scroll stops before 'settled'
  scrollOnSelect: true,
  autoScrollOnDrag: true,
  core: GridiotCore    // for provider registration
}
```

**Timing:**
- Keyboard nudge: 100ms delay before scroll (wait for view transition)
- Edge scroll settle: 50ms delay before `camera-settled` event

**Blocked by:** Nothing

---

### Normalize Pointer/Keyboard Events
**Status:** Not started
**Complexity:** Medium
**Files:** `plugins/pointer.ts`, `plugins/keyboard.ts`, possibly new event types

Currently keyboard navigation emits drag events (`drag-start`, `drag-end`) to reuse layout algorithm integration. This has downsides:
- Keyboard "nudge" emits drag-start then immediately drag-end (no ongoing drag state)
- Camera plugin uses `sawPointerMove` flag to distinguish keyboard vs pointer
- Conceptually, keyboard nav is selection/movement, not "dragging"

**Goals:**
- Clean separation: drag events for actual dragging, move events for keyboard
- Algorithm plugins can listen to both event types
- Camera plugin doesn't need heuristics to detect input type

**Possible approaches:**

1. **Separate event types:**
   ```typescript
   // Pointer drag (ongoing)
   gridiot:drag-start, gridiot:drag-move, gridiot:drag-end

   // Keyboard movement (instant)
   gridiot:item-move { item, fromCell, toCell, trigger: 'keyboard' | 'pointer' }
   ```

2. **Unified move event with metadata:**
   ```typescript
   gridiot:move {
     item, fromCell, toCell,
     source: 'pointer' | 'keyboard',
     isPreview: boolean  // true during drag, false on final position
   }
   ```

3. **Keep current events, add metadata:**
   ```typescript
   // Add to existing events
   drag-start { ..., source: 'pointer' | 'keyboard' }
   drag-end { ..., source: 'pointer' | 'keyboard' }
   ```

**Considerations:**
- Backward compatibility with existing algorithm plugins
- Don't over-engineer - current approach works, just has mild code smell
- May not be worth the churn if current workarounds are acceptable

**Tasks:**
- [ ] Document current event semantics clearly
- [ ] Decide if normalization is worth the breaking change
- [ ] If yes: design new event model
- [ ] If yes: migrate plugins and examples
- [ ] If no: document `sawPointerMove` pattern as intentional

**Blocked by:** Nothing (low priority, current approach works)

---

### Backend Algorithm Delegation (Datastar/HTMX Integration)
**Status:** Not started
**Complexity:** Medium-High
**Files:** New plugin or algorithm adapter

Explore delegating layout calculation to a backend server. Use case: complex algorithms, server-side state, or hypermedia-driven UIs (Datastar, HTMX).

**Concept:**
Instead of calculating layout in JS, send current state to backend and receive new layout:

```
User drags item
      │
      ▼
┌─────────────┐   POST /layout          ┌─────────────┐
│ Client sends│ ──────────────────────► │   Server    │
│ drag event  │   { items, draggedId,   │  calculates │
│             │     targetCell }        │  new layout │
└─────────────┘                         └─────────────┘
      ▲                                       │
      │   HTML fragment or JSON               │
      └───────────────────────────────────────┘
            Apply layout (CSS or DOM swap)
```

**Possible implementations:**

1. **Algorithm plugin that fetches:**
   ```typescript
   attachRemoteAlgorithm(gridElement, {
     endpoint: '/api/layout',
     onDragMove: async (items, targetCell) => {
       const response = await fetch('/api/layout', {
         method: 'POST',
         body: JSON.stringify({ items, targetCell })
       });
       return response.json(); // ItemRect[]
     }
   });
   ```

2. **Datastar integration:**
   - Use Datastar signals for drag state
   - Backend returns new layout as HTML partial
   - View Transitions handle animation

3. **HTMX integration:**
   - Trigger HTMX request on drag-end
   - Backend returns updated grid HTML
   - HTMX swaps content

**Benefits:**
- Server can use complex algorithms (constraint solvers, ML)
- Single source of truth for collaborative editing
- Works with hypermedia architecture
- Client stays thin

**Challenges:**
- Latency (need optimistic updates or debouncing)
- Offline support
- Preview during drag (may need client-side approximation)

**Tasks:**
- [ ] Create proof-of-concept with simple fetch-based algorithm
- [ ] Explore Datastar signal binding for drag state
- [ ] Explore HTMX hx-trigger on gridiot events
- [ ] Document integration patterns
- [ ] Consider SSE/WebSocket for real-time collaborative layout

**Blocked by:** Nothing (exploratory)

---

### Placeholder Plugin
**Status:** ✅ Completed
**Complexity:** Medium
**Files:** `plugins/placeholder.ts`

The drop placeholder is now a reusable plugin that:
- Ensures consistent behavior across examples
- Coordinates with View Transitions (disables view-transition-name by default)
- Reduces boilerplate in consuming code

**Tasks:**
- [x] Create `plugins/placeholder.ts`
- [x] Listen to drag-start, drag-move, drag-end, drag-cancel
- [x] Create/update/remove placeholder element
- [x] Handle item dimensions from events
- [x] Export `attachPlaceholder(gridElement)` function
- [x] Update example-advanced.html to use plugin
- [x] Add to build (separate bundle)
- [ ] Add to default bundle (optional, for now it's a separate import)

**Blocked by:** Nothing

---

### Predictive Placeholder Projection
**Status:** ✅ Completed
**Complexity:** Medium
**Files:** `plugins/pointer.ts`

The placeholder now leads ahead of the dragged item in the direction of movement, making placement feel more intuitive.

**Implementation approach:** Cumulative direction offset
- Track total movement from drag start (cumulative dx/dy)
- When movement exceeds threshold (30px), apply a lead offset (0.5 cells) in that direction
- Offset is applied to the effective center used for cell calculation
- Both drag-move events AND drag-end use the same offset, ensuring placeholder matches drop position

**Key parameters:**
- `PREDICTION_THRESHOLD = 30` - pixels of movement before prediction activates
- `PREDICTION_LEAD = 0.5` - fraction of cell to lead ahead

**Why this works (vs. previous attempt):**
1. **No oscillation:** Uses cumulative movement, not instantaneous velocity
2. **Accuracy:** Same offset applies to both placeholder and drop position
3. **Direction-aware:** Only leads in the direction you're actually moving

**Playwright tests added:**
- `tests/drag-placeholder.spec.ts` - accuracy tests (placeholder matches drop)
- `tests/predictive-placeholder.spec.ts` - lead amount verification
- `tests/edge-cases.spec.ts` - direction reversal, diagonal, jitter, boundary

**Blocked by:** Nothing

---

### Dev Overlay Plugin (Debug + Config)
**Status:** ✅ Completed
**Complexity:** Medium
**Files:** `plugins/dev-overlay.ts`

Combined debug and config overlay with tabs:
- Debug tab: Grid info, item positions, event log
- Config tab: Toggle options, action buttons

**Tasks:**
- [x] Create `plugins/dev-overlay.ts` with tabbed UI
- [x] Debug tab: grid info, items list, live event log
- [x] Config tab: boolean toggles, action buttons
- [x] Plugin registration API (`registerOption`)
- [x] Toggle via Shift+D keyboard shortcut
- [x] Integrated into example-advanced.html
- [x] Provider integration (shows drag/layout state from providers)
- [x] View transition z-index fix (uses view-transition-name + ::view-transition-group)
- [ ] Grid lines visual overlay (future enhancement)
- [ ] Persist settings to localStorage (future enhancement)
- [ ] Explore popover/dialog for top-layer rendering (attempted, needs more work)

**Blocked by:** Nothing

---

## Lower Priority

### Responsive Column Reflow
**Status:** ✅ Core Implementation Complete
**Complexity:** High
**Files:** `layout-model.ts`, `plugins/responsive.ts`, `plugins/algorithm-push.ts`

The prototype uses container queries to support different column counts with:
- Canonical layout (source of truth at max columns)
- Per-column-count layout overrides
- Auto-derived layouts for other column counts

**Tasks:**
- [x] Design responsive layout data model (`layout-model.ts`)
- [x] Implement container query detection (`plugins/responsive.ts`)
- [x] Implement layout derivation algorithm (first-fit compaction)
- [x] Implement layout override storage (per-column-count maps)
- [x] Generate CSS for all breakpoints (container queries)
- [x] Integrate with algorithm-push (saves to layout model on drag-end)
- [ ] Document responsive usage in README
- [ ] Add example-responsive.html demo
- [ ] Test with actual browser resizing

**Architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│  createLayoutModel()     │  attachResponsive()                  │
│  - Canonical positions   │  - ResizeObserver                    │
│  - Per-column overrides  │  - CSS injection                     │
│  - Layout derivation     │  - Column count detection            │
│  - CSS generation        │  - Provider registration             │
├─────────────────────────────────────────────────────────────────┤
│  attachPushAlgorithm()                                          │
│  - Drag event handling                                          │
│  - Preview CSS during drag                                      │
│  - Saves to layoutModel on drag-end (if provided)              │
└─────────────────────────────────────────────────────────────────┘
```

**Blocked by:** Nothing (core complete, needs documentation and testing)

---

### Body Drag State Class
**Status:** ✅ Completed
**Complexity:** Low
**Files:** `plugins/pointer.ts`

The `is-dragging` class is added to `document.body` during drag to allow CSS like `body.is-dragging { user-select: none; }`.

**Tasks:**
- [x] Add `document.body.classList.add('is-dragging')` on drag start
- [x] Remove class on drag end/cancel
- [ ] Document CSS class in README

**Blocked by:** Nothing

---

### Manual Compact Action
**Status:** Not started
**Complexity:** Low
**Files:** `plugins/algorithm-push.ts`

The prototype has a "Compact Now" button and C key shortcut.

**Tasks:**
- [ ] Export `compact()` function from algorithm plugin
- [ ] Emit `gridiot:compact` event after compaction
- [ ] Handle C key in keyboard plugin (when compaction is manual)

**Blocked by:** Algorithm Configuration (compaction toggle)

---

## Completed

- [x] Multi-cell item support (colspan/rowspan)
- [x] Push-down collision algorithm
- [x] Compaction (automatic)
- [x] View Transitions for smooth animations
- [x] FLIP animation for dropped item
- [x] Hysteresis for stable cell targeting
- [x] Cell clamping for multi-cell items at grid edges
- [x] Drop outside grid uses last valid position
- [x] Selection state with visual feedback
- [x] Keyboard navigation (Shift+K mode, hjkl/arrows, Ctrl+jump, Alt+select)
- [x] Item dimensions (colspan/rowspan) included in all drag events
- [x] Body `is-dragging` class during drag
- [x] Algorithm configuration (`compaction` option)
- [x] Dev overlay plugin (debug + config tabs, Shift+D)
- [x] Placeholder plugin (reusable drop target indicator)
- [x] Provider registry for inter-plugin communication
- [x] Predictive placeholder (leads ahead in movement direction)
- [x] Camera plugin (auto-scroll, edge detection, CSS scroll-margin)

---

## Notes

### Event Model Comparison

**Current Gridiot events:**
```typescript
gridiot:drag-start     { item: HTMLElement, cell: GridCell, colspan: number, rowspan: number }
gridiot:drag-move      { item: HTMLElement, cell: GridCell, x: number, y: number, colspan: number, rowspan: number }
gridiot:drag-end       { item: HTMLElement, cell: GridCell, colspan: number, rowspan: number }
gridiot:drag-cancel    { item: HTMLElement }
gridiot:select         { item: HTMLElement }
gridiot:deselect       { item: HTMLElement | null }
gridiot:camera-settled { }  // Emitted by camera plugin after scroll stops + settle delay
```

**Planned additions:**
```typescript
gridiot:compact        { }  // Manual compaction trigger (not yet)
gridiot:item-move      { item, fromCell, toCell, source: 'pointer' | 'keyboard' }  // Unified move event (proposed)
gridiot:resize-start   { item, originalSize: { colspan, rowspan } }
gridiot:resize-move    { item, currentSize: { colspan, rowspan }, preview: { width, height } }
gridiot:resize-end     { item, newSize: { colspan, rowspan } }
gridiot:resize-cancel  { item }
```

### Architecture Decisions Needed

1. **Selection state ownership:** Should selection state live in core or be a plugin?
   - Pro core: Simpler coordination between plugins
   - Pro plugin: Keeps core minimal

2. **Responsive layout approach:**
   - CSS-driven (container queries) vs JS-driven (resize observer)
   - Where to store layout overrides (memory vs localStorage vs callback)

3. **Algorithm plugin interface:**
   - Should algorithms be swappable at runtime?
   - How to handle different algorithms for drag vs keyboard?
