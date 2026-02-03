/**
 * Push-down layout algorithm for Gridiot
 *
 * This module provides both:
 * 1. Pure algorithm functions (re-exported from algorithm-push-core)
 * 2. DOM integration helper for attaching the algorithm to a grid element
 *
 * Usage (pure functions):
 *   import { calculateLayout, layoutToCSS } from 'gridiot/algorithm-push';
 *   const newLayout = calculateLayout(items, movedId, targetCell);
 *   styleElement.textContent = layoutToCSS(newLayout);
 *
 * Usage (DOM integration):
 *   import { init } from 'gridiot';
 *   import { attachPushAlgorithm } from 'gridiot/algorithm-push';
 *
 *   const grid = init(element);
 *   const detach = attachPushAlgorithm(grid.element);
 */

import { registerPlugin } from '../engine';

// Re-export pure algorithm functions
export {
	calculateLayout,
	compactUp,
	findOverlaps,
	itemsOverlap,
	layoutToCSS,
	pushDown,
	type CalculateLayoutOptions,
	type GridCell,
	type ItemRect,
	type LayoutToCSSOptions,
} from './algorithm-push-core';

import type {
	AlgorithmPushPluginOptions,
	DragCancelDetail,
	DragEndDetail,
	DragMoveDetail,
	DragStartDetail,
	GridCell,
	GridiotCore,
	ItemPosition,
	LayoutState,
	ResizeCancelDetail,
	ResizeEndDetail,
	ResizeMoveDetail,
	ResizeStartDetail,
	ResponsiveLayoutModel,
} from '../types';

import type { CameraState } from './camera';

import {
	calculateLayout,
	layoutToCSS,
	type ItemRect,
} from './algorithm-push-core';

const DEBUG = false;
function log(...args: unknown[]) {
	if (DEBUG) console.log('[algorithm-push]', ...args);
}

/**
 * Read item positions from DOM elements
 */
export function readItemsFromDOM(container: HTMLElement): ItemRect[] {
	const elements = container.querySelectorAll('[data-gridiot-item]');
	return Array.from(elements).map((el) => {
		const element = el as HTMLElement;
		const style = getComputedStyle(element);
		const column = parseInt(style.gridColumnStart, 10) || 1;
		const row = parseInt(style.gridRowStart, 10) || 1;
		const width =
			parseInt(element.getAttribute('data-gridiot-colspan') || '1', 10) || 1;
		const height =
			parseInt(element.getAttribute('data-gridiot-rowspan') || '1', 10) || 1;
		const id = element.dataset.id || element.dataset.gridiotItem || '';

		return { id, column, row, width, height };
	});
}

/**
 * Options for attachPushAlgorithm
 */
export interface AttachPushAlgorithmOptions {
	/**
	 * Style element to inject layout CSS into.
	 * If not provided, positions are applied directly to element.style.
	 *
	 * When using with a layoutModel, this becomes the "preview" style element
	 * used during drag. The responsive plugin manages the main layout CSS.
	 */
	styleElement?: HTMLStyleElement;
	/**
	 * CSS selector options for layoutToCSS
	 */
	selectorPrefix?: string;
	selectorSuffix?: string;
	/**
	 * Whether to compact items upward after resolving collisions (default: true)
	 * When false, items only get pushed down but won't float back up to fill gaps.
	 */
	compaction?: boolean;
	/**
	 * GridiotCore instance for provider registration.
	 * If provided, registers a 'layout' provider that exposes current layout state.
	 */
	core?: GridiotCore;
	/**
	 * Responsive layout model for multi-breakpoint support.
	 * When provided, final positions are saved to the layout model on drag-end,
	 * which triggers CSS regeneration via the responsive plugin.
	 */
	layoutModel?: ResponsiveLayoutModel;
}

/**
 * Attach push-down algorithm to a grid element.
 *
 * This creates event listeners for gridiot drag events and updates
 * the layout when items are moved. Layout changes are animated
 * via View Transitions.
 *
 * @param gridElement - The grid container element
 * @param options - Configuration options
 * @returns Cleanup function to detach the algorithm
 */
export function attachPushAlgorithm(
	gridElement: HTMLElement,
	options: AttachPushAlgorithmOptions = {},
): () => void {
	const { styleElement, selectorPrefix = '#', selectorSuffix = '', compaction = true, core, layoutModel } = options;

	/**
	 * Get current column count from computed grid style
	 */
	function getCurrentColumnCount(): number {
		const style = getComputedStyle(gridElement);
		const columns = style.gridTemplateColumns.split(' ').filter(Boolean);
		return Math.max(1, columns.length);
	}

	let originalPositions: Map<string, { column: number; row: number }> | null =
		null;
	let draggedItemId: string | null = null;
	let draggedElement: HTMLElement | null = null;
	let layoutVersion = 0; // Prevent stale async view transitions from overwriting newer layouts
	let currentLayout: ItemRect[] | null = null;
	let dragStartColumnCount: number | null = null; // Track column count at drag start to avoid implicit columns

	// Register layout provider if core is provided
	if (core) {
		core.providers.register<LayoutState | null>('layout', () => {
			if (!currentLayout) return null;
			const gridStyle = getComputedStyle(gridElement);
			const columns = gridStyle.gridTemplateColumns.split(' ').length;
			return {
				items: currentLayout.map((item) => ({
					id: item.id,
					column: item.column,
					row: item.row,
					colspan: item.width,
					rowspan: item.height,
				})),
				columns,
			};
		});
	}

	function getItemId(element: HTMLElement): string {
		return element.dataset.id || element.dataset.gridiotItem || '';
	}

	function setItemCell(item: HTMLElement, cell: GridCell): void {
		const colspan =
			parseInt(item.getAttribute('data-gridiot-colspan') || '1', 10) || 1;
		const rowspan =
			parseInt(item.getAttribute('data-gridiot-rowspan') || '1', 10) || 1;
		const colValue = `${cell.column} / span ${colspan}`;
		const rowValue = `${cell.row} / span ${rowspan}`;
		log('setItemCell', { id: getItemId(item), colValue, rowValue });
		item.style.gridColumn = colValue;
		item.style.gridRow = rowValue;
	}

	function applyLayout(
		layout: ItemRect[],
		excludeId: string | null,
		useViewTransition: boolean,
	): void {
		// Increment version to invalidate any pending async transitions
		const thisVersion = ++layoutVersion;

		// Update current layout for provider access
		currentLayout = layout;

		const applyChanges = () => {
			// Skip if a newer layout has been applied (stale async view transition)
			if (thisVersion !== layoutVersion) {
				return;
			}

			if (styleElement) {
				// CSS injection mode - preferred
				// Filter out the excluded item (being dragged) from CSS generation
				const itemsToStyle = excludeId
					? layout.filter((item) => item.id !== excludeId)
					: layout;
				// Use dragStartColumnCount to clamp widths and prevent implicit column creation
				const css = layoutToCSS(itemsToStyle, {
					selectorPrefix,
					selectorSuffix,
					maxColumns: dragStartColumnCount ?? undefined,
				});
				styleElement.textContent = css;

				// Clear inline grid styles so CSS rules take effect
				// (inline styles have higher specificity than stylesheet rules)
				const elements = gridElement.querySelectorAll('[data-gridiot-item]');
				for (const el of elements) {
					const element = el as HTMLElement;
					const id = getItemId(element);
					if (id !== excludeId) {
						element.style.gridColumn = '';
						element.style.gridRow = '';
					}
				}
			} else {
				// Direct style mutation mode - fallback
				const elements = gridElement.querySelectorAll('[data-gridiot-item]');
				for (const el of elements) {
					const element = el as HTMLElement;
					const id = getItemId(element);
					if (id === excludeId) continue;

					const item = layout.find((it) => it.id === id);
					if (item) {
						setItemCell(element, { column: item.column, row: item.row });
					}
				}
			}
		};

		if (useViewTransition && 'startViewTransition' in document) {
			log('starting view transition, excludeId:', excludeId);
			// Only suppress animation for item being pointer-dragged (not keyboard nudges)
			// During pointer drag, excludeId is set; during keyboard nudge or final drop, it's null
			if (draggedElement && excludeId) {
				draggedElement.style.viewTransitionName = 'dragging';
			}
			(document as any).startViewTransition(applyChanges);
		} else {
			log('applying without view transition');
			applyChanges();
		}
	}

	const onDragStart = (e: Event) => {
		const detail = (e as CustomEvent<DragStartDetail>).detail;
		draggedElement = detail.item;
		draggedItemId = getItemId(detail.item);

		// Capture column count BEFORE any CSS changes to avoid implicit columns from span values
		dragStartColumnCount = getCurrentColumnCount();

		// Store original positions to reset from during drag
		const items = readItemsFromDOM(gridElement);
		originalPositions = new Map();
		for (const item of items) {
			originalPositions.set(item.id, { column: item.column, row: item.row });
		}

		// In CSS injection mode, clear inline styles so CSS rules take effect
		if (styleElement) {
			const elements = gridElement.querySelectorAll('[data-gridiot-item]');
			for (const el of elements) {
				const element = el as HTMLElement;
				if (element !== draggedElement) {
					element.style.gridColumn = '';
					element.style.gridRow = '';
				}
			}
			// Generate initial CSS for current positions, clamping to current column count
			const css = layoutToCSS(items, { selectorPrefix, selectorSuffix, maxColumns: dragStartColumnCount });
			styleElement.textContent = css;
		}

		log('drag-start', {
			item: draggedItemId,
			positions: Array.from(originalPositions.entries()),
		});
	};

	// Track pending cell during camera scroll for deferred update
	let pendingCell: { column: number; row: number } | null = null;

	const onDragMove = (e: Event) => {
		if (!draggedItemId || !originalPositions) return;

		const detail = (e as CustomEvent<DragMoveDetail>).detail;

		// Skip layout updates while camera is auto-scrolling, but track pending cell
		if (core) {
			const cameraState = core.providers.get<CameraState>('camera');
			if (cameraState?.isScrolling) {
				pendingCell = detail.cell;
				log('drag-move deferred (camera scrolling)', pendingCell);
				return;
			}
		}

		// Clear pendingCell since we're processing normally now
		pendingCell = null;

		// Build items array from original positions
		const items: ItemRect[] = readItemsFromDOM(gridElement).map((item) => {
			const original = originalPositions!.get(item.id);
			if (original && item.id !== draggedItemId) {
				return { ...item, column: original.column, row: original.row };
			}
			return item;
		});

		log('drag-move', { targetCell: detail.cell });
		const newLayout = calculateLayout(items, draggedItemId, detail.cell, { compact: compaction });
		log(
			'calculated layout',
			newLayout.map((it) => ({ id: it.id, col: it.column, row: it.row })),
		);
		applyLayout(newLayout, draggedItemId, true);
	};

	const onDragEnd = (e: Event) => {
		if (!draggedItemId || !originalPositions) return;
		const detail = (e as CustomEvent<DragEndDetail>).detail;

		log('drag-end', { finalCell: detail.cell });

		// Build items array from original positions
		const items: ItemRect[] = readItemsFromDOM(gridElement).map((item) => {
			const original = originalPositions!.get(item.id);
			if (original && item.id !== draggedItemId) {
				return { ...item, column: original.column, row: original.row };
			}
			return item;
		});

		const finalLayout = calculateLayout(items, draggedItemId, detail.cell, { compact: compaction });
		log(
			'final layout',
			finalLayout.map((it) => ({ id: it.id, col: it.column, row: it.row })),
		);

		// Check if this is a pointer drag (item is in fixed position) or keyboard nudge
		const isPointerDrag = draggedElement?.style.position === 'fixed';
		log('drag-end isPointerDrag:', isPointerDrag, 'position:', draggedElement?.style.position);

		// Clear the 'dragging' viewTransitionName only if it was set (during pointer drag)
		// Don't clear for keyboard nudges - they need the CSS view-transition-name to animate
		if (draggedElement && draggedElement.style.viewTransitionName === 'dragging') {
			draggedElement.style.viewTransitionName = '';
		}

		// For pointer drags, apply synchronously (pointer's FLIP animates the dropped item)
		// For keyboard nudges, use view transitions to animate
		const useViewTransition = !isPointerDrag;
		log('drag-end useViewTransition:', useViewTransition);
		applyLayout(finalLayout, null, useViewTransition);

		// Save to layout model if provided (triggers CSS regeneration via responsive plugin)
		if (layoutModel && dragStartColumnCount) {
			// Use dragStartColumnCount captured at drag start, not getCurrentColumnCount()
			// getCurrentColumnCount() may be wrong if preview CSS created implicit columns
			const positions = new Map<string, ItemPosition>();
			for (const item of finalLayout) {
				positions.set(item.id, { column: item.column, row: item.row });
			}
			layoutModel.saveLayout(dragStartColumnCount, positions);
			log('saved layout to model for', dragStartColumnCount, 'columns');

			// Clear preview styles so container query CSS takes over
			if (styleElement) {
				styleElement.textContent = '';
				log('cleared preview styles');
			}
		}

		draggedItemId = null;
		draggedElement = null;
		originalPositions = null;
		pendingCell = null;
		dragStartColumnCount = null;
	};

	const onDragCancel = () => {
		if (!draggedItemId || !originalPositions) return;

		// Clear the 'dragging' viewTransitionName only if it was set (during pointer drag)
		if (draggedElement && draggedElement.style.viewTransitionName === 'dragging') {
			draggedElement.style.viewTransitionName = '';
		}

		// Restore original positions
		const restoreLayout: ItemRect[] = readItemsFromDOM(gridElement).map(
			(item) => {
				const original = originalPositions!.get(item.id);
				if (original) {
					return { ...item, column: original.column, row: original.row };
				}
				return item;
			},
		);

		const restore = () => {
			applyLayout(restoreLayout, null, false);
		};

		if ('startViewTransition' in document) {
			(document as any).startViewTransition(restore);
		} else {
			restore();
		}

		draggedItemId = null;
		draggedElement = null;
		originalPositions = null;
		pendingCell = null;
		dragStartColumnCount = null;
	};

	// Recalculate layout when camera settles after auto-scrolling
	const onCameraSettled = () => {
		if (!draggedItemId || !originalPositions) return;

		// Use pending cell if available, otherwise get from element position
		let cell = pendingCell;
		if (!cell && draggedElement) {
			const rect = draggedElement.getBoundingClientRect();
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			cell = core?.getCellFromPoint(centerX, centerY) ?? null;
		}

		if (!cell) {
			log('camera-settled, no cell to update to');
			return;
		}

		log('camera-settled, updating to cell', cell);
		pendingCell = null;

		// Rebuild items from original positions
		const items: ItemRect[] = readItemsFromDOM(gridElement).map((item) => {
			const original = originalPositions!.get(item.id);
			if (original && item.id !== draggedItemId) {
				return { ...item, column: original.column, row: original.row };
			}
			return item;
		});

		const newLayout = calculateLayout(items, draggedItemId!, cell, { compact: compaction });
		applyLayout(newLayout, draggedItemId, true);
	};

	// =========================================================================
	// Resize event handlers
	// =========================================================================

	let resizedItemId: string | null = null;
	let resizedElement: HTMLElement | null = null;
	let resizeOriginalPositions: Map<string, { column: number; row: number; width: number; height: number }> | null = null;
	let lastResizeLayout: { cell: GridCell; colspan: number; rowspan: number } | null = null;
	let resizeStartColumnCount: number | null = null; // Track column count at resize start

	const onResizeStart = (e: Event) => {
		const detail = (e as CustomEvent<ResizeStartDetail>).detail;
		resizedElement = detail.item;
		resizedItemId = getItemId(detail.item);

		// Capture column count BEFORE any CSS changes to avoid implicit columns
		resizeStartColumnCount = getCurrentColumnCount();

		// Store original positions AND sizes to reset from during resize
		const items = readItemsFromDOM(gridElement);
		resizeOriginalPositions = new Map();
		for (const item of items) {
			resizeOriginalPositions.set(item.id, {
				column: item.column,
				row: item.row,
				width: item.width,
				height: item.height,
			});
		}

		// In CSS injection mode, set up preview styles for animations during resize
		if (styleElement) {
			const elements = gridElement.querySelectorAll('[data-gridiot-item]');
			for (const el of elements) {
				const element = el as HTMLElement;
				if (element !== resizedElement) {
					element.style.gridColumn = '';
					element.style.gridRow = '';
				}
			}
			// Generate initial CSS for current positions, clamping to current column count
			const css = layoutToCSS(items, { selectorPrefix, selectorSuffix, maxColumns: resizeStartColumnCount });
			styleElement.textContent = css;
		}

		// Clear last resize layout to ensure first resize-move triggers an update
		lastResizeLayout = null;

		log('resize-start', {
			item: resizedItemId,
			cell: detail.cell,
			size: { colspan: detail.colspan, rowspan: detail.rowspan },
		});
	};

	const onResizeMove = (e: Event) => {
		if (!resizedItemId || !resizeOriginalPositions) return;

		const detail = (e as CustomEvent<ResizeMoveDetail>).detail;

		// Only update layout when projected size/position actually changes
		// This prevents rapid view transitions from cancelling each other
		if (lastResizeLayout &&
			lastResizeLayout.cell.column === detail.cell.column &&
			lastResizeLayout.cell.row === detail.cell.row &&
			lastResizeLayout.colspan === detail.colspan &&
			lastResizeLayout.rowspan === detail.rowspan) {
			return;
		}
		lastResizeLayout = {
			cell: { ...detail.cell },
			colspan: detail.colspan,
			rowspan: detail.rowspan,
		};

		// Build items array from original positions, but with updated size for resized item
		const items: ItemRect[] = [];
		for (const [id, original] of resizeOriginalPositions) {
			if (id === resizedItemId) {
				// Use the projected position and size from resize event
				items.push({
					id,
					column: detail.cell.column,
					row: detail.cell.row,
					width: detail.colspan,
					height: detail.rowspan,
				});
			} else {
				// Use original position and size
				items.push({
					id,
					column: original.column,
					row: original.row,
					width: original.width,
					height: original.height,
				});
			}
		}

		log('resize-move', { targetCell: detail.cell, size: { colspan: detail.colspan, rowspan: detail.rowspan } });
		const newLayout = calculateLayout(items, resizedItemId, detail.cell, { compact: compaction });
		log(
			'calculated resize layout',
			newLayout.map((it) => ({ id: it.id, col: it.column, row: it.row, w: it.width, h: it.height })),
		);

		// Apply layout WITHOUT view transitions during resize-move to avoid visual glitches
		// View transitions during rapid updates can cause items to appear to shrink/jitter
		applyLayout(newLayout, resizedItemId, false);
	};

	const onResizeEnd = (e: Event) => {
		if (!resizedItemId || !resizeOriginalPositions) return;
		const detail = (e as CustomEvent<ResizeEndDetail>).detail;

		log('resize-end', { finalCell: detail.cell, size: { colspan: detail.colspan, rowspan: detail.rowspan } });

		// Build final layout from original positions with final resize size
		const items: ItemRect[] = [];
		for (const [id, original] of resizeOriginalPositions) {
			if (id === resizedItemId) {
				items.push({
					id,
					column: detail.cell.column,
					row: detail.cell.row,
					width: detail.colspan,
					height: detail.rowspan,
				});
			} else {
				items.push({
					id,
					column: original.column,
					row: original.row,
					width: original.width,
					height: original.height,
				});
			}
		}

		const finalLayout = calculateLayout(items, resizedItemId, detail.cell, { compact: compaction });
		log(
			'final resize layout',
			finalLayout.map((it) => ({ id: it.id, col: it.column, row: it.row, w: it.width, h: it.height })),
		);

		// Items are already at their positions from resize-move animations.
		// Apply final layout without view transition (same as pointer drag-end)
		applyLayout(finalLayout, null, false);

		// Save to layout model if provided
		if (layoutModel && resizeStartColumnCount) {
			// Use resizeStartColumnCount captured at resize start, not getCurrentColumnCount()
			const positions = new Map<string, ItemPosition>();
			for (const item of finalLayout) {
				positions.set(item.id, { column: item.column, row: item.row });
			}
			layoutModel.updateItemSize(resizedItemId, { width: detail.colspan, height: detail.rowspan });
			layoutModel.saveLayout(resizeStartColumnCount, positions);
			log('saved resize layout to model for', resizeStartColumnCount, 'columns');

			// Clear preview styles so container query CSS takes over
			if (styleElement) {
				styleElement.textContent = '';
				log('cleared preview styles');
			}
		}

		resizedItemId = null;
		resizedElement = null;
		resizeOriginalPositions = null;
		lastResizeLayout = null;
		resizeStartColumnCount = null;
	};

	const onResizeCancel = () => {
		if (!resizedItemId || !resizeOriginalPositions) return;

		// Restore original positions
		const restoreLayout: ItemRect[] = readItemsFromDOM(gridElement).map(
			(item) => {
				const original = resizeOriginalPositions!.get(item.id);
				if (original) {
					return {
						...item,
						column: original.column,
						row: original.row,
						width: original.width,
						height: original.height,
					};
				}
				return item;
			},
		);

		const restore = () => {
			applyLayout(restoreLayout, null, false);
		};

		if ('startViewTransition' in document) {
			(document as any).startViewTransition(restore);
		} else {
			restore();
		}

		resizedItemId = null;
		resizedElement = null;
		resizeOriginalPositions = null;
		lastResizeLayout = null;
		resizeStartColumnCount = null;
	};

	gridElement.addEventListener('gridiot:drag-start', onDragStart);
	gridElement.addEventListener('gridiot:drag-move', onDragMove);
	gridElement.addEventListener('gridiot:drag-end', onDragEnd);
	gridElement.addEventListener('gridiot:drag-cancel', onDragCancel);
	gridElement.addEventListener('gridiot:camera-settled', onCameraSettled);
	gridElement.addEventListener('gridiot:resize-start', onResizeStart);
	gridElement.addEventListener('gridiot:resize-move', onResizeMove);
	gridElement.addEventListener('gridiot:resize-end', onResizeEnd);
	gridElement.addEventListener('gridiot:resize-cancel', onResizeCancel);

	return () => {
		gridElement.removeEventListener('gridiot:drag-start', onDragStart);
		gridElement.removeEventListener('gridiot:drag-move', onDragMove);
		gridElement.removeEventListener('gridiot:drag-end', onDragEnd);
		gridElement.removeEventListener('gridiot:drag-cancel', onDragCancel);
		gridElement.removeEventListener('gridiot:camera-settled', onCameraSettled);
		gridElement.removeEventListener('gridiot:resize-start', onResizeStart);
		gridElement.removeEventListener('gridiot:resize-move', onResizeMove);
		gridElement.removeEventListener('gridiot:resize-end', onResizeEnd);
		gridElement.removeEventListener('gridiot:resize-cancel', onResizeCancel);
	};
}

// Register as a plugin for auto-initialization via init()
registerPlugin({
	name: 'algorithm-push',
	init(
		core,
		options?: AlgorithmPushPluginOptions & {
			core?: GridiotCore;
			layoutModel?: ResponsiveLayoutModel;
			styleElement?: HTMLStyleElement;
		},
	) {
		return attachPushAlgorithm(core.element, {
			...options,
			core: options?.core ?? core,
		});
	},
});
