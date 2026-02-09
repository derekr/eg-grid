import type { GridCell, GridiotCore, InitOptions, Plugin, PluginOptions, ProviderRegistry, StyleManager } from './types';
import { createStateMachine, type GridiotStateMachine } from './state-machine';

// Global plugin registry
const plugins = new Map<string, Plugin>();

export function registerPlugin(plugin: Plugin): void {
	plugins.set(plugin.name, plugin);
}

export function getPlugin(name: string): Plugin | undefined {
	return plugins.get(name);
}

/**
 * Initialize Gridiot on a CSS Grid element
 *
 * @param element - The CSS Grid container element
 * @param options - Configuration options including layoutModel, styleElement, and plugin options
 */
export function init(element: HTMLElement, options: InitOptions = {}): GridiotCore {
	const {
		layoutModel,
		styleElement,
		plugins: pluginOptions = {},
		disablePlugins = [],
	} = options;

	const cleanups: (() => void)[] = [];

	// Create centralized state machine
	const stateMachine = createStateMachine();

	// Track selected element (state machine stores itemId, we need the element)
	let selectedElement: HTMLElement | null = null;

	// Provider registry for inter-plugin communication
	const providerMap = new Map<string, () => unknown>();
	const providers: ProviderRegistry = {
		register<T>(capability: string, provider: () => T): void {
			providerMap.set(capability, provider);
		},

		get<T>(capability: string): T | undefined {
			const provider = providerMap.get(capability);
			return provider ? (provider() as T) : undefined;
		},
	};

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
			styleLayers.set(layer, '');
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

	const core: GridiotCore = {
		element,
		providers,
		stateMachine,
		styles,

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
				previousItem.removeAttribute('data-gridiot-selected');
			}

			// Update state machine and local element reference
			if (item) {
				const itemId = item.id || item.getAttribute('data-gridiot-item') || '';
				stateMachine.transition({ type: 'SELECT', itemId, element: item });
				selectedElement = item;
				item.setAttribute('data-gridiot-selected', '');
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
				new CustomEvent(`gridiot:${event}`, {
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

	// Register state machine provider for plugin access
	providers.register('state', () => stateMachine.getState());

	// Initialize all registered plugins with options
	for (const plugin of plugins.values()) {
		// Skip disabled plugins
		if (disablePlugins.includes(plugin.name)) {
			continue;
		}

		// Build options for this plugin
		const pluginSpecificOptions = pluginOptions[plugin.name as keyof PluginOptions] ?? {};
		const opts = {
			...pluginSpecificOptions,
			// Pass shared resources to all plugins that might need them
			layoutModel,
			core,
		};

		const cleanup = plugin.init(core, opts);
		if (cleanup) {
			cleanups.push(cleanup);
		}
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
		colspan: parseInt(item.getAttribute('data-gridiot-colspan') || '1', 10) || 1,
		rowspan: parseInt(item.getAttribute('data-gridiot-rowspan') || '1', 10) || 1,
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

