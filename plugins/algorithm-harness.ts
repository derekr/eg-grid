/**
 * Shared DOM integration harness for layout algorithms.
 *
 * Provides the boilerplate that every algorithm needs: event listeners for
 * drag/resize, View Transitions, CSS injection via StyleManager, layout
 * provider registration, camera-settled handling, and cleanup.
 *
 * Individual algorithms implement AlgorithmStrategy and call attachAlgorithm().
 */

import { listenEvents } from '../engine';
import type {
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

// ============================================================================
// Shared types (originally in algorithm-push-core.ts)
// ============================================================================

export interface ItemRect {
	id: string;
	column: number;
	row: number;
	width: number;
	height: number;
}

/**
 * Options for CSS generation
 */
export interface LayoutToCSSOptions {
	selectorPrefix?: string;
	selectorSuffix?: string;
	excludeSelector?: string;
	maxColumns?: number;
}

// ============================================================================
// Shared pure functions
// ============================================================================

/**
 * Convert layout to CSS rules for injection into a <style> tag.
 */
export function layoutToCSS(
	items: ItemRect[],
	options: LayoutToCSSOptions = {},
): string {
	const {
		selectorPrefix = '#',
		selectorSuffix = '',
		excludeSelector = '',
		maxColumns,
	} = options;

	const rules: string[] = [];

	for (const item of items) {
		const width = maxColumns ? Math.min(item.width, maxColumns) : item.width;
		const column = maxColumns ? Math.max(1, Math.min(item.column, maxColumns - width + 1)) : item.column;
		const selector = `${selectorPrefix}${item.id}${selectorSuffix}${excludeSelector}`;
		const gridColumn = `${column} / span ${width}`;
		const gridRow = `${item.row} / span ${item.height}`;

		rules.push(`${selector} { grid-column: ${gridColumn}; grid-row: ${gridRow}; }`);
	}

	return rules.join('\n');
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

// ============================================================================
// Strategy interface
// ============================================================================

export interface AlgorithmStrategy {
	/** Calculate layout after a drag move/end */
	calculateDragLayout(
		items: ItemRect[],
		movedId: string,
		targetCell: GridCell,
		columns: number,
	): ItemRect[];

	/** Optional hook called after drag-move layout is applied (e.g. emit drop-preview) */
	afterDragMove?(
		layout: ItemRect[],
		movedId: string,
		gridElement: HTMLElement,
	): void;

	/** Calculate layout after a resize move/end. If undefined, resize events are ignored. */
	calculateResizeLayout?(
		items: ItemRect[],
		resizedId: string,
		cell: GridCell,
		colspan: number,
		rowspan: number,
		columns: number,
	): ItemRect[];
}

// ============================================================================
// Harness options
// ============================================================================

export interface AlgorithmHarnessOptions {
	selectorPrefix?: string;
	selectorSuffix?: string;
	core?: GridiotCore;
	layoutModel?: ResponsiveLayoutModel;
}

// ============================================================================
// attachAlgorithm — shared DOM integration
// ============================================================================

/**
 * Attach a layout algorithm strategy to a grid element.
 *
 * Handles all DOM event wiring, View Transitions, CSS injection, layout model
 * persistence, and cleanup. The strategy only needs to provide pure layout
 * calculation functions.
 *
 * @param gridElement - The grid container element
 * @param strategy - Algorithm-specific layout functions
 * @param options - Configuration options
 * @param debugLabel - Label for debug logging (e.g. 'algorithm-push')
 * @returns Cleanup function to detach the algorithm
 */
export function attachAlgorithm(
	gridElement: HTMLElement,
	strategy: AlgorithmStrategy,
	options: AlgorithmHarnessOptions = {},
	debugLabel = 'algorithm',
): () => void {
	const { selectorPrefix = '#', selectorSuffix = '', core, layoutModel } = options;
	const styles: StyleManager | null = core?.styles ?? null;

	const DEBUG = false;
	function log(...args: unknown[]) {
		if (DEBUG) console.log(`[${debugLabel}]`, ...args);
	}

	function getCurrentColumnCount(): number {
		const style = getComputedStyle(gridElement);
		const columns = style.gridTemplateColumns.split(' ').filter(Boolean);
		return Math.max(1, columns.length);
	}

	let originalPositions: Map<string, { column: number; row: number }> | null = null;
	let draggedItemId: string | null = null;
	let draggedElement: HTMLElement | null = null;
	let dragSource: DragSource | null = null;
	let layoutVersion = 0;
	let currentLayout: ItemRect[] | null = null;
	let dragStartColumnCount: number | null = null;

	// Resize state
	let resizedItemId: string | null = null;
	let resizedElement: HTMLElement | null = null;
	let resizeSource: DragSource | null = null;
	let resizeOriginalPositions: Map<string, { column: number; row: number; width: number; height: number }> | null = null;
	let lastResizeLayout: { cell: GridCell; colspan: number; rowspan: number } | null = null;
	let resizeStartColumnCount: number | null = null;

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

	function saveAndClearPreview(layout: ItemRect[], columnCount: number, afterSave?: () => void): void {
		if (!layoutModel || !columnCount) return;
		const positions = new Map<string, ItemPosition>();
		for (const item of layout) {
			positions.set(item.id, { column: item.column, row: item.row });
		}
		layoutModel.saveLayout(columnCount, positions);
		if (afterSave) afterSave();
		log('saved layout to model for', columnCount, 'columns');
		if (styles) {
			styles.clear('preview');
			styles.commit();
			log('cleared preview styles');
		}
	}

	function applyLayout(
		layout: ItemRect[],
		excludeId: string | null,
		useViewTransition: boolean,
		onApplied?: () => void,
	): void {
		const thisVersion = ++layoutVersion;
		currentLayout = layout;
		const capturedColumnCount = dragStartColumnCount ?? resizeStartColumnCount;

		const applyChanges = () => {
			if (thisVersion !== layoutVersion) return;

			if (styles) {
				const itemsToStyle = excludeId
					? layout.filter((item) => item.id !== excludeId)
					: layout;
				const css = layoutToCSS(itemsToStyle, {
					selectorPrefix,
					selectorSuffix,
					maxColumns: capturedColumnCount ?? undefined,
				});
				log('injecting CSS:', css.substring(0, 200) + '...');
				styles.set('preview', css);
				styles.commit();

				const elements = gridElement.querySelectorAll('[data-gridiot-item]');
				for (const el of elements) {
					const element = el as HTMLElement;
					const id = getItemId(element);
					const vtn = element.style.viewTransitionName;
					if (id !== excludeId && vtn !== 'none') {
						element.style.gridColumn = '';
						element.style.gridRow = '';
					}
				}
			} else {
				const elements = gridElement.querySelectorAll('[data-gridiot-item]');
				for (const el of elements) {
					const element = el as HTMLElement;
					const id = getItemId(element);
					if (id === excludeId) continue;
					const item = layout.find((it) => it.id === id);
					if (item) {
						const colspan = parseInt(element.getAttribute('data-gridiot-colspan') || '1', 10) || 1;
						const rowspan = parseInt(element.getAttribute('data-gridiot-rowspan') || '1', 10) || 1;
						element.style.gridColumn = `${item.column} / span ${colspan}`;
						element.style.gridRow = `${item.row} / span ${rowspan}`;
					}
				}
			}

			if (onApplied) onApplied();
		};

		if (useViewTransition && 'startViewTransition' in document) {
			if (draggedElement && excludeId) {
				draggedElement.style.viewTransitionName = 'dragging';
			}
			const transition = (document as any).startViewTransition(applyChanges);
			transition.finished.then(() => log('view transition finished'));
		} else {
			applyChanges();
		}
	}

	// =========================================================================
	// Drag event handlers
	// =========================================================================

	const onDragStart = (e: Event) => {
		const detail = (e as CustomEvent<DragStartDetail>).detail;
		draggedElement = detail.item;
		draggedItemId = getItemId(detail.item);
		dragSource = detail.source;
		dragStartColumnCount = getCurrentColumnCount();

		const items = readItemsFromDOM(gridElement);
		originalPositions = new Map();
		for (const item of items) {
			originalPositions.set(item.id, { column: item.column, row: item.row });
		}

		if (styles) {
			const elements = gridElement.querySelectorAll('[data-gridiot-item]');
			for (const el of elements) {
				const element = el as HTMLElement;
				if (element !== draggedElement) {
					element.style.gridColumn = '';
					element.style.gridRow = '';
				}
			}
			const css = layoutToCSS(items, { selectorPrefix, selectorSuffix, maxColumns: dragStartColumnCount });
			styles.set('preview', css);
			styles.commit();
		}

		log('drag-start', { item: draggedItemId });
	};

	let pendingCell: GridCell | null = null;

	const onDragMove = (e: Event) => {
		if (!draggedItemId || !originalPositions) return;
		const detail = (e as CustomEvent<DragMoveDetail>).detail;

		if (core) {
			const cameraState = core.providers.get<CameraState>('camera');
			if (cameraState?.isScrolling) {
				pendingCell = detail.cell;
				log('drag-move deferred (camera scrolling)', pendingCell);
				return;
			}
		}
		pendingCell = null;

		const items: ItemRect[] = readItemsFromDOM(gridElement).map((item) => {
			const original = originalPositions!.get(item.id);
			if (original && item.id !== draggedItemId) {
				return { ...item, column: original.column, row: original.row };
			}
			return item;
		});

		const columns = dragStartColumnCount ?? getCurrentColumnCount();
		const newLayout = strategy.calculateDragLayout(items, draggedItemId, detail.cell, columns);
		log('drag-move', { targetCell: detail.cell });
		applyLayout(newLayout, draggedItemId, true);

		if (strategy.afterDragMove) {
			strategy.afterDragMove(newLayout, draggedItemId, gridElement);
		}
	};

	const onDragEnd = (e: Event) => {
		if (!draggedItemId || !originalPositions) return;
		const detail = (e as CustomEvent<DragEndDetail>).detail;

		const items: ItemRect[] = readItemsFromDOM(gridElement).map((item) => {
			const original = originalPositions!.get(item.id);
			if (original && item.id !== draggedItemId) {
				return { ...item, column: original.column, row: original.row };
			}
			return item;
		});

		const columns = dragStartColumnCount ?? getCurrentColumnCount();
		const finalLayout = strategy.calculateDragLayout(items, draggedItemId, detail.cell, columns);

		const isPointerDrag = dragSource === 'pointer';
		if (draggedElement && draggedElement.style.viewTransitionName === 'dragging') {
			draggedElement.style.viewTransitionName = '';
		}

		const useViewTransition = !isPointerDrag;
		const savedDragStartColumnCount = dragStartColumnCount;

		applyLayout(finalLayout, null, useViewTransition, () =>
			saveAndClearPreview(finalLayout, savedDragStartColumnCount!),
		);

		draggedItemId = null;
		draggedElement = null;
		dragSource = null;
		originalPositions = null;
		pendingCell = null;
		dragStartColumnCount = null;
	};

	const onDragCancel = () => {
		if (!draggedItemId || !originalPositions) return;

		if (draggedElement && draggedElement.style.viewTransitionName === 'dragging') {
			draggedElement.style.viewTransitionName = '';
		}

		const restoreLayout: ItemRect[] = readItemsFromDOM(gridElement).map((item) => {
			const original = originalPositions!.get(item.id);
			if (original) {
				return { ...item, column: original.column, row: original.row };
			}
			return item;
		});

		const restore = () => applyLayout(restoreLayout, null, false);

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

	const onCameraSettled = () => {
		if (!draggedItemId || !originalPositions) return;

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

		const items: ItemRect[] = readItemsFromDOM(gridElement).map((item) => {
			const original = originalPositions!.get(item.id);
			if (original && item.id !== draggedItemId) {
				return { ...item, column: original.column, row: original.row };
			}
			return item;
		});

		const columns = dragStartColumnCount ?? getCurrentColumnCount();
		const newLayout = strategy.calculateDragLayout(items, draggedItemId!, cell, columns);
		applyLayout(newLayout, draggedItemId, true);

		if (strategy.afterDragMove) {
			strategy.afterDragMove(newLayout, draggedItemId!, gridElement);
		}
	};

	// =========================================================================
	// Resize event handlers (only if strategy supports resize)
	// =========================================================================

	const onResizeStart = (e: Event) => {
		if (!strategy.calculateResizeLayout) return;
		const detail = (e as CustomEvent<ResizeStartDetail>).detail;
		resizedElement = detail.item;
		resizedItemId = getItemId(detail.item);
		resizeSource = detail.source;
		resizeStartColumnCount = getCurrentColumnCount();

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

		if (styles) {
			const elements = gridElement.querySelectorAll('[data-gridiot-item]');
			for (const el of elements) {
				const element = el as HTMLElement;
				if (element !== resizedElement) {
					element.style.gridColumn = '';
					element.style.gridRow = '';
				}
			}
			const css = layoutToCSS(items, { selectorPrefix, selectorSuffix, maxColumns: resizeStartColumnCount });
			styles.set('preview', css);
			styles.commit();
		}

		lastResizeLayout = null;
		log('resize-start', { item: resizedItemId });
	};

	const onResizeMove = (e: Event) => {
		if (!strategy.calculateResizeLayout) return;
		if (!resizedItemId || !resizeOriginalPositions) return;
		const detail = (e as CustomEvent<ResizeMoveDetail>).detail;

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

		const columns = resizeStartColumnCount ?? getCurrentColumnCount();
		const newLayout = strategy.calculateResizeLayout(items, resizedItemId, detail.cell, detail.colspan, detail.rowspan, columns);
		log('resize-move', { size: { colspan: detail.colspan, rowspan: detail.rowspan } });
		applyLayout(newLayout, resizedItemId, true);
	};

	const onResizeEnd = (e: Event) => {
		if (!strategy.calculateResizeLayout) return;
		if (!resizedItemId || !resizeOriginalPositions) return;
		const detail = (e as CustomEvent<ResizeEndDetail>).detail;

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

		const columns = resizeStartColumnCount ?? getCurrentColumnCount();
		const finalLayout = strategy.calculateResizeLayout(items, resizedItemId, detail.cell, detail.colspan, detail.rowspan, columns);

		const isPointerResize = resizeSource === 'pointer';
		const useViewTransition = !isPointerResize;
		const savedResizedItemId = resizedItemId;
		const savedResizeStartColumnCount = resizeStartColumnCount;

		applyLayout(finalLayout, null, useViewTransition, () =>
			saveAndClearPreview(finalLayout, savedResizeStartColumnCount!, () => {
				layoutModel!.updateItemSize(savedResizedItemId!, { width: detail.colspan, height: detail.rowspan });
			}),
		);

		resizedItemId = null;
		resizedElement = null;
		resizeSource = null;
		resizeOriginalPositions = null;
		lastResizeLayout = null;
		resizeStartColumnCount = null;
	};

	const onResizeCancel = () => {
		if (!resizedItemId || !resizeOriginalPositions) return;

		const restoreLayout: ItemRect[] = readItemsFromDOM(gridElement).map((item) => {
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
		});

		const restore = () => applyLayout(restoreLayout, null, false);

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

	// =========================================================================
	// Event listener registration
	// =========================================================================

	return listenEvents(gridElement, {
		'gridiot:drag-start': onDragStart,
		'gridiot:drag-move': onDragMove,
		'gridiot:drag-end': onDragEnd,
		'gridiot:drag-cancel': onDragCancel,
		'gridiot:camera-settled': onCameraSettled,
		'gridiot:resize-start': onResizeStart,
		'gridiot:resize-move': onResizeMove,
		'gridiot:resize-end': onResizeEnd,
		'gridiot:resize-cancel': onResizeCancel,
	});
}
