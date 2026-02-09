/**
 * Placeholder plugin for EG Grid
 *
 * Shows a visual placeholder where the dragged item will land.
 * Handles creation, positioning, and cleanup automatically.
 */

import { listenEvents } from '../engine';
import type {
	DragStartDetail,
	DragMoveDetail,
	DragEndDetail,
	DragCancelDetail,
	DropPreviewDetail,
	ResizeStartDetail,
	ResizeMoveDetail,
	ResizeEndDetail,
	ResizeCancelDetail,
} from '../types';

export interface PlaceholderOptions {
	/**
	 * CSS class name for the placeholder element.
	 * @default 'egg-placeholder'
	 */
	className?: string;

	/**
	 * Custom element to use as placeholder instead of creating one.
	 * If provided, className is ignored.
	 */
	element?: HTMLElement;

	/**
	 * Whether to disable view-transition-name on the placeholder.
	 * Set to true to prevent the placeholder from animating with View Transitions.
	 * @default true
	 */
	disableViewTransition?: boolean;
}

export interface PlaceholderInstance {
	/** Manually show the placeholder at a position */
	show(column: number, row: number, colspan?: number, rowspan?: number): void;
	/** Manually hide the placeholder */
	hide(): void;
	/** Remove event listeners and clean up */
	destroy(): void;
}

/**
 * Attach a placeholder to a EG Grid grid element.
 *
 * @example
 * ```js
 * import { init } from './eg-grid.js';
 * import { attachPlaceholder } from './placeholder.js';
 *
 * const grid = init(document.getElementById('grid'));
 * const placeholder = attachPlaceholder(grid.element);
 *
 * // Later, to clean up:
 * placeholder.destroy();
 * ```
 */
export function attachPlaceholder(
	gridElement: HTMLElement,
	options: PlaceholderOptions = {}
): PlaceholderInstance {
	const {
		className = 'egg-placeholder',
		element: customElement,
		disableViewTransition = true,
	} = options;

	let placeholder: HTMLElement | null = null;
	let isCustomElement = false;

	function create(): void {
		if (placeholder) return;

		if (customElement) {
			placeholder = customElement;
			isCustomElement = true;
		} else {
			placeholder = document.createElement('div');
			placeholder.className = className;
		}

		// Prevent placeholder from interfering with pointer events
		placeholder.style.pointerEvents = 'none';

		// Disable view transitions on placeholder to prevent animation artifacts
		if (disableViewTransition) {
			placeholder.style.viewTransitionName = 'none';
		}

		gridElement.appendChild(placeholder);
	}

	function update(
		column: number,
		row: number,
		colspan: number = 1,
		rowspan: number = 1
	): void {
		if (!placeholder) return;
		placeholder.style.gridColumn = `${column} / span ${colspan}`;
		placeholder.style.gridRow = `${row} / span ${rowspan}`;
	}

	function remove(): void {
		if (placeholder) {
			placeholder.remove();
			// Only null out if we created it; keep reference if custom
			if (!isCustomElement) {
				placeholder = null;
			}
		}
	}

	// Event handlers
	function handleDragStart(e: CustomEvent<DragStartDetail>): void {
		const { cell, colspan, rowspan } = e.detail;
		create();
		update(cell.column, cell.row, colspan, rowspan);
	}

	function handleDragMove(e: CustomEvent<DragMoveDetail>): void {
		const { cell, colspan, rowspan } = e.detail;
		update(cell.column, cell.row, colspan, rowspan);
	}

	// Algorithm plugins (e.g. reorder) emit drop-preview when the actual
	// landing position differs from the raw pointer cell. Override the
	// placeholder position so it shows where the item will really land.
	function handleDropPreview(e: CustomEvent<DropPreviewDetail>): void {
		const { cell, colspan, rowspan } = e.detail;
		update(cell.column, cell.row, colspan, rowspan);
	}

	function handleDragEnd(_e: CustomEvent<DragEndDetail>): void {
		remove();
	}

	function handleDragCancel(_e: CustomEvent<DragCancelDetail>): void {
		remove();
	}

	// Resize event handlers
	// The placeholder shows where the item will land after resize. For handles that
	// change position (NW, NE, SW, N, W), the cell position changes but the anchor
	// corner stays fixed. This is correct - the placeholder shows the final landing spot.
	function handleResizeStart(e: CustomEvent<ResizeStartDetail>): void {
		const { cell, colspan, rowspan } = e.detail;
		create();
		update(cell.column, cell.row, colspan, rowspan);
	}

	function handleResizeMove(e: CustomEvent<ResizeMoveDetail>): void {
		const { cell, colspan, rowspan } = e.detail;
		update(cell.column, cell.row, colspan, rowspan);
	}

	function handleResizeEnd(_e: CustomEvent<ResizeEndDetail>): void {
		remove();
	}

	function handleResizeCancel(_e: CustomEvent<ResizeCancelDetail>): void {
		remove();
	}

	// Fallback cleanup for edge cases (pointer released outside window, etc.)
	function handlePointerUp(): void {
		requestAnimationFrame(() => {
			if (
				placeholder &&
				!document.querySelector('[data-egg-dragging]') &&
				!document.querySelector('[data-egg-resizing]')
			) {
				remove();
			}
		});
	}

	function handlePointerCancel(): void {
		remove();
	}

	// Attach listeners
	const removeGridListeners = listenEvents(gridElement, {
		'egg-drag-start': handleDragStart as EventListener,
		'egg-drag-move': handleDragMove as EventListener,
		'egg-drag-end': handleDragEnd as EventListener,
		'egg-drag-cancel': handleDragCancel as EventListener,
		'egg-drop-preview': handleDropPreview as EventListener,
		'egg-resize-start': handleResizeStart as EventListener,
		'egg-resize-move': handleResizeMove as EventListener,
		'egg-resize-end': handleResizeEnd as EventListener,
		'egg-resize-cancel': handleResizeCancel as EventListener,
	});
	const removeDocListeners = listenEvents(document, {
		pointerup: handlePointerUp,
		pointercancel: handlePointerCancel,
	});

	// Public API
	return {
		show(
			column: number,
			row: number,
			colspan: number = 1,
			rowspan: number = 1
		): void {
			create();
			update(column, row, colspan, rowspan);
		},

		hide(): void {
			remove();
		},

		destroy(): void {
			remove();
			removeGridListeners();
			removeDocListeners();
		},
	};
}

