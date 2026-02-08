/**
 * Resize plugin for Gridiot
 *
 * Pure input plugin — detects resize gestures on grid item corners/edges
 * and emits resize-start/move/end/cancel events. Does NOT persist layout.
 * A behavior plugin (e.g., Algorithm) listens for resize-end and handles persistence.
 *
 * Usage:
 *   import { attachResize } from 'gridiot/resize';
 *
 *   const detach = attachResize(gridElement, {
 *     core,                 // GridiotCore instance (required)
 *     handles: 'corners',   // 'corners' | 'edges' | 'all'
 *     handleSize: 12,
 *     minSize: { colspan: 1, rowspan: 1 },
 *     maxSize: { colspan: 6, rowspan: 6 },
 *   });
 */

import { registerPlugin } from '../engine';
import type {
	GridCell,
	GridiotCore,
	ResizeCancelDetail,
	ResizeEndDetail,
	ResizeHandle,
	ResizeMoveDetail,
	ResizePluginOptions,
	ResizeStartDetail,
	ResizeState,
} from '../types';


export interface ResizeOptions {
	/** GridiotCore instance (required) */
	core: GridiotCore;
	/** Which handles to show: 'corners' | 'edges' | 'all' (default: 'corners') */
	handles?: 'corners' | 'edges' | 'all';
	/** Size of the hit zone for handles in pixels (default: 12) */
	handleSize?: number;
	/** Minimum size in grid cells (default: { colspan: 1, rowspan: 1 }) */
	minSize?: { colspan: number; rowspan: number };
	/** Maximum size in grid cells (default: { colspan: 6, rowspan: 6 }) */
	maxSize?: { colspan: number; rowspan: number };
	/** Show size label during resize (default: true) */
	showSizeLabel?: boolean;
}

interface ActiveResize {
	item: HTMLElement;
	pointerId: number;
	handle: ResizeHandle;
	/** Original cell position at start of resize - never changes */
	startCell: GridCell;
	/** Original size at start of resize - never changes */
	originalSize: { colspan: number; rowspan: number };
	/** Current position (may differ from startCell for NW/NE/SW handles) */
	currentCell: GridCell;
	/** Current size during resize */
	currentSize: { colspan: number; rowspan: number };
	sizeLabel: HTMLElement | null;
	/** Initial bounding rect for smooth resize */
	initialRect: DOMRect;
	/** Pointer position at start */
	startPointerX: number;
	startPointerY: number;
	/** Placeholder element (currently unused but kept for API compatibility) */
	placeholder: HTMLElement | null;
}


/**
 * Detect which resize handle (if any) is under the pointer
 */
function detectHandle(
	e: PointerEvent,
	item: HTMLElement,
	size: number,
	mode: 'corners' | 'edges' | 'all',
): ResizeHandle | null {
	const rect = item.getBoundingClientRect();
	const x = e.clientX - rect.left;
	const y = e.clientY - rect.top;

	const nearLeft = x < size;
	const nearRight = x > rect.width - size;
	const nearTop = y < size;
	const nearBottom = y > rect.height - size;

	// Corners
	if (mode === 'corners' || mode === 'all') {
		if (nearTop && nearLeft) return 'nw';
		if (nearTop && nearRight) return 'ne';
		if (nearBottom && nearLeft) return 'sw';
		if (nearBottom && nearRight) return 'se';
	}

	// Edges (only if not at corners)
	if (mode === 'edges' || mode === 'all') {
		if (nearTop) return 'n';
		if (nearBottom) return 's';
		if (nearLeft) return 'w';
		if (nearRight) return 'e';
	}

	return null;
}

/**
 * Get cursor style for a resize handle
 */
function getCursor(handle: ResizeHandle | null): string {
	switch (handle) {
		case 'nw':
		case 'se':
			return 'nwse-resize';
		case 'ne':
		case 'sw':
			return 'nesw-resize';
		case 'n':
		case 's':
			return 'ns-resize';
		case 'e':
		case 'w':
			return 'ew-resize';
		default:
			return '';
	}
}

/**
 * Create a size label element
 */
function createSizeLabel(): HTMLElement {
	const label = document.createElement('div');
	label.className = 'gridiot-resize-label';
	label.style.cssText = `
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 14px;
		font-weight: 600;
		font-family: system-ui, sans-serif;
		pointer-events: none;
		z-index: 1000;
		white-space: nowrap;
	`;
	return label;
}

/**
 * Attach resize functionality to a grid element.
 *
 * @param gridElement - The grid container element
 * @param options - Configuration options
 * @returns Cleanup function to detach resize
 */
export function attachResize(
	gridElement: HTMLElement,
	options: ResizeOptions,
): {
	setSize(item: HTMLElement, size: { colspan: number; rowspan: number }): void;
	destroy(): void;
} {
	const {
		core,
		handles = 'corners',
		handleSize = 12,
		minSize = { colspan: 1, rowspan: 1 },
		maxSize = { colspan: 6, rowspan: 6 },
		showSizeLabel = true,
	} = options;

	let activeResize: ActiveResize | null = null;
	let hoveredItem: HTMLElement | null = null;
	let hoveredHandle: ResizeHandle | null = null;

	// Register provider for inter-plugin state access
	core.providers.register<ResizeState | null>('resize', () => {
		if (!activeResize) return null;
		return {
			item: activeResize.item,
			originalSize: activeResize.originalSize,
			currentSize: activeResize.currentSize,
			handle: activeResize.handle,
		};
	});

	function emit<T>(event: string, detail: T): void {
		gridElement.dispatchEvent(
			new CustomEvent(`gridiot:${event}`, {
				bubbles: true,
				detail,
			}),
		);
	}

	function startResize(item: HTMLElement, handle: ResizeHandle, e: PointerEvent) {
		const colspan =
			parseInt(item.getAttribute('data-gridiot-colspan') || '1', 10) || 1;
		const rowspan =
			parseInt(item.getAttribute('data-gridiot-rowspan') || '1', 10) || 1;

		const style = getComputedStyle(item);
		const column = parseInt(style.gridColumnStart, 10) || 1;
		const row = parseInt(style.gridRowStart, 10) || 1;

		const originalSize = { colspan, rowspan };
		const startCell = { column, row };
		const initialRect = item.getBoundingClientRect();

		// Create size label if enabled
		let sizeLabel: HTMLElement | null = null;
		if (showSizeLabel) {
			sizeLabel = createSizeLabel();
			sizeLabel.textContent = `${colspan}×${rowspan}`;
			item.appendChild(sizeLabel);
		}

		activeResize = {
			item,
			pointerId: e.pointerId,
			handle,
			startCell,
			originalSize,
			currentCell: { ...startCell },
			currentSize: { ...originalSize },
			sizeLabel,
			initialRect,
			startPointerX: e.clientX,
			startPointerY: e.clientY,
			placeholder: null, // Will be set below if enabled
		};

		item.setAttribute('data-gridiot-resizing', '');
		item.setAttribute('data-gridiot-handle-active', handle);
		item.removeAttribute('data-gridiot-handle-hover'); // Clear hover state
		item.setPointerCapture(e.pointerId);

		// Add event listeners to item (pointer capture sends events to this element)
		item.addEventListener('pointermove', onItemPointerMove);
		item.addEventListener('pointerup', onItemPointerUp);
		item.addEventListener('pointercancel', onItemPointerCancel);

		// Emit resize-start BEFORE changing grid styles so originalPositions captures correct layout
		emit<ResizeStartDetail>('resize-start', {
			item,
			cell: startCell,
			colspan: originalSize.colspan,
			rowspan: originalSize.rowspan,
			handle,
			source: 'pointer',
		});

		activeResize.placeholder = null;

		// Switch to fixed positioning - item follows cursor in viewport coordinates
		// CSS Grid ignores fixed positioned children, allowing the grid to reflow
		item.style.position = 'fixed';
		item.style.left = `${initialRect.left}px`;
		item.style.top = `${initialRect.top}px`;
		item.style.width = `${initialRect.width}px`;
		item.style.height = `${initialRect.height}px`;
		item.style.zIndex = '100';
		// Exclude from view transitions during resize
		item.style.viewTransitionName = 'resizing';
	}

	function updateResize(e: PointerEvent) {
		if (!activeResize) return;

		const { item, handle, startCell, originalSize, currentCell, currentSize, sizeLabel, initialRect, startPointerX, startPointerY } =
			activeResize;

		const gridInfo = core.getGridInfo();

		// Calculate pointer delta
		const deltaX = e.clientX - startPointerX;
		const deltaY = e.clientY - startPointerY;

		// Calculate new visual dimensions based on handle
		let newWidth = initialRect.width;
		let newHeight = initialRect.height;
		let newLeft = initialRect.left;
		let newTop = initialRect.top;

		// Minimum visual size (1 cell)
		const minWidth = gridInfo.cellWidth;
		const minHeight = gridInfo.cellHeight;
		// Maximum visual size (clamped by maxSize config)
		const maxWidthByConfig = maxSize.colspan * gridInfo.cellWidth + (maxSize.colspan - 1) * gridInfo.gap;
		const maxHeightByConfig = maxSize.rowspan * gridInfo.cellHeight + (maxSize.rowspan - 1) * gridInfo.gap;
		// Maximum visual size (clamped by grid bounds)
		const maxWidthByGrid = gridInfo.rect.right - initialRect.left;
		const maxHeightByGrid = gridInfo.rect.bottom - initialRect.top;
		const maxWidth = Math.min(maxWidthByConfig, maxWidthByGrid);
		const maxHeight = Math.min(maxHeightByConfig, maxHeightByGrid);

		// Apply delta based on handle direction
		if (handle === 'e' || handle === 'se' || handle === 'ne') {
			newWidth = Math.max(minWidth, Math.min(maxWidth, initialRect.width + deltaX));
		}
		if (handle === 'w' || handle === 'sw' || handle === 'nw') {
			// For left edge, clamp to grid left
			const maxLeftShift = initialRect.left - gridInfo.rect.left;
			const maxWidthFromLeft = Math.min(maxWidthByConfig, initialRect.width + maxLeftShift);
			const widthChange = Math.max(-initialRect.width + minWidth, Math.min(maxWidthFromLeft - initialRect.width, -deltaX));
			newWidth = initialRect.width + widthChange;
			newLeft = initialRect.left - widthChange;
		}
		if (handle === 's' || handle === 'se' || handle === 'sw') {
			newHeight = Math.max(minHeight, Math.min(maxHeight, initialRect.height + deltaY));
		}
		if (handle === 'n' || handle === 'ne' || handle === 'nw') {
			// For top edge, clamp to grid top
			const maxTopShift = initialRect.top - gridInfo.rect.top;
			const maxHeightFromTop = Math.min(maxHeightByConfig, initialRect.height + maxTopShift);
			const heightChange = Math.max(-initialRect.height + minHeight, Math.min(maxHeightFromTop - initialRect.height, -deltaY));
			newHeight = initialRect.height + heightChange;
			newTop = initialRect.top - heightChange;
		}

		// Apply smooth visual size (fixed positioning uses viewport coordinates)
		item.style.left = `${newLeft}px`;
		item.style.top = `${newTop}px`;
		item.style.width = `${newWidth}px`;
		item.style.height = `${newHeight}px`;

		// Calculate projected final grid size (what it will snap to)
		const cellPlusGap = gridInfo.cellWidth + gridInfo.gap;
		const rowPlusGap = gridInfo.cellHeight + gridInfo.gap;

		// Calculate raw ratios
		const rawColspanRatio = (newWidth + gridInfo.gap) / cellPlusGap;
		const rawRowspanRatio = (newHeight + gridInfo.gap) / rowPlusGap;

		// Snap when 30% into the next cell (works symmetrically for grow and shrink)
		const RESIZE_SNAP = 0.3;
		let projectedColspan = Math.floor(rawColspanRatio + (1 - RESIZE_SNAP));
		let projectedRowspan = Math.floor(rawRowspanRatio + (1 - RESIZE_SNAP));

		// Apply min/max constraints
		projectedColspan = Math.max(minSize.colspan, Math.min(maxSize.colspan, projectedColspan));
		projectedRowspan = Math.max(minSize.rowspan, Math.min(maxSize.rowspan, projectedRowspan));

		// Calculate cell position: anchor corner stays fixed, opposite edge moves
		let projectedColumn = startCell.column;
		let projectedRow = startCell.row;

		// For handles that move the left edge, calculate column from the right anchor
		if (handle === 'w' || handle === 'sw' || handle === 'nw') {
			const rightEdge = startCell.column + originalSize.colspan - 1;
			projectedColumn = rightEdge - projectedColspan + 1;
		}

		// For handles that move the top edge, calculate row from the bottom anchor
		if (handle === 'n' || handle === 'ne' || handle === 'nw') {
			const bottomEdge = startCell.row + originalSize.rowspan - 1;
			projectedRow = bottomEdge - projectedRowspan + 1;
		}

		// Update tracking
		activeResize.currentSize = { colspan: projectedColspan, rowspan: projectedRowspan };
		activeResize.currentCell = { column: projectedColumn, row: projectedRow };

		// Update size label with projected final size
		if (sizeLabel) {
			sizeLabel.textContent = `${projectedColspan}×${projectedRowspan}`;
		}

		// Calculate anchor cell (the corner that stays fixed during resize)
		let anchorCell: GridCell;
		if (handle === 'se' || handle === 's' || handle === 'e') {
			// NW corner is anchor
			anchorCell = { column: startCell.column, row: startCell.row };
		} else if (handle === 'nw' || handle === 'n' || handle === 'w') {
			// SE corner is anchor
			anchorCell = {
				column: startCell.column + originalSize.colspan - 1,
				row: startCell.row + originalSize.rowspan - 1,
			};
		} else if (handle === 'ne') {
			// SW corner is anchor
			anchorCell = {
				column: startCell.column,
				row: startCell.row + originalSize.rowspan - 1,
			};
		} else {
			// SW handle: NE corner is anchor
			anchorCell = {
				column: startCell.column + originalSize.colspan - 1,
				row: startCell.row,
			};
		}

		emit<ResizeMoveDetail>('resize-move', {
			item,
			cell: { column: projectedColumn, row: projectedRow },
			anchorCell,
			startCell,
			colspan: projectedColspan,
			rowspan: projectedRowspan,
			handle,
			source: 'pointer',
		});
	}

	function cleanupResizeListeners(item: HTMLElement, pointerId: number) {
		item.releasePointerCapture(pointerId);
		item.removeEventListener('pointermove', onItemPointerMove);
		item.removeEventListener('pointerup', onItemPointerUp);
		item.removeEventListener('pointercancel', onItemPointerCancel);
	}

	function finishResize() {
		if (!activeResize) return;

		const { item, pointerId, currentSize, currentCell, sizeLabel, placeholder } = activeResize;

		// Remove placeholder if it exists
		if (placeholder) {
			placeholder.remove();
		}

		// Clean up item event listeners
		cleanupResizeListeners(item, pointerId);

		// Update data attributes to reflect new size
		item.setAttribute('data-gridiot-colspan', String(currentSize.colspan));
		item.setAttribute('data-gridiot-rowspan', String(currentSize.rowspan));

		// Remove size label
		if (sizeLabel) {
			sizeLabel.remove();
		}

		// Emit resize-end while item is still position:fixed
		emit<ResizeEndDetail>('resize-end', {
			item,
			cell: currentCell,
			colspan: currentSize.colspan,
			rowspan: currentSize.rowspan,
			source: 'pointer',
		});

		// Clear fixed positioning — item returns to grid flow
		item.style.position = '';
		item.style.left = '';
		item.style.top = '';
		item.style.width = '';
		item.style.height = '';
		item.style.zIndex = '';
		// Restore view transition name
		const itemId = item.style.getPropertyValue('--item-id') || item.id || item.dataset.id;
		if (itemId) {
			item.style.viewTransitionName = itemId;
		} else {
			item.style.viewTransitionName = '';
		}
		item.removeAttribute('data-gridiot-resizing');
		item.removeAttribute('data-gridiot-handle-active');

		activeResize = null;
	}

	function cancelResize() {
		if (!activeResize) return;

		const { item, pointerId, sizeLabel, placeholder } = activeResize;

		// Clean up item event listeners
		cleanupResizeListeners(item, pointerId);

		// Remove placeholder if it exists
		if (placeholder) {
			placeholder.remove();
		}

		// Remove size label
		if (sizeLabel) {
			sizeLabel.remove();
		}

		// Clear fixed positioning — item returns to grid flow at its previous position
		item.style.position = '';
		item.style.left = '';
		item.style.top = '';
		item.style.width = '';
		item.style.height = '';
		item.style.zIndex = '';

		// Restore view transition name
		const itemId = item.style.getPropertyValue('--item-id') || item.id || item.dataset.id;
		if (itemId) {
			item.style.viewTransitionName = itemId;
		} else {
			item.style.viewTransitionName = '';
		}

		item.removeAttribute('data-gridiot-resizing');
		item.removeAttribute('data-gridiot-handle-active');

		emit<ResizeCancelDetail>('resize-cancel', {
			item,
			source: 'pointer',
		});

		activeResize = null;
	}

	// --- Event handlers ---

	// Use capture phase to intercept before pointer plugin
	const onPointerDown = (e: PointerEvent) => {
		const item = (e.target as HTMLElement).closest(
			'[data-gridiot-item]',
		) as HTMLElement | null;
		if (!item) return;

		const handle = detectHandle(e, item, handleSize, handles);
		if (!handle) return; // Not on handle - let pointer plugin handle drag

		// Stop event from reaching pointer plugin
		e.stopPropagation();
		e.preventDefault();

		startResize(item, handle, e);
	};

	// Item-specific handlers (added during resize, removed on finish/cancel)
	const onItemPointerMove = (e: PointerEvent) => {
		if (activeResize && e.pointerId === activeResize.pointerId) {
			updateResize(e);
		}
	};

	const onItemPointerUp = (e: PointerEvent) => {
		if (activeResize && e.pointerId === activeResize.pointerId) {
			finishResize();
		}
	};

	const onItemPointerCancel = (e: PointerEvent) => {
		if (activeResize && e.pointerId === activeResize.pointerId) {
			cancelResize();
		}
	};

	// Grid-level hover handler for cursor changes and handle hover state
	const onPointerMove = (e: PointerEvent) => {
		// Skip hover handling during active resize
		if (activeResize) return;

		// Handle hover cursor changes
		const item = (e.target as HTMLElement).closest(
			'[data-gridiot-item]',
		) as HTMLElement | null;

		if (item) {
			const handle = detectHandle(e, item, handleSize, handles);

			if (handle !== hoveredHandle || item !== hoveredItem) {
				// Clear previous item's hover state
				if (hoveredItem && hoveredItem !== item) {
					hoveredItem.style.cursor = '';
					hoveredItem.removeAttribute('data-gridiot-handle-hover');
				}

				// Clear hover attribute if handle changed on same item
				if (hoveredItem === item && hoveredHandle && !handle) {
					item.removeAttribute('data-gridiot-handle-hover');
				}

				hoveredItem = item;
				hoveredHandle = handle;

				// Set cursor and hover attribute based on handle
				item.style.cursor = getCursor(handle) || '';
				if (handle) {
					item.setAttribute('data-gridiot-handle-hover', handle);
				} else {
					item.removeAttribute('data-gridiot-handle-hover');
				}
			}
		} else if (hoveredItem) {
			hoveredItem.style.cursor = '';
			hoveredItem.removeAttribute('data-gridiot-handle-hover');
			hoveredItem = null;
			hoveredHandle = null;
		}
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && activeResize) {
			cancelResize();
		}
	};

	// Register event listeners
	gridElement.addEventListener('pointerdown', onPointerDown, { capture: true });
	gridElement.addEventListener('pointermove', onPointerMove);
	document.addEventListener('keydown', onKeyDown);

	// Public API
	function setSize(
		item: HTMLElement,
		size: { colspan: number; rowspan: number },
	) {
		const clampedColspan = Math.max(
			minSize.colspan,
			Math.min(maxSize.colspan, size.colspan),
		);
		const clampedRowspan = Math.max(
			minSize.rowspan,
			Math.min(maxSize.rowspan, size.rowspan),
		);

		const computed = getComputedStyle(item);
		const column = parseInt(computed.gridColumnStart, 10) || 1;
		const row = parseInt(computed.gridRowStart, 10) || 1;

		item.setAttribute('data-gridiot-colspan', String(clampedColspan));
		item.setAttribute('data-gridiot-rowspan', String(clampedRowspan));

		emit<ResizeEndDetail>('resize-end', {
			item,
			cell: { column, row },
			colspan: clampedColspan,
			rowspan: clampedRowspan,
			source: 'pointer',
		});
	}

	function destroy() {
		gridElement.removeEventListener('pointerdown', onPointerDown, {
			capture: true,
		});
		gridElement.removeEventListener('pointermove', onPointerMove);
		document.removeEventListener('keydown', onKeyDown);

		if (activeResize) {
			cancelResize();
		}
	}

	return { setSize, destroy };
}

// Register as a plugin for auto-initialization via init()
registerPlugin({
	name: 'resize',
	init(core, options?: ResizePluginOptions & { core?: GridiotCore }) {
		const instance = attachResize(core.element, {
			...options,
			core: options?.core ?? core,
		});
		return () => instance.destroy();
	},
});

export type { ResizeHandle };
