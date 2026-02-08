/**
 * Reorder layout algorithm for Gridiot
 *
 * Sequence-based reflow: items have a logical order, dragging changes
 * position in that sequence, all items reflow like CSS Grid auto-placement.
 *
 * Usage (pure functions):
 *   import { calculateReorderLayout, reflowItems, layoutToCSS } from 'gridiot/algorithm-reorder';
 *
 * Usage (DOM integration):
 *   import { attachReorderAlgorithm } from 'gridiot/algorithm-reorder';
 *   const detach = attachReorderAlgorithm(grid.element, { core });
 */

import { registerPlugin } from '../engine';

// Re-export pure algorithm functions
export {
	calculateReorderLayout,
	getItemOrder,
	layoutToCSS,
	reflowItems,
	type CalculateReorderLayoutOptions,
	type GridCell,
	type ItemRect,
	type LayoutToCSSOptions,
} from './algorithm-reorder-core';

import type {
	AlgorithmReorderPluginOptions,
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
	calculateReorderLayout,
	reflowItems,
	type ItemRect,
} from './algorithm-reorder-core';

import { layoutToCSS } from './algorithm-push-core';
import { readItemsFromDOM } from './algorithm-push';

const DEBUG = false;
function log(...args: unknown[]) {
	if (DEBUG) console.log('[algorithm-reorder]', ...args);
}

/**
 * Options for attachReorderAlgorithm
 */
export interface AttachReorderAlgorithmOptions {
	selectorPrefix?: string;
	selectorSuffix?: string;
	core?: GridiotCore;
	layoutModel?: ResponsiveLayoutModel;
}

/**
 * Attach reorder algorithm to a grid element.
 *
 * Listens to drag/resize events and reflows items in sequence order.
 * Layout changes are animated via View Transitions.
 *
 * @param gridElement - The grid container element
 * @param options - Configuration options
 * @returns Cleanup function to detach the algorithm
 */
export function attachReorderAlgorithm(
	gridElement: HTMLElement,
	options: AttachReorderAlgorithmOptions = {},
): () => void {
	const { selectorPrefix = '#', selectorSuffix = '', core, layoutModel } = options;
	const styles: StyleManager | null = core?.styles ?? null;

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
		const newLayout = calculateReorderLayout(items, draggedItemId, detail.cell, { columns });
		log('drag-move', { targetCell: detail.cell });
		applyLayout(newLayout, draggedItemId, true);

		// Emit drop-preview so the placeholder knows the actual landing position.
		// Use queueMicrotask to ensure this fires AFTER all drag-move handlers
		// (including the placeholder's) have finished, regardless of listener order.
		const landingItem = newLayout.find((it) => it.id === draggedItemId);
		if (landingItem) {
			const previewDetail = {
				cell: { column: landingItem.column, row: landingItem.row },
				colspan: landingItem.width,
				rowspan: landingItem.height,
			};
			queueMicrotask(() => {
				gridElement.dispatchEvent(new CustomEvent('gridiot:drop-preview', {
					detail: previewDetail,
					bubbles: true,
				}));
			});
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
		const finalLayout = calculateReorderLayout(items, draggedItemId, detail.cell, { columns });

		const isPointerDrag = dragSource === 'pointer';
		if (draggedElement && draggedElement.style.viewTransitionName === 'dragging') {
			draggedElement.style.viewTransitionName = '';
		}

		const useViewTransition = !isPointerDrag;
		const savedDragStartColumnCount = dragStartColumnCount;

		const saveToLayoutModel = () => {
			if (layoutModel && savedDragStartColumnCount) {
				const positions = new Map<string, ItemPosition>();
				for (const item of finalLayout) {
					positions.set(item.id, { column: item.column, row: item.row });
				}
				layoutModel.saveLayout(savedDragStartColumnCount, positions);
				if (styles) {
					styles.clear('preview');
					styles.commit();
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

		if (!cell) return;
		pendingCell = null;

		const items: ItemRect[] = readItemsFromDOM(gridElement).map((item) => {
			const original = originalPositions!.get(item.id);
			if (original && item.id !== draggedItemId) {
				return { ...item, column: original.column, row: original.row };
			}
			return item;
		});

		const columns = dragStartColumnCount ?? getCurrentColumnCount();
		const newLayout = calculateReorderLayout(items, draggedItemId!, cell, { columns });
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
	let resizeStartColumnCount: number | null = null;

	const onResizeStart = (e: Event) => {
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
		// For resize, reflow all items in their current order with the resized item's new size
		const ordered = items.map((item) => ({ ...item }));
		ordered.sort((a, b) => a.row - b.row || a.column - b.column);
		const newLayout = reflowItems(ordered, columns);

		log('resize-move', { size: { colspan: detail.colspan, rowspan: detail.rowspan } });
		applyLayout(newLayout, resizedItemId, true);
	};

	const onResizeEnd = (e: Event) => {
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
		const ordered = items.map((item) => ({ ...item }));
		ordered.sort((a, b) => a.row - b.row || a.column - b.column);
		const finalLayout = reflowItems(ordered, columns);

		const isPointerResize = resizeSource === 'pointer';
		const useViewTransition = !isPointerResize;
		const savedResizedItemId = resizedItemId;
		const savedResizeStartColumnCount = resizeStartColumnCount;

		const saveToLayoutModel = () => {
			if (layoutModel && savedResizeStartColumnCount) {
				const positions = new Map<string, ItemPosition>();
				for (const item of finalLayout) {
					positions.set(item.id, { column: item.column, row: item.row });
				}
				layoutModel.saveLayout(savedResizeStartColumnCount, positions);
				layoutModel.updateItemSize(savedResizedItemId!, { width: detail.colspan, height: detail.rowspan });
				if (styles) {
					styles.clear('preview');
					styles.commit();
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
	// Event listeners
	// =========================================================================

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
	name: 'algorithm-reorder',
	init(
		core,
		options?: AlgorithmReorderPluginOptions & {
			core?: GridiotCore;
			layoutModel?: ResponsiveLayoutModel;
		},
	) {
		return attachReorderAlgorithm(core.element, {
			...options,
			core: options?.core ?? core,
		});
	},
});
