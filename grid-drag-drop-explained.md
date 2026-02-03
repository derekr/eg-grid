# CSS Grid Drag & Drop with View Transitions

## The Problem: Making Grid Rearrangement Feel Natural

Imagine you have a dashboard with several cards of different sizes arranged in a grid. When a user drags one card to a new position, several things need to happen:

1. **The dragged card** should follow the cursor smoothly
2. **Other cards** need to move out of the way to make room
3. **When dropped**, the card should animate from where the cursor released it to its final grid position
4. **All movements** should feel smooth and predictable, not jarring

This sounds simple, but it's actually a complex choreography of animations and layout calculations.

## The Technologies

### CSS Grid

CSS Grid is a layout system that lets you arrange elements in rows and columns. Unlike older techniques, Grid lets you:

- Place items at specific row/column positions
- Have items span multiple rows or columns
- Automatically handle spacing (gaps) between items

```css
.grid-container {
	display: grid;
	grid-template-columns: repeat(6, 184px); /* 6 columns */
	grid-template-rows: repeat(10, 184px); /* 10 rows */
	gap: 16px; /* spacing */
}

.card {
	grid-column: 1 / span 2; /* Start at column 1, span 2 columns */
	grid-row: 1 / span 2; /* Start at row 1, span 2 rows */
}
```

**Why Grid?** It gives us precise control over where items sit and how much space they occupy, which is essential for a dashboard layout.

### View Transitions API

The View Transitions API is a browser feature that automatically animates changes between two states of your page. Instead of manually calculating animations, you tell the browser "something changed" and it figures out how to smoothly transition.

```javascript
document.startViewTransition(() => {
	// Make your DOM changes here
	updateTheLayout();
});
```

The browser:

1. Takes a "screenshot" of the current state
2. Runs your update function
3. Takes a "screenshot" of the new state
4. Automatically animates between them

**Why View Transitions?** When you move a card, many other cards might need to shift. Manually animating each one would be complex. View Transitions handles all of this automatically.

### The FLIP Technique

FLIP stands for **F**irst, **L**ast, **I**nvert, **P**lay. It's a performance-friendly way to animate elements:

1. **First**: Record the element's starting position
2. **Last**: Make your DOM changes, then record the ending position
3. **Invert**: Calculate the difference and use CSS transform to visually move the element back to its starting position
4. **Play**: Animate the transform back to zero (the element appears to move from start to end)

```javascript
// FIRST: Where is it now?
const firstRect = element.getBoundingClientRect();

// Make DOM changes...
updateLayout();

// LAST: Where did it end up?
const lastRect = element.getBoundingClientRect();

// INVERT: Calculate the difference
const deltaX = firstRect.left - lastRect.left;
const deltaY = firstRect.top - lastRect.top;

// PLAY: Animate from "inverted" position to final position
element.animate(
	[
		{ transform: `translate(${deltaX}px, ${deltaY}px)` },
		{ transform: 'translate(0, 0)' },
	],
	{ duration: 200 },
);
```

**Why FLIP?** It's fast because transforms are GPU-accelerated and don't cause layout recalculations during animation.

## The Challenge: Combining These Technologies

Here's where it gets tricky. During a drag operation:

1. The dragged card is **removed from the grid flow** and follows the cursor using `position: fixed`
2. Other cards are still **in the grid** and need to animate when the layout changes
3. On drop, we need to animate the card **from its cursor position to its grid position**

### The View Transitions Limitation

View Transitions captures elements based on their **layout position**, not their visual position. When a card has `position: fixed` and is following the cursor, the View Transitions API doesn't "see" it at the cursor location—it sees where it _would be_ in the document flow.

This means if we rely solely on View Transitions for the drop animation, the card appears to jump from its original grid position (not the cursor) to its new position.

### The Solution: Hybrid Approach

We use **both** techniques:

| Element         | Animation Technique | Why                                                                                |
| --------------- | ------------------- | ---------------------------------------------------------------------------------- |
| Dragged card    | Manual FLIP         | View Transitions can't capture `position: fixed` elements at their visual position |
| All other cards | View Transitions    | Automatic, smooth animations as they reflow                                        |

```javascript
// Exclude the dropped card from View Transitions
droppedElement.style.viewTransitionName = 'none';

// Capture cursor position BEFORE changes
const cursorPosition = droppedElement.getBoundingClientRect();

// Let View Transitions handle other cards
document.startViewTransition(() => {
	updateLayout();
});

// Manually animate dropped card from cursor to grid
requestAnimationFrame(() => {
	const gridPosition = droppedElement.getBoundingClientRect();

	// FLIP animation from cursor to grid
	droppedElement.animate(
		[
			{
				transform: `translate(${cursorPosition.left - gridPosition.left}px,
                            ${cursorPosition.top - gridPosition.top}px)`,
			},
			{ transform: 'translate(0, 0)' },
		],
		{ duration: 200 },
	);
});
```

## The Layout Algorithm

When a card is dragged to a new position, we need to figure out where all the other cards should go. Our algorithm uses a "push-down cascade":

### The Rules

1. **The dragged card wins** - it goes exactly where the user wants
2. **Colliding cards move down** - if a card is in the way, push it down (keep its horizontal position)
3. **Cascade the pushes** - if pushing a card down causes another collision, push that card down too
4. **Compact upward** - after resolving collisions, move cards up to fill gaps (gravity)

### Why "Push Down" Instead of "Swap"?

Early versions tried to swap positions, but this felt unpredictable. Users couldn't anticipate where cards would end up. The push-down approach is more intuitive:

- Cards only move vertically when displaced
- The horizontal layout stays stable
- Users can predict where cards will land

### Preserving Original Positions

A key insight: we always calculate the new layout **from the original positions** (before the drag started), not from intermediate states. This prevents "drift" where cards gradually move further from where they started during a drag.

```javascript
// At drag start, save everyone's position
const originalPositions = new Map();
items.forEach((item) => {
	originalPositions.set(item.id, { x: item.x, y: item.y });
});

// During drag, always calculate from originals
function calculateNewLayout(draggedId, targetPosition) {
	// Start from original positions, not current
	const layout = items.map((item) => ({
		...item,
		...originalPositions.get(item.id),
	}));

	// Then apply the drag and resolve collisions
	// ...
}
```

## Visual Feedback During Drag

To help users understand where a card will land, we show:

1. **Drop placeholder** - a dashed outline at the target grid position
2. **Live reflow** - other cards animate to their new positions as you drag
3. **The dragged card** - follows the cursor with a shadow effect

This immediate feedback helps users develop an intuition for how the grid will rearrange.

## Making It Feel Natural: UX Refinements

The algorithms above handle the mechanics, but making drag-and-drop _feel_ good requires attention to subtle details. These refinements address the gap between "technically correct" and "intuitively right."

### The Drop Target Problem

When converting cursor position to a grid cell, a naive approach uses the raw cursor coordinates:

```javascript
// Naive: cursor position determines target
const targetX = Math.floor(cursorX / cellSize);
const targetY = Math.floor(cursorY / cellSize);
```

This creates a problem: if you grab a card from its bottom-right corner and drag left, the cursor is at the bottom-right of the card, but the drop target is calculated as if the cursor _is_ the card. The target feels "late" - it doesn't change until the cursor crosses the boundary, even though the card visually crossed much earlier.

### Solution: Direction-Aware Weighted Targeting

Instead of using the cursor position, we calculate a **reference point on the card** that shifts based on drag direction. When moving fast in a direction, we bias toward the leading edge:

```javascript
// Track velocity
const vx = (currentX - lastX) / deltaTime;
const vy = (currentY - lastY) / deltaTime;

// Weight from 0.25 (leading edge) to 0.75 (trailing edge)
// tanh provides smooth mapping from velocity to weight
const WEIGHT_SENSITIVITY = 50;
const weightX = 0.5 - Math.tanh(vx * WEIGHT_SENSITIVITY) * 0.25;
const weightY = 0.5 - Math.tanh(vy * WEIGHT_SENSITIVITY) * 0.25;

// Calculate reference point on card
const targetPointX = cardLeft + cardWidth * weightX;
const targetPointY = cardTop + cardHeight * weightY;
```

**How it works:**

| Drag Direction | Weight | Reference Point                |
| -------------- | ------ | ------------------------------ |
| Stationary     | 0.5    | Card center                    |
| Moving left    | ~0.25  | 25% from left edge             |
| Moving right   | ~0.75  | 75% from left (25% from right) |

This means the drop target changes _earlier_ in the direction you're moving, which matches user expectation. The card appears to "push into" the new cell rather than "trailing behind" the cursor.

**Why `tanh`?** The hyperbolic tangent function smoothly maps any velocity to a value between -1 and 1, providing natural easing. Low velocities stay near center (0.5), high velocities asymptotically approach the edges (0.25 or 0.75).

### Hysteresis: Preventing Flicker

When the cursor hovers near a cell boundary, small movements can cause the target to rapidly alternate between cells. This "flickering" is jarring and makes precise placement difficult.

**Hysteresis** adds "stickiness" to the current target. Once a target is selected, the cursor must move significantly further to change it:

```javascript
const HYSTERESIS = 0.4; // grid units

function pixelToGridCoords(pixelX, pixelY, currentTarget) {
	const fracX = pixelX / cellWithGap;
	const fracY = pixelY / cellWithGap;

	let targetX = Math.floor(fracX);
	let targetY = Math.floor(fracY);

	// Apply hysteresis - stick to current target unless significantly closer to new one
	if (currentTarget) {
		const currentCenterX = currentTarget.x + 0.5;
		const currentCenterY = currentTarget.y + 0.5;

		const distToCurrent = Math.hypot(
			fracX - currentCenterX,
			fracY - currentCenterY,
		);

		// Stay with current if within hysteresis zone
		if (distToCurrent < 0.5 + HYSTERESIS) {
			const newCenterX = targetX + 0.5;
			const newCenterY = targetY + 0.5;
			const distToNew = Math.hypot(fracX - newCenterX, fracY - newCenterY);

			// Only switch if new target is significantly closer
			if (!(distToNew < distToCurrent - HYSTERESIS)) {
				return currentTarget; // Keep current
			}
		}
	}

	return { x: targetX, y: targetY };
}
```

**The effect:** The target only changes when the user clearly intends to move to a new cell, not when they're hovering near a boundary.

### Grab Offset Preservation

When you grab a card, the visual card should maintain its position relative to the cursor. If you click the bottom-right corner, that corner should stay under the cursor throughout the drag:

```javascript
// On mousedown: capture where on the card was clicked
const rect = element.getBoundingClientRect();
const offsetX = event.clientX - rect.left;
const offsetY = event.clientY - rect.top;

// On mousemove: position card accounting for offset
const newLeft = event.clientX - offsetX;
const newTop = event.clientY - offsetY;
element.style.left = `${newLeft}px`;
element.style.top = `${newTop}px`;
```

This is standard practice, but it's essential for the weighted targeting to work correctly - the card's actual position (not cursor position) feeds into the target calculation.

### Preventing Text Selection (Cross-Browser)

During drag operations, browsers may interpret mouse movement as text selection, especially in Safari. This requires multiple layers of prevention:

**CSS Layer:**

```css
.grid-item {
	user-select: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none; /* Prevents iOS callout */
}

/* Applied to body during drag */
body.is-dragging,
body.is-dragging * {
	user-select: none;
	-webkit-user-select: none;
	cursor: grabbing;
}
```

**JavaScript Layer:**

```javascript
function handleMouseDown(e) {
	e.preventDefault(); // Stop selection from starting
	document.body.classList.add('is-dragging');
	// ... drag setup
}

function handleMouseUp(e) {
	document.body.classList.remove('is-dragging');
	// ... drag cleanup
}
```

The combination ensures no text selection occurs regardless of browser or how aggressively the user drags.

## Tuning Parameters

Several constants control the feel of the drag interaction:

| Parameter            | Default   | Effect                                             |
| -------------------- | --------- | -------------------------------------------------- |
| `HYSTERESIS`         | 0.4       | Higher = more sticky targets, less flicker         |
| `WEIGHT_SENSITIVITY` | 50        | Higher = faster shift to leading edge              |
| Weight range         | 0.25-0.75 | Narrower = more centered, wider = more edge-biased |

These can be tuned based on grid cell size and desired responsiveness. Larger cells may benefit from higher hysteresis; faster-paced interfaces may want higher weight sensitivity.

## Responsive Layout: CSS-First Approach

A key architectural decision is how to handle different viewport sizes. Rather than recalculating layouts in JavaScript on every resize, we use a **CSS-first approach** where all possible layouts are pre-computed and injected as CSS container queries.

### The Problem with JS-Based Resize Handling

A naive approach might use a ResizeObserver to detect viewport changes and recalculate positions:

```javascript
// Naive: JS recalculates on every resize
resizeObserver.observe(grid);
// -> detect column count change
// -> recalculate all positions
// -> re-render items
```

This has downsides:

- JavaScript runs on every resize frame
- Layout calculations block the main thread
- Harder to server-render responsive layouts

### The Solution: Pre-computed CSS Container Queries

Instead, we compute layouts for ALL possible column counts once, then inject them as CSS:

```javascript
function generateLayoutCSS() {
	const cssRules = [];

	for (let cols = MAX_COLS; cols >= 1; cols--) {
		const positions = getLayoutForColumns(cols);
		const minWidth = cols * CELL_SIZE + (cols - 1) * GAP;

		cssRules.push(`@container (min-width: ${minWidth}px) {`);
		cssRules.push(
			`  .grid-container { grid-template-columns: repeat(${cols}, 1fr); }`,
		);

		for (const item of items) {
			const pos = positions[item.id];
			cssRules.push(
				`  #${item.id} { grid-column: ${pos.x + 1} / span ${item.w}; grid-row: ${pos.y + 1} / span ${item.h}; }`,
			);
		}

		cssRules.push('}');
	}

	document.getElementById('layout-styles').textContent = cssRules.join('\n');
}
```

### Breakpoint Calculation

Breakpoints are derived from grid geometry. For a cell size of 184px and gap of 16px:

| Columns | Min Width Formula | Min Width |
| ------- | ----------------- | --------- |
| 6       | 6×184 + 5×16      | 1184px    |
| 5       | 5×184 + 4×16      | 984px     |
| 4       | 4×184 + 3×16      | 784px     |
| 3       | 3×184 + 2×16      | 584px     |
| 2       | 2×184 + 1×16      | 384px     |
| 1       | (default)         | < 384px   |

### Generated CSS Structure

The injected CSS uses container queries for responsive switching:

```css
/* 6 columns (canonical) */
@container (min-width: 1184px) {
	.grid-container {
		grid-template-columns: repeat(6, 1fr);
	}
	#item-1 {
		grid-column: 1 / span 2;
		grid-row: 1 / span 2;
	}
	#item-2 {
		grid-column: 3 / span 2;
		grid-row: 1;
	}
	/* ... */
}

/* 5 columns (derived) */
@container (min-width: 984px) and (max-width: 1183px) {
	.grid-container {
		grid-template-columns: repeat(5, 1fr);
	}
	#item-1 {
		grid-column: 1 / span 2;
		grid-row: 1 / span 2;
	}
	/* positions recalculated for 5 columns */
}

/* ... down to 1 column */
```

### Lazy Layout Overrides

Users can customize layouts at specific column counts. The system uses:

1. **Canonical layout** - the "source of truth" at maximum columns
2. **Derived layouts** - automatically computed for fewer columns using the compaction algorithm
3. **Override layouts** - stored only when user explicitly drags at that column count

```javascript
// Data model
const canonicalPositions = { 'item-1': {x: 0, y: 0}, ... };  // 6-column layout
const layoutOverrides = {
  4: { 'item-1': {x: 0, y: 0}, ... },  // User customized 4-column layout
  // 5, 3, 2, 1 columns: auto-derived from canonical
};
```

When generating CSS:

- Check if override exists for column count → use it
- Otherwise → derive from canonical using compaction algorithm

### When CSS is Regenerated

CSS is injected only when layout data changes:

- **On page load** - generate CSS for all column counts
- **On drop** - if positions changed, regenerate CSS
- **On keyboard move** - same as drop

Resize events do NOT trigger CSS regeneration - the container queries handle layout switching purely in CSS.

### Benefits

| Aspect             | JS-Based Resize     | CSS-First                       |
| ------------------ | ------------------- | ------------------------------- |
| Resize performance | JS runs each frame  | Pure CSS, zero JS               |
| Server rendering   | Requires hydration  | Can pre-render CSS              |
| Layout persistence | Runtime state       | Can serialize to CSS            |
| Animation          | Manual coordination | View Transitions work naturally |

### Enabling Container Queries

The grid must be wrapped in a container query context:

```html
<div class="grid-wrapper">
	<div class="grid-container" id="grid">
		<!-- items -->
	</div>
</div>
```

```css
.grid-wrapper {
	container-type: inline-size;
}
```

This allows `@container` queries to respond to the wrapper's width rather than the viewport.

## CSS Injection for Drag Preview

A key architectural insight is that **the grid should always be driven by CSS**, even during drag operations. This makes View Transitions more reliable because both "before" and "after" states are CSS-positioned.

### The Problem with Inline Styles

An earlier approach set inline styles during drag:

```javascript
// During drag: set inline styles per element
element.style.gridColumn = `${x + 1} / span ${w}`;
element.style.gridRow = `${y + 1} / span ${h}`;

// On drop: clear inline styles, let CSS take over
element.style.gridColumn = '';
element.style.gridRow = '';
```

This caused issues:

- View Transitions might capture items mid-animation from a previous transition
- Inline styles have different specificity than CSS rules
- Two different positioning mechanisms (inline vs CSS) with potential mismatches

### The Solution: Dual Style Elements

Instead, we use two `<style>` elements:

```html
<!-- Generated layout CSS - positions for each column count -->
<style id="layout-styles"></style>
<!-- Preview CSS during drag - higher specificity -->
<style id="preview-styles"></style>
```

**During drag:** Inject preview positions into `preview-styles`
**After drop:** Clear `preview-styles`, `layout-styles` takes over

### Specificity Trick

Preview styles use a higher-specificity selector:

```javascript
function generatePreviewCSS(layout, cols) {
	const rules = [];
	for (const item of layout) {
		// :not(.dragging) adds specificity without changing behavior
		rules.push(
			`#${item.id}:not(.dragging) {
				grid-column: ${item.x + 1} / span ${item.w};
				grid-row: ${item.y + 1} / span ${item.h};
			}`,
		);
	}
	return rules.join('\n');
}
```

| Selector                 | Specificity |
| ------------------------ | ----------- |
| `#item-1`                | 0,1,0,0     |
| `#item-1:not(.dragging)` | 0,1,1,0     |

The preview CSS always wins, ensuring items show at preview positions during drag.

### Benefits

| Aspect                | Inline Styles            | CSS Injection            |
| --------------------- | ------------------------ | ------------------------ |
| View Transitions      | May capture mid-flight   | Consistent CSS states    |
| Mental model          | Two systems (inline+CSS) | Single system (CSS)      |
| Debugging             | Check inline + CSS       | Just inspect stylesheets |
| Animation reliability | Timing-dependent         | CSS → CSS is predictable |

### Code Flow

```
Normal state:
  layout-styles (container queries) → items positioned by CSS

During drag:
  1. Calculate preview layout
  2. injectPreviewCSS(previewLayout)
  3. View Transition animates to new CSS state

On drop:
  1. Update canonicalPositions/layoutOverrides
  2. Regenerate layout-styles
  3. clearPreviewCSS()
  4. View Transition: preview CSS → layout CSS
     (Same positions, so non-dragged items don't move)
  5. FLIP animation for dropped element (cursor → grid)
```

## Summary

| Concept                  | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| CSS Grid                 | Precise layout control for dashboard cards    |
| View Transitions         | Automatic smooth animations when cards reflow |
| FLIP Animation           | Smooth drop animation from cursor to grid     |
| Push-down cascade        | Predictable collision resolution              |
| Original positions       | Prevent layout drift during drag              |
| Drop placeholder         | Visual feedback for target position           |
| **Weighted targeting**   | **Drop target responds to drag direction**    |
| **Hysteresis**           | **Prevents target flicker near boundaries**   |
| **Grab offset**          | **Card stays anchored to grab point**         |
| **Container queries**    | **CSS-only responsive layout switching**      |
| **Pre-computed layouts** | **All column variants generated once**        |
| **Lazy overrides**       | **Per-column customization only when needed** |
| **CSS injection**        | **Grid always CSS-driven, even during drag**  |

The combination of these techniques creates a drag-and-drop experience that feels natural and predictable, even with complex multi-card layouts. The CSS-first responsive approach ensures smooth resizing without JavaScript overhead, and CSS injection ensures View Transitions work reliably.
