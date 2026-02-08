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
 *   core.styles.set('preview', layoutToCSS(newLayout));
 *   core.styles.commit();
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
	DragSource,
	GridCell,
	GridiotCore,
	ItemPosition,
	LayoutState,
	ResizeCancelDetail,
	ResizeEndDetail,
	ResizeMoveDetail,
	ResizeStartDetail,
	ResponsiveLayoutModel,
	StyleManager,
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
	 * GridiotCore instance for provider registration and style injection.
	 * When provided, uses core.styles for CSS injection (the 'preview' layer).
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
	const { selectorPrefix = '#', selectorSuffix = '', compaction = true, core, layoutModel } = options;
	const styles: StyleManager | null = core?.styles ?? null;

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
	let dragSource: 'pointer' | 'keyboard' | null = null;
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
		onApplied?: () => void,
	): void {
		// Increment version to invalidate any pending async transitions
		const thisVersion = ++layoutVersion;

		// Update current layout for provider access
		currentLayout = layout;

		// Capture column count NOW, before the async callback runs
		// (the state variables get cleared after applyLayout returns)
		const capturedColumnCount = dragStartColumnCount ?? resizeStartColumnCount;

		const applyChanges = () => {
			// Skip if a newer layout has been applied (stale async view transition)
			if (thisVersion !== layoutVersion) {
				return;
			}

			if (styles) {
				// CSS injection mode - preferred
				// Filter out the excluded item (being dragged) from CSS generation
				const itemsToStyle = excludeId
					? layout.filter((item) => item.id !== excludeId)
					: layout;
				// Use the captured column count to clamp widths and prevent implicit column creation
				const css = layoutToCSS(itemsToStyle, {
					selectorPrefix,
					selectorSuffix,
					maxColumns: capturedColumnCount ?? undefined,
				});
				log('injecting CSS:', css.substring(0, 200) + '...');
				styles.set('preview', css);
				styles.commit();

				// Clear inline grid styles so CSS rules take effect
				// (inline styles have higher specificity than stylesheet rules)
				const elements = gridElement.querySelectorAll('[data-gridiot-item]');
				for (const el of elements) {
					const element = el as HTMLElement;
					const id = getItemId(element);
					// Don't clear styles for:
					// 1. The excluded item (being dragged with fixed positioning)
					// 2. Items with viewTransitionName='none' (being FLIP-animated by resize plugin)
					const vtn = element.style.viewTransitionName;
					if (id !== excludeId && vtn !== 'none') {
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

			// Call onApplied callback after CSS changes are made
			// This runs inside the View Transition callback, so layoutModel updates
			// happen after the "new" state is captured
			if (onApplied) {
				onApplied();
			}
		};

		if (useViewTransition && 'startViewTransition' in document) {
			log('starting view transition, excludeId:', excludeId);
			// Only suppress animation for item being pointer-dragged (not keyboard nudges)
			// During pointer drag, excludeId is set; during keyboard nudge or final drop, it's null
			if (draggedElement && excludeId) {
				draggedElement.style.viewTransitionName = 'dragging';
			}
			// Log items' view-transition-names before transition
			const items = gridElement.querySelectorAll('[data-gridiot-item]');
			for (const item of items) {
				const el = item as HTMLElement;
				const vtn = getComputedStyle(el).viewTransitionName;
				log('item', getItemId(el), 'view-transition-name:', vtn);
			}
			const transition = (document as any).startViewTransition(applyChanges);
			transition.finished.then(() => log('view transition finished'));
		} else {
			log('applying without view transition, useViewTransition:', useViewTransition, 'hasAPI:', 'startViewTransition' in document);
			applyChanges();
		}
	}

	const onDragStart = (e: Event) => {
		const detail = (e as CustomEvent<DragStartDetail>).detail;
		draggedElement = detail.item;
		draggedItemId = getItemId(detail.item);
		dragSource = detail.source;

		// Capture column count BEFORE any CSS changes to avoid implicit columns from span values
		dragStartColumnCount = getCurrentColumnCount();

		// Store original positions to reset from during drag
		const items = readItemsFromDOM(gridElement);
		originalPositions = new Map();
		for (const item of items) {
			originalPositions.set(item.id, { column: item.column, row: item.row });
		}

		// In CSS injection mode, clear inline styles so CSS rules take effect
		if (styles) {
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
			styles.set('preview', css);
			styles.commit();
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

		// Check if this is a pointer drag or keyboard nudge
		const isPointerDrag = dragSource === 'pointer';
		log('drag-end isPointerDrag:', isPointerDrag, 'source:', dragSource);

		// Clear the 'dragging' viewTransitionName so CSS view-transition-name applies
		if (draggedElement && draggedElement.style.viewTransitionName === 'dragging') {
			draggedElement.style.viewTransitionName = '';
		}

		// For pointer drag: don't use View Transitions - other items are already in position
		// from drag-move, and FLIP handles the dropped item. Using VT would conflict with FLIP.
		// For keyboard nudge: use View Transitions to animate all items.
		const useViewTransition = !isPointerDrag;
		log('drag-end useViewTransition:', useViewTransition);

		// Capture values needed for the callback before clearing state
		const savedDragStartColumnCount = dragStartColumnCount;

		// Callback to save layout - runs inside View Transition callback so it happens
		// AFTER the new state is captured (prevents layout-styles from updating too early)
		const saveToLayoutModel = () => {
			if (layoutModel && savedDragStartColumnCount) {
				const positions = new Map<string, ItemPosition>();
				for (const item of finalLayout) {
					positions.set(item.id, { column: item.column, row: item.row });
				}
				layoutModel.saveLayout(savedDragStartColumnCount, positions);
				log('saved layout to model for', savedDragStartColumnCount, 'columns');

				// Clear preview styles so container query CSS (base layer) takes over.
				// This is safe because layoutModel now has the correct positions, and
				// we're inside the View Transition callback so any mismatch gets animated.
				if (styles) {
					styles.clear('preview');
					styles.commit();
					log('cleared preview styles');
				}
			}
		};

		applyLayout(finalLayout, null, useViewTransition, saveToLayoutModel);

		draggedItemId = null;
		draggedElement = null;
		dragSource = null;
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
		dragSource = null;
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
	let resizeSource: DragSource | null = null;
	let resizeOriginalPositions: Map<string, { column: number; row: number; width: number; height: number }> | null = null;
	let lastResizeLayout: { cell: GridCell; colspan: number; rowspan: number } | null = null;
	let resizeStartColumnCount: number | null = null; // Track column count at resize start

	const onResizeStart = (e: Event) => {
		const detail = (e as CustomEvent<ResizeStartDetail>).detail;
		resizedElement = detail.item;
		resizedItemId = getItemId(detail.item);
		resizeSource = detail.source;

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
		if (styles) {
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
			styles.set('preview', css);
			styles.commit();
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

		// Apply layout WITH view transitions so other items animate smoothly during resize.
		// The resized item itself has viewTransitionName='resizing' which suppresses its animation.
		// The lastResizeLayout deduplication above prevents rapid-fire VT updates.
		applyLayout(newLayout, resizedItemId, true);
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

		// Check if this is a pointer resize or keyboard resize using event source
		const isPointerResize = resizeSource === 'pointer';
		log('resize-end isPointerResize:', isPointerResize, 'source:', resizeSource);

		// For pointer resize: don't use View Transitions - other items are already in position
		// from resize-move, and FLIP handles the resized item. Using VT would conflict with FLIP.
		// For keyboard resize: use View Transitions to animate all items.
		const useViewTransition = !isPointerResize;
		log('resize-end: useViewTransition:', useViewTransition);

		// Capture values needed for the callback before clearing state
		const savedResizedItemId = resizedItemId;
		const savedResizeStartColumnCount = resizeStartColumnCount;

		// Callback to save layout - runs inside View Transition callback so it happens
		// AFTER the new state is captured (prevents layout-styles from updating too early)
		const saveToLayoutModel = () => {
			if (layoutModel && savedResizeStartColumnCount) {
				const positions = new Map<string, ItemPosition>();
				for (const item of finalLayout) {
					positions.set(item.id, { column: item.column, row: item.row });
				}
				// Save positions first, then update size. This order ensures the intermediate
				// CSS state (old size + new positions) is valid, rather than (new size + old positions)
				// which could cause overlapping items.
				layoutModel.saveLayout(savedResizeStartColumnCount, positions);
				layoutModel.updateItemSize(savedResizedItemId!, { width: detail.colspan, height: detail.rowspan });
				log('saved resize layout to model for', savedResizeStartColumnCount, 'columns');

				// Clear preview styles so container query CSS (base layer) takes over.
				// This is safe because layoutModel now has the correct positions/sizes, and
				// we're inside the View Transition callback so any mismatch gets animated.
				if (styles) {
					styles.clear('preview');
					styles.commit();
					log('cleared preview styles');
				}
			}
		};

		applyLayout(finalLayout, null, useViewTransition, saveToLayoutModel);

		resizedItemId = null;
		resizedElement = null;
		resizeSource = null;
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
		resizeSource = null;
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
		},
	) {
		return attachPushAlgorithm(core.element, {
			...options,
			core: options?.core ?? core,
		});
	},
});
