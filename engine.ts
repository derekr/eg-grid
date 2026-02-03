import type { GridCell, GridiotCore, InitOptions, Plugin, PluginOptions, ProviderRegistry } from './types';

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

	let selectedItem: HTMLElement | null = null;

	// Provider registry for inter-plugin communication
	const providerMap = new Map<string, () => unknown>();
	const providers: ProviderRegistry = {
		register<T>(capability: string, provider: () => T): void {
			if (providerMap.has(capability)) {
				console.warn(
					`Gridiot: Provider for "${capability}" already registered, overwriting`,
				);
			}
			providerMap.set(capability, provider);
		},

		get<T>(capability: string): T | undefined {
			const provider = providerMap.get(capability);
			return provider ? (provider() as T) : undefined;
		},

		has(capability: string): boolean {
			return providerMap.has(capability);
		},
	};

	const core: GridiotCore = {
		element,
		providers,

		// Selection state
		get selectedItem() {
			return selectedItem;
		},
		set selectedItem(item: HTMLElement | null) {
			this.select(item);
		},

		select(item: HTMLElement | null): void {
			if (item === selectedItem) return;

			const previousItem = selectedItem;

			// Remove selection from previous item
			if (previousItem) {
				previousItem.removeAttribute('data-gridiot-selected');
			}

			// Set new selection
			selectedItem = item;

			if (item) {
				item.setAttribute('data-gridiot-selected', '');
				this.emit('select', { item });
			} else if (previousItem) {
				this.emit('deselect', { item: previousItem });
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
			observer.disconnect();
			cleanups.forEach((cleanup) => cleanup());
		},
	};

	// Observe position changes and animate with View Transitions
	const observer = new MutationObserver((mutations) => {
		// Collect items that changed position
		const changedItems = new Set<HTMLElement>();

		for (const mutation of mutations) {
			if (
				mutation.type === 'attributes' &&
				mutation.target instanceof HTMLElement
			) {
				const item = mutation.target.closest(
					'[data-gridiot-item]',
				) as HTMLElement | null;
				if (item && element.contains(item)) {
					changedItems.add(item);
				}
			}
		}

		// Animate changes with View Transitions if available
		if (changedItems.size > 0 && 'startViewTransition' in document) {
			// Items already moved - View Transitions will handle animation
			// The browser captures before/after states automatically
		}
	});

	observer.observe(element, {
		subtree: true,
		attributes: true,
		attributeFilter: ['style', 'class'],
	});

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
			styleElement,
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
 * Set an item's grid position
 */
export function setItemCell(item: HTMLElement, cell: GridCell): void {
	item.style.gridColumn = String(cell.column);
	item.style.gridRow = String(cell.row);
}

/**
 * Get grid info for a grid element
 */
export function getGridInfo(element: HTMLElement) {
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
}
