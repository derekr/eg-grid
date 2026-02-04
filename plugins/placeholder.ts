/**
 * Placeholder plugin for Gridiot
 *
 * Shows a visual placeholder where the dragged item will land.
 * Handles creation, positioning, and cleanup automatically.
 */

import { registerPlugin } from '../engine';
import type {
	DragStartDetail,
	DragMoveDetail,
	DragEndDetail,
	DragCancelDetail,
	PlaceholderPluginOptions,
	ResizeStartDetail,
	ResizeMoveDetail,
	ResizeEndDetail,
	ResizeCancelDetail,
} from '../types';

export interface PlaceholderOptions {
	/**
	 * CSS class name for the placeholder element.
	 * @default 'gridiot-placeholder'
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
 * Attach a placeholder to a Gridiot grid element.
 *
 * @example
 * ```js
 * import { init } from './gridiot.js';
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
		className = 'gridiot-placeholder',
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
				!document.querySelector('[data-gridiot-dragging]') &&
				!document.querySelector('[data-gridiot-resizing]')
			) {
				remove();
			}
		});
	}

	function handlePointerCancel(): void {
		remove();
	}

	// Attach listeners
	gridElement.addEventListener(
		'gridiot:drag-start',
		handleDragStart as EventListener
	);
	gridElement.addEventListener(
		'gridiot:drag-move',
		handleDragMove as EventListener
	);
	gridElement.addEventListener(
		'gridiot:drag-end',
		handleDragEnd as EventListener
	);
	gridElement.addEventListener(
		'gridiot:drag-cancel',
		handleDragCancel as EventListener
	);
	// Resize events
	gridElement.addEventListener(
		'gridiot:resize-start',
		handleResizeStart as EventListener
	);
	gridElement.addEventListener(
		'gridiot:resize-move',
		handleResizeMove as EventListener
	);
	gridElement.addEventListener(
		'gridiot:resize-end',
		handleResizeEnd as EventListener
	);
	gridElement.addEventListener(
		'gridiot:resize-cancel',
		handleResizeCancel as EventListener
	);
	document.addEventListener('pointerup', handlePointerUp);
	document.addEventListener('pointercancel', handlePointerCancel);

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
			gridElement.removeEventListener(
				'gridiot:drag-start',
				handleDragStart as EventListener
			);
			gridElement.removeEventListener(
				'gridiot:drag-move',
				handleDragMove as EventListener
			);
			gridElement.removeEventListener(
				'gridiot:drag-end',
				handleDragEnd as EventListener
			);
			gridElement.removeEventListener(
				'gridiot:drag-cancel',
				handleDragCancel as EventListener
			);
			// Resize events
			gridElement.removeEventListener(
				'gridiot:resize-start',
				handleResizeStart as EventListener
			);
			gridElement.removeEventListener(
				'gridiot:resize-move',
				handleResizeMove as EventListener
			);
			gridElement.removeEventListener(
				'gridiot:resize-end',
				handleResizeEnd as EventListener
			);
			gridElement.removeEventListener(
				'gridiot:resize-cancel',
				handleResizeCancel as EventListener
			);
			document.removeEventListener('pointerup', handlePointerUp);
			document.removeEventListener('pointercancel', handlePointerCancel);
		},
	};
}

/**
 * Default CSS for the placeholder.
 * Include this in your stylesheet or use attachPlaceholderStyles().
 */
export const PLACEHOLDER_CSS = `
.gridiot-placeholder {
  background: rgba(255, 255, 255, 0.1);
  border: 2px dashed rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  pointer-events: none;
}
`;

/**
 * Inject default placeholder styles into the document.
 * Call once at app initialization if you don't want to add CSS manually.
 */
export function attachPlaceholderStyles(): void {
	if (document.getElementById('gridiot-placeholder-styles')) return;

	const style = document.createElement('style');
	style.id = 'gridiot-placeholder-styles';
	style.textContent = PLACEHOLDER_CSS;
	document.head.appendChild(style);
}

// Register as a plugin for auto-initialization via init()
registerPlugin({
	name: 'placeholder',
	init(core, options?: PlaceholderPluginOptions) {
		const instance = attachPlaceholder(core.element, options);
		return () => instance.destroy();
	},
});
