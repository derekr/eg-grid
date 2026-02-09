import type { GridCell, EggCore, InitOptions, StyleManager } from './types';
import { createStateMachine } from './state-machine';
import { attachPointer } from './plugins/pointer';
import { attachKeyboard } from './plugins/keyboard';
import { attachAccessibility } from './plugins/accessibility';
import { attachResize } from './plugins/resize';
import { attachCamera } from './plugins/camera';
import { attachPlaceholder } from './plugins/placeholder';
import { attachPushAlgorithm } from './plugins/algorithm-push';
import { attachReorderAlgorithm } from './plugins/algorithm-reorder';
import { attachResponsive } from './plugins/responsive';

/**
 * Initialize EG Grid on a CSS Grid element
 *
 * @param element - The CSS Grid container element
 * @param options - Configuration options
 */
export function init(element: HTMLElement, options: InitOptions = {}): EggCore {
	const {
		layoutModel,
		styleElement,
	} = options;

	const cleanups: (() => void)[] = [];

	// Create centralized state machine
	const stateMachine = createStateMachine();

	// Track selected element (state machine stores itemId, we need the element)
	let selectedElement: HTMLElement | null = null;

	// StyleManager: single style element, multiple named layers
	const styleLayers = new Map<string, string>(); // layer name → CSS
	const layerOrder: string[] = []; // insertion order
	const managedStyleElement = styleElement ?? document.createElement('style');
	if (!styleElement) {
		document.head.appendChild(managedStyleElement);
		cleanups.push(() => managedStyleElement.remove());
	}

	// Pre-populate 'base' layer with any existing content (e.g. server-rendered CSS)
	const existingCSS = managedStyleElement.textContent?.trim();
	if (existingCSS) {
		styleLayers.set('base', existingCSS);
		layerOrder.push('base');
	}

	const styles: StyleManager = {
		set(layer: string, css: string): void {
			if (!styleLayers.has(layer)) {
				layerOrder.push(layer);
			}
			styleLayers.set(layer, css);
		},
		get(layer: string): string {
			return styleLayers.get(layer) ?? '';
		},
		clear(layer: string): void {
			if (styleLayers.has(layer)) {
				styleLayers.set(layer, '');
			}
		},
		commit(): void {
			const parts: string[] = [];
			for (const layer of layerOrder) {
				const css = styleLayers.get(layer);
				if (css) parts.push(css);
			}
			managedStyleElement.textContent = parts.join('\n\n');
		},
	};

	const core: EggCore = {
		element,
		stateMachine,
		styles,
		cameraScrolling: false,

		// Selection state (backed by state machine)
		get selectedItem() {
			return selectedElement;
		},
		set selectedItem(item: HTMLElement | null) {
			this.select(item);
		},

		select(item: HTMLElement | null): void {
			if (item === selectedElement) return;

			const previousItem = selectedElement;

			// Remove selection from previous item
			if (previousItem) {
				previousItem.removeAttribute('data-egg-selected');
			}

			// Update state machine and local element reference
			if (item) {
				const itemId = item.id || item.getAttribute('data-egg-item') || '';
				stateMachine.transition({ type: 'SELECT', itemId, element: item });
				selectedElement = item;
				item.setAttribute('data-egg-selected', '');
				this.emit('select', { item });
			} else {
				stateMachine.transition({ type: 'DESELECT' });
				selectedElement = null;
				if (previousItem) {
					this.emit('deselect', { item: previousItem });
				}
			}
		},

		deselect(): void {
			this.select(null);
		},

		getCellFromPoint(x: number, y: number): GridCell | null {
			const rect = element.getBoundingClientRect();
			if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
				return null;
			}

			const style = getComputedStyle(element);
			const columns = parseGridTemplate(style.gridTemplateColumns);
			const rows = parseGridTemplate(style.gridTemplateRows);
			const columnGap = parseFloat(style.columnGap) || 0;
			const rowGap = parseFloat(style.rowGap) || 0;

			const relX = x - rect.left + element.scrollLeft;
			const relY = y - rect.top + element.scrollTop;

			const column = getGridIndex(relX, columns, columnGap);
			const row = getGridIndex(relY, rows, rowGap);

			return { column, row };
		},

		emit<T>(event: string, detail: T): void {
			element.dispatchEvent(
				new CustomEvent(`egg-${event}`, {
					bubbles: true,
					detail,
				}),
			);
		},

		getGridInfo() {
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			const columns = parseGridTemplate(style.gridTemplateColumns);
			const rows = parseGridTemplate(style.gridTemplateRows);
			const columnGap = parseFloat(style.columnGap) || 0;
			const rowGap = parseFloat(style.rowGap) || 0;

			return {
				rect,
				columns,
				rows,
				gap: columnGap, // Assume uniform gap for simplicity
				cellWidth: columns[0] || 0,
				cellHeight: rows[0] || 0,
			};
		},

		destroy(): void {
			cleanups.forEach((cleanup) => cleanup());
		},
	};

	// Direct initialization — no registry, no loop
	if (options.pointer !== false) {
		cleanups.push(attachPointer(core));
	}
	if (options.keyboard !== false) {
		cleanups.push(attachKeyboard(core));
	}
	if (options.accessibility !== false) {
		cleanups.push(attachAccessibility(core));
	}

	if (options.resize !== false) {
		const resizeOpts = typeof options.resize === 'object' ? options.resize : {};
		const inst = attachResize(element, { ...resizeOpts, core });
		cleanups.push(() => inst.destroy());
	}

	if (options.camera !== false) {
		const cameraOpts = typeof options.camera === 'object' ? options.camera : {};
		const inst = attachCamera(element, { ...cameraOpts, core });
		cleanups.push(() => inst.destroy());
	}

	if (options.placeholder !== false) {
		const placeholderOpts = typeof options.placeholder === 'object' ? options.placeholder : {};
		const inst = attachPlaceholder(element, placeholderOpts);
		cleanups.push(() => inst.destroy());
	}

	// Algorithm: push (default) or reorder
	if (options.algorithm !== false) {
		const algoOpts = options.algorithmOptions ?? {};
		if (options.algorithm === 'reorder') {
			cleanups.push(attachReorderAlgorithm(element, { ...algoOpts, core, layoutModel }));
		} else {
			cleanups.push(attachPushAlgorithm(element, { ...algoOpts, core, layoutModel }));
		}
	}

	if (options.responsive) {
		cleanups.push(attachResponsive(element, options.responsive, core));
	}

	return core;
}

/**
 * Parse CSS grid-template-columns/rows into pixel values
 */
function parseGridTemplate(template: string): number[] {
	// Handle common cases: px values, fr units resolved to px
	// getComputedStyle returns resolved pixel values
	const values = template.split(' ').filter(Boolean);
	return values.map((v) => parseFloat(v) || 0);
}

/**
 * Get 1-based grid index from pixel position
 * The gap between cells is split at the midpoint - first half belongs to
 * the left/top cell, second half belongs to the right/bottom cell.
 * This makes cell detection symmetric for both directions.
 */
function getGridIndex(pos: number, tracks: number[], gap: number): number {
	let accumulated = 0;
	const halfGap = gap / 2;

	for (let i = 0; i < tracks.length; i++) {
		const track = tracks[i]!;
		// Cell boundary extends to the midpoint of the gap
		const trackEnd = accumulated + track + halfGap;
		if (pos <= trackEnd) {
			return i + 1; // CSS Grid is 1-indexed
		}
		accumulated += track + gap;
	}

	return tracks.length || 1; // Default to last track, or 1 if empty
}

/**
 * Get the current grid cell of an item
 */
export function getItemCell(item: HTMLElement): GridCell {
	const style = getComputedStyle(item);
	return {
		column: parseInt(style.gridColumnStart, 10) || 1,
		row: parseInt(style.gridRowStart, 10) || 1,
	};
}

/**
 * Get the size of an item from its data attributes
 */
export function getItemSize(item: HTMLElement): { colspan: number; rowspan: number } {
	return {
		colspan: parseInt(item.getAttribute('data-egg-colspan') || '1', 10) || 1,
		rowspan: parseInt(item.getAttribute('data-egg-rowspan') || '1', 10) || 1,
	};
}

/**
 * Attach multiple event listeners and return a cleanup function to remove them all
 */
export function listenEvents(
	element: EventTarget,
	events: Record<string, EventListenerOrEventListenerObject>,
): () => void {
	for (const [name, handler] of Object.entries(events)) {
		element.addEventListener(name, handler);
	}
	return () => {
		for (const [name, handler] of Object.entries(events)) {
			element.removeEventListener(name, handler);
		}
	};
}
