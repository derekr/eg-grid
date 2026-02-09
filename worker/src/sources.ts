// Auto-generated — do not edit. Run `pnpm sync-sources` to update.
export const SOURCES: Record<string, string> = {
	"engine.ts": `import type { GridCell, EggCore, InitOptions, Plugin, PluginOptions, ProviderRegistry, StyleManager } from './types';
import { createStateMachine, type EggStateMachine } from './state-machine';

// Global plugin registry
const plugins = new Map<string, Plugin>();

export function registerPlugin(plugin: Plugin): void {
	plugins.set(plugin.name, plugin);
}

export function getPlugin(name: string): Plugin | undefined {
	return plugins.get(name);
}

/**
 * Initialize EG Grid on a CSS Grid element
 *
 * @param element - The CSS Grid container element
 * @param options - Configuration options including layoutModel, styleElement, and plugin options
 */
export function init(element: HTMLElement, options: InitOptions = {}): EggCore {
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
			managedStyleElement.textContent = parts.join('\\n\\n');
		},
	};

	const core: EggCore = {
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
				new CustomEvent(\`egg:\${event}\`, {
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

`,
	"types.ts": `export interface GridCell {
	column: number;
	row: number;
}

export type DragSource = 'pointer' | 'keyboard';

export interface DragStartDetail {
	item: HTMLElement;
	cell: GridCell;
	colspan: number;
	rowspan: number;
	source: DragSource;
}

export interface DragMoveDetail {
	item: HTMLElement;
	cell: GridCell;
	x: number;
	y: number;
	colspan: number;
	rowspan: number;
	source: DragSource;
}

export interface DragEndDetail {
	item: HTMLElement;
	cell: GridCell;
	colspan: number;
	rowspan: number;
	source: DragSource;
}

export interface DragCancelDetail {
	item: HTMLElement;
	source: DragSource;
}

// ============================================================================
// Resize Types
// ============================================================================

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export interface ResizeStartDetail {
	item: HTMLElement;
	/** Current cell position (top-left of item) */
	cell: GridCell;
	/** Original colspan before resize */
	colspan: number;
	/** Original rowspan before resize */
	rowspan: number;
	handle: ResizeHandle;
	source: DragSource;
}

export interface ResizeMoveDetail {
	item: HTMLElement;
	/** Projected cell position (may differ from start for NW/NE/SW handles) */
	cell: GridCell;
	/** Anchor cell (the corner that stays fixed - opposite of the handle) */
	anchorCell: GridCell;
	/** Original cell position at resize start */
	startCell: GridCell;
	/** Projected colspan */
	colspan: number;
	/** Projected rowspan */
	rowspan: number;
	handle: ResizeHandle;
	source: DragSource;
}

export interface ResizeEndDetail {
	item: HTMLElement;
	/** Final cell position */
	cell: GridCell;
	/** Final colspan */
	colspan: number;
	/** Final rowspan */
	rowspan: number;
	source: DragSource;
}

export interface ResizeCancelDetail {
	item: HTMLElement;
	source: DragSource;
}

/**
 * Resize state exposed by the resize plugin
 */
export interface ResizeState {
	item: HTMLElement;
	originalSize: { colspan: number; rowspan: number };
	currentSize: { colspan: number; rowspan: number };
	handle: ResizeHandle;
}

export interface SelectDetail {
	item: HTMLElement;
}

export interface DeselectDetail {
	/** The previously selected item, or null if none was selected */
	item: HTMLElement | null;
}

export interface GridInfo {
	rect: DOMRect;
	columns: number[];
	rows: number[];
	gap: number;
	cellWidth: number;
	cellHeight: number;
}

/**
 * Provider registry - allows plugins to share state without tight coupling.
 *
 * Plugins register providers for specific capabilities (e.g., 'layout', 'drag').
 * Other plugins can query these providers through the core without directly
 * depending on each other.
 */
export interface ProviderRegistry {
	/**
	 * Register a provider for a capability.
	 * Only one provider per capability is allowed.
	 */
	register<T>(capability: string, provider: () => T): void;

	/**
	 * Get a provider's current value.
	 * Returns undefined if no provider is registered.
	 */
	get<T>(capability: string): T | undefined;

	/**
	 * Check if a capability has a registered provider.
	 */
	has(capability: string): boolean;
}

/**
 * Drag state exposed by the pointer plugin
 */
export interface DragState {
	item: HTMLElement;
	cell: GridCell;
	startCell: GridCell;
	colspan: number;
	rowspan: number;
}

/**
 * Layout state exposed by algorithm plugins
 */
export interface LayoutState {
	items: Array<{
		id: string;
		column: number;
		row: number;
		colspan: number;
		rowspan: number;
	}>;
	columns: number;
}

// Re-export state machine types for convenience
import type { EggStateMachine, EggState, StateTransition } from './state-machine';
export type { EggStateMachine, EggState, StateTransition };

/**
 * Centralized CSS injection manager.
 *
 * Plugins register named layers (e.g. 'base', 'preview') and the manager
 * concatenates them in registration order into a single <style> element.
 * This ensures correct cascade: base (responsive/container queries) first,
 * preview (algorithm) second — later rules override same-specificity earlier ones.
 */
export interface StyleManager {
	/** Set CSS for a named layer. First call for a layer establishes its order. */
	set(layer: string, css: string): void;
	/** Get current CSS for a layer. Returns empty string if not set. */
	get(layer: string): string;
	/** Clear CSS for a layer. */
	clear(layer: string): void;
	/** Flush all layers to the DOM style element. */
	commit(): void;
}

export interface EggCore {
	element: HTMLElement;
	getCellFromPoint(x: number, y: number): GridCell | null;
	getGridInfo(): GridInfo;
	emit<T>(event: string, detail: T): void;
	destroy(): void;

	// Selection state (legacy, backed by state machine)
	selectedItem: HTMLElement | null;
	select(item: HTMLElement | null): void;
	deselect(): void;

	// Provider registry for plugin communication
	providers: ProviderRegistry;

	// Centralized state machine for interaction management
	stateMachine: EggStateMachine;

	// Centralized CSS injection
	styles: StyleManager;
}

export interface Plugin<T = unknown> {
	name: string;
	init(core: EggCore, options?: T): (() => void) | void;
}

// ============================================================================
// Plugin Configuration Types
// ============================================================================

/**
 * Camera plugin options
 */
export interface CameraPluginOptions {
	mode?: 'contain' | 'center' | 'off';
	scrollContainer?: HTMLElement | Window;
	edgeSize?: number;
	scrollSpeed?: number;
	scrollBehavior?: ScrollBehavior;
	scrollMargin?: number;
	scrollOnSelect?: boolean;
	autoScrollOnDrag?: boolean;
	settleDelay?: number;
}

/**
 * Resize plugin options
 */
export interface ResizePluginOptions {
	handles?: 'corners' | 'edges' | 'all';
	handleSize?: number;
	minSize?: { colspan: number; rowspan: number };
	maxSize?: { colspan: number; rowspan: number };
	showSizeLabel?: boolean;
}

/**
 * Placeholder plugin options
 */
export interface PlaceholderPluginOptions {
	className?: string;
	element?: HTMLElement;
	disableViewTransition?: boolean;
}

/**
 * Algorithm-push plugin options
 */
export interface AlgorithmPushPluginOptions {
	selectorPrefix?: string;
	selectorSuffix?: string;
	compaction?: boolean;
	layoutModel?: ResponsiveLayoutModel;
}

/**
 * Algorithm-reorder plugin options
 */
export interface AlgorithmReorderPluginOptions {
	selectorPrefix?: string;
	selectorSuffix?: string;
	layoutModel?: ResponsiveLayoutModel;
}


/**
 * Plugin-specific options map for init()
 */
export interface PluginOptions {
	camera?: CameraPluginOptions;
	resize?: ResizePluginOptions;
	placeholder?: PlaceholderPluginOptions;
	'algorithm-push'?: AlgorithmPushPluginOptions;
	'algorithm-reorder'?: AlgorithmReorderPluginOptions;
	responsive?: ResponsivePluginOptions;
}

/**
 * Options for init()
 */
export interface InitOptions {
	/**
	 * Responsive layout model for multi-breakpoint support.
	 * Passed to responsive and algorithm-push plugins automatically.
	 */
	layoutModel?: ResponsiveLayoutModel;

	/**
	 * Style element for centralized CSS injection (core.styles).
	 * If not provided, one is created automatically and appended to <head>.
	 */
	styleElement?: HTMLStyleElement;

	/**
	 * Plugin-specific options.
	 * Keys are plugin names, values are plugin-specific option objects.
	 */
	plugins?: Partial<PluginOptions>;

	/**
	 * List of plugin names to disable.
	 * These plugins won't be initialized even if registered.
	 */
	disablePlugins?: string[];
}

// ============================================================================
// Responsive Layout Types
// ============================================================================

/**
 * Item definition with intrinsic properties (independent of column count)
 */
export interface ItemDefinition {
	id: string;
	/** Width in grid cells (may be clamped at smaller column counts) */
	width: number;
	/** Height in grid cells */
	height: number;
}

/**
 * Item position within a layout
 */
export interface ItemPosition {
	column: number;
	row: number;
}

/**
 * Complete item with position (used in layouts)
 */
export interface LayoutItem extends ItemDefinition, ItemPosition {}

/**
 * Event detail for column count changes
 */
export interface ColumnCountChangeDetail {
	previousCount: number;
	currentCount: number;
}

/**
 * Responsive layout model - manages layouts across different column counts.
 *
 * This is the source of truth for item positions at each breakpoint.
 * The canonical layout (at maxColumns) is the primary source, with
 * per-column-count overrides for user customizations.
 */
export interface ResponsiveLayoutModel {
	/** Maximum column count (canonical layout size) */
	readonly maxColumns: number;

	/** Minimum column count (default: 1) */
	readonly minColumns: number;

	/** Item definitions (intrinsic properties, not positions) */
	readonly items: ReadonlyMap<string, ItemDefinition>;

	/** Current detected column count */
	readonly currentColumnCount: number;

	/**
	 * Get the layout for a specific column count.
	 * Returns override if exists, otherwise derives from canonical.
	 */
	getLayoutForColumns(columnCount: number): Map<string, ItemPosition>;

	/**
	 * Get the current layout (for currentColumnCount)
	 */
	getCurrentLayout(): Map<string, ItemPosition>;

	/**
	 * Check if a column count has an explicit override
	 */
	hasOverride(columnCount: number): boolean;

	/**
	 * Get all column counts that have explicit overrides
	 */
	getOverrideColumnCounts(): number[];

	/**
	 * Save a layout for a specific column count.
	 * If columnCount === maxColumns, updates canonical layout.
	 * Otherwise, creates/updates an override.
	 */
	saveLayout(columnCount: number, positions: Map<string, ItemPosition>): void;

	/**
	 * Clear the override for a specific column count.
	 * Does nothing if columnCount === maxColumns (can't clear canonical).
	 */
	clearOverride(columnCount: number): void;

	/**
	 * Update an item's size (width/height in grid cells).
	 * This updates the item definition and triggers layout recalculation.
	 */
	updateItemSize(itemId: string, size: { width: number; height: number }): void;

	/**
	 * Update the current column count (called by responsive plugin)
	 */
	setCurrentColumnCount(columnCount: number): void;

	/**
	 * Generate CSS for all breakpoints using container queries
	 */
	generateAllBreakpointCSS(options?: BreakpointCSSOptions): string;

	/**
	 * Subscribe to layout changes
	 */
	subscribe(callback: () => void): () => void;
}

/**
 * Options for CSS generation
 */
export interface BreakpointCSSOptions {
	/** CSS selector prefix for item rules (default: '#') */
	selectorPrefix?: string;
	/** CSS selector suffix for item rules (default: '') */
	selectorSuffix?: string;
	/** Cell size in pixels (for breakpoint calculation) */
	cellSize: number;
	/** Gap size in pixels (for breakpoint calculation) */
	gap: number;
	/** CSS selector for the grid container (default: '.grid-container') */
	gridSelector?: string;
}

/**
 * Options for creating a responsive layout model
 */
export interface CreateLayoutModelOptions {
	/** Maximum column count (canonical layout size) */
	maxColumns: number;
	/** Minimum column count (default: 1) */
	minColumns?: number;
	/** Initial item definitions */
	items: ItemDefinition[];
	/** Initial canonical positions */
	canonicalPositions: Map<string, ItemPosition>;
	/** Initial overrides (optional) */
	overrides?: Map<number, Map<string, ItemPosition>>;
}

/**
 * Options for the responsive plugin
 */
export interface ResponsivePluginOptions {
	/** The layout model to use */
	layoutModel: ResponsiveLayoutModel;
	/** Cell size in pixels (for breakpoint calculation, or infer from CSS) */
	cellSize?: number;
	/** Gap size in pixels (for breakpoint calculation, or infer from CSS) */
	gap?: number;
}

// ============================================================================
// Drop Preview Types (emitted by algorithms whose drop position differs from cursor)
// ============================================================================

export interface DropPreviewDetail {
	/** Actual cell where the dragged item will land */
	cell: GridCell;
	/** Colspan of the item */
	colspan: number;
	/** Rowspan of the item */
	rowspan: number;
}

// Custom event types for type-safe event listeners
declare global {
	interface HTMLElementEventMap {
		'egg:drag-start': CustomEvent<DragStartDetail>;
		'egg:drag-move': CustomEvent<DragMoveDetail>;
		'egg:drag-end': CustomEvent<DragEndDetail>;
		'egg:drag-cancel': CustomEvent<DragCancelDetail>;
		'egg:select': CustomEvent<SelectDetail>;
		'egg:deselect': CustomEvent<DeselectDetail>;
		'egg:column-count-change': CustomEvent<ColumnCountChangeDetail>;
		'egg:resize-start': CustomEvent<ResizeStartDetail>;
		'egg:resize-move': CustomEvent<ResizeMoveDetail>;
		'egg:resize-end': CustomEvent<ResizeEndDetail>;
		'egg:resize-cancel': CustomEvent<ResizeCancelDetail>;
		'egg:drop-preview': CustomEvent<DropPreviewDetail>;
	}
}
`,
	"state-machine.ts": `/**
 * Centralized State Machine for EG Grid
 *
 * This module provides a single source of truth for interaction state,
 * replacing the distributed state management across plugins.
 *
 * Key invariants:
 * 1. Only ONE interaction can be active at a time (drag OR resize, not both)
 * 2. Column count is captured at interaction start and immutable during interaction
 * 3. CSS injection is coordinated through this state machine
 * 4. View Transitions are only used for keyboard interactions (not pointer/FLIP)
 */

import type { GridCell, ItemPosition } from './types';

// ============================================================================
// State Types
// ============================================================================

export type InteractionMode = 'pointer' | 'keyboard';

export type InteractionType = 'drag' | 'resize';

export type EggPhase =
	| 'idle'
	| 'selected'
	| 'interacting'  // Active drag or resize
	| 'committing';  // Saving to layout model, clearing preview

export interface InteractionContext {
	/** The type of interaction (drag or resize) */
	type: InteractionType;
	/** How the interaction was initiated */
	mode: InteractionMode;
	/** The item being interacted with */
	itemId: string;
	/** The DOM element being interacted with */
	element: HTMLElement;
	/** Column count at interaction start (immutable during interaction) */
	columnCount: number;
	/** Original positions of all items at interaction start */
	originalPositions: Map<string, ItemPosition>;
	/** Original sizes of all items at interaction start (for resize) */
	originalSizes: Map<string, { width: number; height: number }>;
	/** Current target cell during interaction */
	targetCell: GridCell;
	/** Current size during resize */
	currentSize: { colspan: number; rowspan: number };
	/** Whether FLIP animation should be used (pointer mode only) */
	useFlip: boolean;
	/** Whether View Transitions should be used (keyboard mode only) */
	useViewTransition: boolean;
}

export interface EggState {
	phase: EggPhase;
	selectedItemId: string | null;
	interaction: InteractionContext | null;
	/** Track if keyboard mode is active (Shift+G toggle) */
	keyboardModeActive: boolean;
}

// ============================================================================
// State Machine
// ============================================================================

export type StateTransition =
	| { type: 'SELECT'; itemId: string; element: HTMLElement }
	| { type: 'DESELECT' }
	| { type: 'START_INTERACTION'; context: Omit<InteractionContext, 'useFlip' | 'useViewTransition'> }
	| { type: 'UPDATE_INTERACTION'; targetCell: GridCell; currentSize?: { colspan: number; rowspan: number } }
	| { type: 'COMMIT_INTERACTION' }
	| { type: 'CANCEL_INTERACTION' }
	| { type: 'FINISH_COMMIT' }
	| { type: 'TOGGLE_KEYBOARD_MODE' };

export interface EggStateMachine {
	getState(): EggState;
	transition(action: StateTransition): EggState;
}

function reducer(state: EggState, action: StateTransition): EggState {
	switch (action.type) {
		case 'SELECT': {
			// Can select from idle or selected (changes selection)
			if (state.phase !== 'idle' && state.phase !== 'selected') {
				return state; // Can't select during interaction
			}
			return {
				...state,
				phase: 'selected',
				selectedItemId: action.itemId,
			};
		}

		case 'DESELECT': {
			// Can deselect from selected only
			if (state.phase !== 'selected') {
				return state;
			}
			return {
				...state,
				phase: 'idle',
				selectedItemId: null,
			};
		}

		case 'START_INTERACTION': {
			// Can start interaction from selected only
			if (state.phase !== 'selected') {
				return state;
			}
			const { context } = action;
			return {
				...state,
				phase: 'interacting',
				interaction: {
					...context,
					// Derive animation strategy from mode
					useFlip: context.mode === 'pointer',
					useViewTransition: context.mode === 'keyboard',
				},
			};
		}

		case 'UPDATE_INTERACTION': {
			// Can only update during active interaction
			if (state.phase !== 'interacting' || !state.interaction) {
				return state;
			}
			return {
				...state,
				interaction: {
					...state.interaction,
					targetCell: action.targetCell,
					currentSize: action.currentSize ?? state.interaction.currentSize,
				},
			};
		}

		case 'COMMIT_INTERACTION': {
			// Transition from interacting to committing
			if (state.phase !== 'interacting') {
				return state;
			}
			return {
				...state,
				phase: 'committing',
			};
		}

		case 'CANCEL_INTERACTION': {
			// Can cancel from interacting
			if (state.phase !== 'interacting') {
				return state;
			}
			return {
				...state,
				phase: 'selected',
				interaction: null,
			};
		}

		case 'FINISH_COMMIT': {
			// Transition from committing back to selected
			if (state.phase !== 'committing') {
				return state;
			}
			return {
				...state,
				phase: 'selected',
				interaction: null,
			};
		}

		case 'TOGGLE_KEYBOARD_MODE': {
			return {
				...state,
				keyboardModeActive: !state.keyboardModeActive,
			};
		}

		default:
			return state;
	}
}

/**
 * Create a state machine instance
 */
export function createStateMachine(): EggStateMachine {
	let state: EggState = {
		phase: 'idle',
		selectedItemId: null,
		interaction: null,
		keyboardModeActive: false,
	};

	return {
		getState() {
			return state;
		},

		transition(action: StateTransition) {
			const nextState = reducer(state, action);
			if (nextState !== state) {
				state = nextState;
			}
			return state;
		},
	};
}

export function isDragging(state: EggState): boolean {
	return (state.phase === 'interacting' || state.phase === 'committing') && state.interaction?.type === 'drag';
}
`,
	"layout-model.ts": `/**
 * Responsive Layout Model
 *
 * Manages layouts across different column counts with a three-tier system:
 * 1. Canonical layout - source of truth at maxColumns
 * 2. Per-column-count overrides - user customizations at specific breakpoints
 * 3. Auto-derived layouts - calculated via compaction for other column counts
 *
 * This module is pure data/logic with no DOM dependencies, making it suitable
 * for use with backend-driven state (e.g., Datastar integration).
 */

import type {
	BreakpointCSSOptions,
	CreateLayoutModelOptions,
	ItemDefinition,
	ItemPosition,
	LayoutItem,
	ResponsiveLayoutModel,
} from './types';

const MAX_ROWS = 100; // Safety limit for layout derivation

/**
 * Create a responsive layout model
 */
export function createLayoutModel(
	options: CreateLayoutModelOptions,
): ResponsiveLayoutModel {
	const { maxColumns, minColumns = 1, items: itemDefs } = options;

	// Store item definitions
	const items = new Map<string, ItemDefinition>();
	for (const item of itemDefs) {
		items.set(item.id, { id: item.id, width: item.width, height: item.height });
	}

	// Store canonical positions (at maxColumns)
	let canonicalPositions = new Map<string, ItemPosition>(
		options.canonicalPositions,
	);

	// Store per-column-count overrides
	const overrides = new Map<number, Map<string, ItemPosition>>(
		options.overrides,
	);

	// Current column count (updated by responsive plugin)
	let currentColumnCount = maxColumns;

	// Subscribers for layout changes
	const subscribers = new Set<() => void>();

	function notifySubscribers(): void {
		for (const callback of Array.from(subscribers)) {
			callback();
		}
	}

	/**
	 * Get items sorted by position (top-to-bottom, left-to-right)
	 * Used for consistent ordering in layout derivation
	 */
	function getItemsInPositionOrder(
		positions: Map<string, ItemPosition>,
	): ItemDefinition[] {
		return Array.from(items.values()).sort((a, b) => {
			const posA = positions.get(a.id) ?? { column: 0, row: 0 };
			const posB = positions.get(b.id) ?? { column: 0, row: 0 };
			// Sort by row first, then column
			return posA.row - posB.row || posA.column - posB.column;
		});
	}

	/**
	 * Derive layout for a given column count using first-fit compaction.
	 * Items are placed in position order (top-to-bottom, left-to-right)
	 * into the first available space that fits.
	 */
	function deriveLayoutForColumns(
		cols: number,
		sourcePositions: Map<string, ItemPosition>,
	): Map<string, ItemPosition> {
		const sorted = getItemsInPositionOrder(sourcePositions);
		const result = new Map<string, ItemPosition>();

		// 2D occupancy grid: occupied[row][col] = itemId or null
		const occupied: (string | null)[][] = [];
		for (let r = 0; r < MAX_ROWS; r++) {
			occupied.push(new Array(cols).fill(null));
		}

		for (const itemDef of sorted) {
			// Clamp width to available columns
			const w = Math.min(itemDef.width, cols);
			const h = itemDef.height;

			// Find first available position (first-fit)
			let placed = false;
			for (let row = 0; row < MAX_ROWS && !placed; row++) {
				for (let col = 0; col <= cols - w && !placed; col++) {
					// Check if space is available
					let canFit = true;
					for (let dy = 0; dy < h && canFit; dy++) {
						for (let dx = 0; dx < w && canFit; dx++) {
							if (occupied[row + dy]?.[col + dx] !== null) {
								canFit = false;
							}
						}
					}

					if (canFit) {
						result.set(itemDef.id, { column: col + 1, row: row + 1 }); // 1-indexed for CSS Grid
						// Mark cells as occupied
						for (let dy = 0; dy < h; dy++) {
							for (let dx = 0; dx < w; dx++) {
								if (occupied[row + dy]) {
									occupied[row + dy]![col + dx] = itemDef.id;
								}
							}
						}
						placed = true;
					}
				}
			}

			if (!placed) {
				// Fallback: place at bottom (shouldn't happen with reasonable MAX_ROWS)
				result.set(itemDef.id, { column: 1, row: MAX_ROWS });
			}
		}

		return result;
	}

	/**
	 * Calculate breakpoint width for a given column count.
	 * n columns needs: n * cellSize + (n - 1) * gap pixels
	 */
	function getBreakpointWidth(cols: number, cellSize: number, gap: number): number {
		return cols * cellSize + (cols - 1) * gap;
	}

	const model: ResponsiveLayoutModel = {
		get maxColumns() {
			return maxColumns;
		},
		get minColumns() {
			return minColumns;
		},
		get items() {
			return items;
		},
		get currentColumnCount() {
			return currentColumnCount;
		},

		getLayoutForColumns(columnCount: number): Map<string, ItemPosition> {
			// Clamp to valid range
			const cols = Math.max(minColumns, Math.min(maxColumns, columnCount));

			if (cols === maxColumns) {
				return new Map(canonicalPositions);
			}

			// Check for explicit override
			const override = overrides.get(cols);
			if (override) {
				return new Map(override);
			}

			// Auto-derive from canonical
			return deriveLayoutForColumns(cols, canonicalPositions);
		},

		getCurrentLayout(): Map<string, ItemPosition> {
			return this.getLayoutForColumns(currentColumnCount);
		},

		hasOverride(columnCount: number): boolean {
			return overrides.has(columnCount);
		},

		getOverrideColumnCounts(): number[] {
			return Array.from(overrides.keys()).sort((a, b) => b - a);
		},

		saveLayout(columnCount: number, positions: Map<string, ItemPosition>): void {
			const cols = Math.max(minColumns, Math.min(maxColumns, columnCount));

			if (cols === maxColumns) {
				// Update canonical layout
				canonicalPositions = new Map(positions);
			} else {
				// Create/update override
				overrides.set(cols, new Map(positions));
			}

			notifySubscribers();
		},

		clearOverride(columnCount: number): void {
			if (columnCount === maxColumns) {
				// Can't clear canonical layout
				return;
			}
			if (overrides.delete(columnCount)) {
				notifySubscribers();
			}
		},

		updateItemSize(itemId: string, size: { width: number; height: number }): void {
			const existing = items.get(itemId);
			if (!existing) {
				console.warn(\`[layout-model] updateItemSize: item "\${itemId}" not found in items Map. Available IDs:\`, Array.from(items.keys()));
				return;
			}

			// Update the item definition
			items.set(itemId, {
				id: itemId,
				width: size.width,
				height: size.height,
			});

			notifySubscribers();
		},

		setCurrentColumnCount(columnCount: number): void {
			const newCount = Math.max(minColumns, Math.min(maxColumns, columnCount));
			if (newCount !== currentColumnCount) {
				currentColumnCount = newCount;
				// Note: We don't notify here because this is just tracking state.
				// The responsive plugin will emit an event for UI updates.
			}
		},

		generateAllBreakpointCSS(options?: BreakpointCSSOptions): string {
			const {
				selectorPrefix = '#',
				selectorSuffix = '',
				cellSize,
				gap,
				gridSelector = '.grid-container',
			} = options ?? { cellSize: 184, gap: 16 };

			const cssRules: string[] = [];

			// Generate fallback rules (canonical layout, no container query)
			// These apply immediately before container queries are evaluated
			cssRules.push('/* Fallback: canonical layout (before container queries evaluate) */');
			for (const [id, pos] of Array.from(canonicalPositions)) {
				const itemDef = items.get(id);
				if (!itemDef) continue;
				cssRules.push(
					\`\${selectorPrefix}\${id}\${selectorSuffix} { grid-column: \${pos.column} / span \${itemDef.width}; grid-row: \${pos.row} / span \${itemDef.height}; }\`,
				);
			}
			cssRules.push('');

			// Generate rules for each column count (maxColumns down to minColumns)
			for (let cols = maxColumns; cols >= minColumns; cols--) {
				const positions = this.getLayoutForColumns(cols);
				const minWidth = getBreakpointWidth(cols, cellSize, gap);
				const hasOverride = overrides.has(cols);

				// Build container query
				let containerQuery: string;
				if (cols === maxColumns) {
					containerQuery = \`@container (min-width: \${minWidth}px)\`;
				} else if (cols === minColumns) {
					// Smallest size is the default/fallback
					const maxWidth = getBreakpointWidth(cols + 1, cellSize, gap) - 1;
					containerQuery = \`@container (max-width: \${maxWidth}px)\`;
				} else {
					const maxWidth = getBreakpointWidth(cols + 1, cellSize, gap) - 1;
					containerQuery = \`@container (min-width: \${minWidth}px) and (max-width: \${maxWidth}px)\`;
				}

				// Build rules for this column count
				const itemRules: string[] = [];

				// Grid template
				itemRules.push(
					\`\${gridSelector} { grid-template-columns: repeat(\${cols}, 1fr); }\`,
				);

				// Item positions
				for (const [id, pos] of positions) {
					const itemDef = items.get(id);
					if (!itemDef) continue;

					// Clamp width to current column count
					const w = Math.min(itemDef.width, cols);
					itemRules.push(
						\`\${selectorPrefix}\${id}\${selectorSuffix} { grid-column: \${pos.column} / span \${w}; grid-row: \${pos.row} / span \${itemDef.height}; }\`,
					);
				}

				// Add comment and rules
				const layoutType =
					cols === maxColumns
						? '(canonical)'
						: hasOverride
							? '(override)'
							: '(derived)';
				cssRules.push(\`/* \${cols} columns \${layoutType} */\`);
				cssRules.push(\`\${containerQuery} {\`);
				cssRules.push(itemRules.map((r) => '  ' + r).join('\\n'));
				cssRules.push('}');
				cssRules.push('');
			}

			return cssRules.join('\\n');
		},

		subscribe(callback: () => void): () => void {
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
	};

	return model;
}

`,
	"plugins/accessibility.ts": `import { listenEvents, registerPlugin } from '../engine';
import type {
	DragCancelDetail,
	DragEndDetail,
	DragMoveDetail,
	DragStartDetail,
	GridCell,
	ResizeCancelDetail,
	ResizeEndDetail,
	ResizeMoveDetail,
	ResizeStartDetail,
} from '../types';

registerPlugin({
	name: 'accessibility',
	init(core) {
		// Create live region for screen reader announcements
		const liveRegion = document.createElement('div');
		liveRegion.setAttribute('aria-live', 'assertive');
		liveRegion.setAttribute('aria-atomic', 'true');
		// Visually hidden but accessible to screen readers
		Object.assign(liveRegion.style, {
			position: 'absolute',
			width: '1px',
			height: '1px',
			padding: '0',
			margin: '-1px',
			overflow: 'hidden',
			clip: 'rect(0, 0, 0, 0)',
			whiteSpace: 'nowrap',
			border: '0',
		});
		core.element.appendChild(liveRegion);

		let lastCell: GridCell | null = null;
		let lastResizeSize: { colspan: number; rowspan: number } | null = null;

		function announce(message: string) {
			// Clear and re-set to force re-announcement
			liveRegion.textContent = '';
			requestAnimationFrame(() => {
				liveRegion.textContent = message;
			});
		}

		function getLabel(item: HTMLElement): string {
			return (
				item.getAttribute('data-egg-label') ||
				item.getAttribute('aria-label') ||
				item.id ||
				'Item'
			);
		}

		function formatPosition(cell: GridCell): string {
			return \`row \${cell.row}, column \${cell.column}\`;
		}

		function resolveTemplate(
			item: HTMLElement,
			event: string,
			vars: Record<string, string>,
			fallback: string,
		): string {
			const template =
				item.getAttribute(\`data-egg-announce-\${event}\`) ||
				core.element.getAttribute(\`data-egg-announce-\${event}\`);
			if (!template) return fallback;
			return template.replace(/\\{(\\w+)\\}/g, (_, key) => vars[key] ?? '');
		}

		function getAnnouncement(
			item: HTMLElement,
			event: 'grab' | 'move' | 'drop' | 'cancel',
			cell?: GridCell,
		): string {
			const label = getLabel(item);
			const pos = cell ? formatPosition(cell) : '';
			const vars = { label, row: String(cell?.row ?? ''), column: String(cell?.column ?? '') };

			const defaults: Record<string, string> = {
				grab: \`\${label} grabbed. Position \${pos}. Use arrow keys to move, Enter to drop, Escape to cancel.\`,
				move: \`Moved to \${pos}.\`,
				drop: \`\${label} dropped at \${pos}.\`,
				cancel: \`\${label} drag cancelled.\`,
			};
			return resolveTemplate(item, event, vars, defaults[event]);
		}

		function getResizeAnnouncement(
			item: HTMLElement,
			event: 'resize-start' | 'resize-move' | 'resize-end' | 'resize-cancel',
			opts?: { cell?: GridCell; colspan?: number; rowspan?: number },
		): string {
			const label = getLabel(item);
			const size = opts?.colspan != null && opts?.rowspan != null
				? \`\${opts.colspan} columns by \${opts.rowspan} rows\`
				: '';
			const pos = opts?.cell ? formatPosition(opts.cell) : '';
			const vars = {
				label,
				colspan: String(opts?.colspan ?? ''),
				rowspan: String(opts?.rowspan ?? ''),
				row: String(opts?.cell?.row ?? ''),
				column: String(opts?.cell?.column ?? ''),
			};

			const defaults: Record<string, string> = {
				'resize-start': \`\${label} resize started. Size \${size}. Use pointer to resize, Escape to cancel.\`,
				'resize-move': \`Resized to \${size}.\`,
				'resize-end': \`\${label} resized to \${size} at \${pos}.\`,
				'resize-cancel': \`\${label} resize cancelled.\`,
			};
			return resolveTemplate(item, event, vars, defaults[event]);
		}

		const onDragStart = (e: CustomEvent<DragStartDetail>) => {
			lastCell = e.detail.cell;
			announce(getAnnouncement(e.detail.item, 'grab', e.detail.cell));
		};

		const onDragMove = (e: CustomEvent<DragMoveDetail>) => {
			// Only announce if cell actually changed
			const { cell } = e.detail;
			if (
				lastCell &&
				cell.row === lastCell.row &&
				cell.column === lastCell.column
			) {
				return;
			}
			lastCell = cell;
			announce(getAnnouncement(e.detail.item, 'move', cell));
		};

		const onDragEnd = (e: CustomEvent<DragEndDetail>) => {
			lastCell = null;
			announce(getAnnouncement(e.detail.item, 'drop', e.detail.cell));
		};

		const onDragCancel = (e: CustomEvent<DragCancelDetail>) => {
			lastCell = null;
			announce(getAnnouncement(e.detail.item, 'cancel'));
		};

		const onResizeStart = (e: CustomEvent<ResizeStartDetail>) => {
			const { item, colspan, rowspan } = e.detail;
			lastResizeSize = { colspan, rowspan };
			announce(getResizeAnnouncement(item, 'resize-start', { colspan, rowspan }));
		};

		const onResizeMove = (e: CustomEvent<ResizeMoveDetail>) => {
			const { item, cell, colspan, rowspan } = e.detail;
			// Only announce if size actually changed
			if (
				lastResizeSize &&
				colspan === lastResizeSize.colspan &&
				rowspan === lastResizeSize.rowspan
			) {
				return;
			}
			lastResizeSize = { colspan, rowspan };
			announce(getResizeAnnouncement(item, 'resize-move', { cell, colspan, rowspan }));
		};

		const onResizeEnd = (e: CustomEvent<ResizeEndDetail>) => {
			const { item, cell, colspan, rowspan } = e.detail;
			lastResizeSize = null;
			announce(getResizeAnnouncement(item, 'resize-end', { cell, colspan, rowspan }));
		};

		const onResizeCancel = (e: CustomEvent<ResizeCancelDetail>) => {
			lastResizeSize = null;
			announce(getResizeAnnouncement(e.detail.item, 'resize-cancel'));
		};

		const unlisten = listenEvents(core.element, {
			'egg:drag-start': onDragStart as EventListener,
			'egg:drag-move': onDragMove as EventListener,
			'egg:drag-end': onDragEnd as EventListener,
			'egg:drag-cancel': onDragCancel as EventListener,
			'egg:resize-start': onResizeStart as EventListener,
			'egg:resize-move': onResizeMove as EventListener,
			'egg:resize-end': onResizeEnd as EventListener,
			'egg:resize-cancel': onResizeCancel as EventListener,
		});

		return () => {
			unlisten();
			liveRegion.remove();
		};
	},
});
`,
	"plugins/algorithm-harness.ts": `/**
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
	EggCore,
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
		const selector = \`\${selectorPrefix}\${item.id}\${selectorSuffix}\${excludeSelector}\`;
		const gridColumn = \`\${column} / span \${width}\`;
		const gridRow = \`\${item.row} / span \${item.height}\`;

		rules.push(\`\${selector} { grid-column: \${gridColumn}; grid-row: \${gridRow}; }\`);
	}

	return rules.join('\\n');
}

/**
 * Read item positions from DOM elements
 */
export function readItemsFromDOM(container: HTMLElement): ItemRect[] {
	const elements = container.querySelectorAll('[data-egg-item]');
	return Array.from(elements).map((el) => {
		const element = el as HTMLElement;
		const style = getComputedStyle(element);
		const column = parseInt(style.gridColumnStart, 10) || 1;
		const row = parseInt(style.gridRowStart, 10) || 1;
		const width =
			parseInt(element.getAttribute('data-egg-colspan') || '1', 10) || 1;
		const height =
			parseInt(element.getAttribute('data-egg-rowspan') || '1', 10) || 1;
		const id = element.dataset.id || element.dataset.eggItem || '';

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
	core?: EggCore;
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
 * @returns Cleanup function to detach the algorithm
 */
export function attachAlgorithm(
	gridElement: HTMLElement,
	strategy: AlgorithmStrategy,
	options: AlgorithmHarnessOptions = {},
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
		return element.dataset.id || element.dataset.eggItem || '';
	}

	/** Read items from DOM with original positions restored (except the actively dragged item) */
	function getItemsWithOriginals(excludeId: string | null, originals: Map<string, { column: number; row: number }>): ItemRect[] {
		return readItemsFromDOM(gridElement).map((item) => {
			const original = originals.get(item.id);
			if (original && item.id !== excludeId) {
				return { ...item, column: original.column, row: original.row };
			}
			return item;
		});
	}

	/** Build resize items from original positions, with resized item updated */
	function getResizeItems(
		originals: Map<string, { column: number; row: number; width: number; height: number }>,
		resizedId: string,
		cell: GridCell,
		colspan: number,
		rowspan: number,
	): ItemRect[] {
		const items: ItemRect[] = [];
		for (const [id, original] of originals) {
			if (id === resizedId) {
				items.push({ id, column: cell.column, row: cell.row, width: colspan, height: rowspan });
			} else {
				items.push({ id, column: original.column, row: original.row, width: original.width, height: original.height });
			}
		}
		return items;
	}

	function saveAndClearPreview(layout: ItemRect[], columnCount: number, afterSave?: () => void): void {
		if (!layoutModel || !columnCount) return;
		const positions = new Map<string, ItemPosition>();
		for (const item of layout) {
			positions.set(item.id, { column: item.column, row: item.row });
		}
		layoutModel.saveLayout(columnCount, positions);
		if (afterSave) afterSave();
		if (styles) {
			styles.clear('preview');
			styles.commit();
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
				styles.set('preview', css);
				styles.commit();

				const elements = gridElement.querySelectorAll('[data-egg-item]');
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
				const elements = gridElement.querySelectorAll('[data-egg-item]');
				for (const el of elements) {
					const element = el as HTMLElement;
					const id = getItemId(element);
					if (id === excludeId) continue;
					const item = layout.find((it) => it.id === id);
					if (item) {
						const colspan = parseInt(element.getAttribute('data-egg-colspan') || '1', 10) || 1;
						const rowspan = parseInt(element.getAttribute('data-egg-rowspan') || '1', 10) || 1;
						element.style.gridColumn = \`\${item.column} / span \${colspan}\`;
						element.style.gridRow = \`\${item.row} / span \${rowspan}\`;
					}
				}
			}

			if (onApplied) onApplied();
		};

		if (useViewTransition && 'startViewTransition' in document) {
			if (draggedElement && excludeId) {
				draggedElement.style.viewTransitionName = 'dragging';
			}
			(document as any).startViewTransition(applyChanges);
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
			const elements = gridElement.querySelectorAll('[data-egg-item]');
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

		const items = getItemsWithOriginals(draggedItemId, originalPositions!);
		const columns = dragStartColumnCount ?? getCurrentColumnCount();
		const newLayout = strategy.calculateDragLayout(items, draggedItemId, detail.cell, columns);
		applyLayout(newLayout, draggedItemId, true);

		if (strategy.afterDragMove) {
			strategy.afterDragMove(newLayout, draggedItemId, gridElement);
		}
	};

	const onDragEnd = (e: Event) => {
		if (!draggedItemId || !originalPositions) return;
		const detail = (e as CustomEvent<DragEndDetail>).detail;
		const items = getItemsWithOriginals(draggedItemId, originalPositions!);

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

		const restoreLayout = getItemsWithOriginals(null, originalPositions!);
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

		const items = getItemsWithOriginals(draggedItemId, originalPositions!);
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
			const elements = gridElement.querySelectorAll('[data-egg-item]');
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

		const items = getResizeItems(resizeOriginalPositions, resizedItemId, detail.cell, detail.colspan, detail.rowspan);
		const columns = resizeStartColumnCount ?? getCurrentColumnCount();
		const newLayout = strategy.calculateResizeLayout(items, resizedItemId, detail.cell, detail.colspan, detail.rowspan, columns);
		applyLayout(newLayout, resizedItemId, true);
	};

	const onResizeEnd = (e: Event) => {
		if (!strategy.calculateResizeLayout) return;
		if (!resizedItemId || !resizeOriginalPositions) return;
		const detail = (e as CustomEvent<ResizeEndDetail>).detail;
		const items = getResizeItems(resizeOriginalPositions, resizedItemId, detail.cell, detail.colspan, detail.rowspan);

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

		const restoreLayout = Array.from(resizeOriginalPositions, ([id, o]) => ({
			id, column: o.column, row: o.row, width: o.width, height: o.height,
		}));
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
		'egg:drag-start': onDragStart,
		'egg:drag-move': onDragMove,
		'egg:drag-end': onDragEnd,
		'egg:drag-cancel': onDragCancel,
		'egg:camera-settled': onCameraSettled,
		'egg:resize-start': onResizeStart,
		'egg:resize-move': onResizeMove,
		'egg:resize-end': onResizeEnd,
		'egg:resize-cancel': onResizeCancel,
	});
}
`,
	"plugins/algorithm-push.ts": `/**
 * Push-down layout algorithm for EG Grid
 *
 * This module provides both:
 * 1. Pure algorithm functions (overlap detection, push-down, compaction)
 * 2. DOM integration via the shared algorithm harness
 *
 * Usage (pure functions):
 *   import { calculateLayout, layoutToCSS } from 'eg-grid/algorithm-push';
 *   const newLayout = calculateLayout(items, movedId, targetCell);
 *   core.styles.set('preview', layoutToCSS(newLayout));
 *   core.styles.commit();
 *
 * Usage (DOM integration):
 *   import { init } from 'eg-grid';
 *   import { attachPushAlgorithm } from 'eg-grid/algorithm-push';
 *
 *   const grid = init(element);
 *   const detach = attachPushAlgorithm(grid.element);
 */

import { registerPlugin } from '../engine';

import type {
	AlgorithmPushPluginOptions,
	GridCell,
	EggCore,
	ResponsiveLayoutModel,
} from '../types';

import {
	attachAlgorithm,
	type AlgorithmHarnessOptions,
	type AlgorithmStrategy,
	type ItemRect,
} from './algorithm-harness';

// Re-export shared types and functions from harness
export {
	layoutToCSS,
	readItemsFromDOM,
	type ItemRect,
	type LayoutToCSSOptions,
} from './algorithm-harness';

// Also re-export GridCell so consumers don't need to import from types.ts
export type { GridCell } from '../types';

// ============================================================================
// Pure push-down algorithm
// ============================================================================

/**
 * Check if two items overlap
 */
export function itemsOverlap(a: ItemRect, b: ItemRect): boolean {
	return !(
		a.column + a.width <= b.column ||
		b.column + b.width <= a.column ||
		a.row + a.height <= b.row ||
		b.row + b.height <= a.row
	);
}

/**
 * Check if any items in the layout overlap
 * @returns Array of overlapping pairs, empty if no overlaps
 */
export function findOverlaps(items: ItemRect[]): Array<[ItemRect, ItemRect]> {
	const overlaps: Array<[ItemRect, ItemRect]> = [];
	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			if (itemsOverlap(items[i], items[j])) {
				overlaps.push([items[i], items[j]]);
			}
		}
	}
	return overlaps;
}

/**
 * Push items down recursively to resolve collisions
 * Mutates the items array in place
 */
export function pushDown(
	items: ItemRect[],
	moved: ItemRect,
	movedId: string,
	depth = 0,
): void {
	if (depth > 50) {
		return;
	}

	// Sort by row descending - push bottom items first so upper items settle on top
	// This preserves the original relative ordering of items
	const colliders = items
		.filter((it) => it.id !== movedId && it.id !== moved.id && itemsOverlap(moved, it))
		.sort((a, b) => b.row - a.row || a.column - b.column);

	for (const collider of colliders) {
		const newRow = moved.row + moved.height;
		if (collider.row < newRow) {
			collider.row = newRow;
			pushDown(items, collider, movedId, depth + 1);
		}
	}
}

/**
 * Compact items upward to fill gaps
 * Mutates the items array in place
 */
export function compactUp(items: ItemRect[], excludeId: string): void {
	const sorted = [...items]
		.filter((it) => it.id !== excludeId)
		.sort((a, b) => a.row - b.row || a.column - b.column);

	for (const item of sorted) {
		let iterations = 0;
		while (item.row > 1 && iterations < 100) {
			iterations++;
			item.row -= 1;
			const hasCollision = items.some(
				(other) => other.id !== item.id && itemsOverlap(item, other),
			);
			if (hasCollision) {
				item.row += 1;
				break;
			}
		}
	}
}

/**
 * Options for calculateLayout
 */
export interface CalculateLayoutOptions {
	/**
	 * Whether to compact items upward after resolving collisions (default: true)
	 */
	compact?: boolean;
}

/**
 * Calculate new layout after moving an item
 * Returns a new array with updated positions
 */
export function calculateLayout(
	items: ItemRect[],
	movedId: string,
	targetCell: GridCell,
	options: CalculateLayoutOptions = {},
): ItemRect[] {
	const { compact = true } = options;

	// Deep copy items
	const result = items.map((item) => ({ ...item }));

	const movedItem = result.find((it) => it.id === movedId);
	if (!movedItem) return result;

	movedItem.column = targetCell.column;
	movedItem.row = targetCell.row;

	pushDown(result, movedItem, movedId);
	if (compact) {
		compactUp(result, movedId);
	}

	return result;
}

// ============================================================================
// DOM integration via harness
// ============================================================================

/**
 * Options for attachPushAlgorithm
 */
export interface AttachPushAlgorithmOptions {
	selectorPrefix?: string;
	selectorSuffix?: string;
	/**
	 * Whether to compact items upward after resolving collisions (default: true)
	 * When false, items only get pushed down but won't float back up to fill gaps.
	 */
	compaction?: boolean;
	core?: EggCore;
	layoutModel?: ResponsiveLayoutModel;
}

/**
 * Attach push-down algorithm to a grid element.
 *
 * This creates event listeners for eg-grid drag events and updates
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
	const { compaction = true, ...harnessOptions } = options;

	const strategy: AlgorithmStrategy = {
		calculateDragLayout(items, movedId, targetCell) {
			return calculateLayout(items, movedId, targetCell, { compact: compaction });
		},
		calculateResizeLayout(items, resizedId, cell) {
			return calculateLayout(items, resizedId, cell, { compact: compaction });
		},
	};

	return attachAlgorithm(gridElement, strategy, harnessOptions);
}

// Register as a plugin for auto-initialization via init()
registerPlugin({
	name: 'algorithm-push',
	init(
		core,
		options?: AlgorithmPushPluginOptions & {
			core?: EggCore;
			layoutModel?: ResponsiveLayoutModel;
		},
	) {
		return attachPushAlgorithm(core.element, {
			...options,
			core: options?.core ?? core,
		});
	},
});
`,
	"plugins/algorithm-reorder.ts": `/**
 * Reorder layout algorithm for EG Grid
 *
 * Sequence-based reflow: items have a logical order, dragging changes
 * position in that sequence, all items reflow like CSS Grid auto-placement.
 *
 * Usage (pure functions):
 *   import { calculateReorderLayout, reflowItems, layoutToCSS } from 'eg-grid/algorithm-reorder';
 *
 * Usage (DOM integration):
 *   import { attachReorderAlgorithm } from 'eg-grid/algorithm-reorder';
 *   const detach = attachReorderAlgorithm(grid.element, { core });
 */

import { registerPlugin } from '../engine';

import type {
	AlgorithmReorderPluginOptions,
	GridCell,
	EggCore,
	ResponsiveLayoutModel,
} from '../types';

import {
	attachAlgorithm,
	type AlgorithmStrategy,
	type ItemRect,
} from './algorithm-harness';

// Re-export shared types and functions from harness
export {
	layoutToCSS,
	type ItemRect,
	type LayoutToCSSOptions,
} from './algorithm-harness';

// Also re-export GridCell so consumers don't need to import from types.ts
export type { GridCell } from '../types';

// ============================================================================
// Pure reorder algorithm
// ============================================================================

/**
 * Sort items into reading order (row-major: row first, then column)
 */
export function getItemOrder(items: ItemRect[]): ItemRect[] {
	return [...items].sort((a, b) => a.row - b.row || a.column - b.column);
}

/**
 * Check if a cell range is available (not occupied)
 */
function rangeAvailable(
	occupied: Set<string>,
	column: number,
	row: number,
	width: number,
	height: number,
	columns: number,
): boolean {
	if (column + width - 1 > columns) return false;

	for (let r = row; r < row + height; r++) {
		for (let c = column; c < column + width; c++) {
			if (occupied.has(\`\${c},\${r}\`)) return false;
		}
	}
	return true;
}

/**
 * Mark cells as occupied
 */
function markOccupied(
	occupied: Set<string>,
	column: number,
	row: number,
	width: number,
	height: number,
): void {
	for (let r = row; r < row + height; r++) {
		for (let c = column; c < column + width; c++) {
			occupied.add(\`\${c},\${r}\`);
		}
	}
}

/**
 * Reflow items into grid positions using auto-placement.
 * Scans left-to-right, top-to-bottom for the first position each item fits.
 *
 * @param items - Items in logical order (sequence determines placement priority)
 * @param columns - Number of grid columns
 * @returns New array with updated positions
 */
export function reflowItems(items: ItemRect[], columns: number): ItemRect[] {
	const occupied = new Set<string>();
	const result: ItemRect[] = [];

	for (const item of items) {
		const width = Math.min(item.width, columns);
		let placed = false;

		for (let row = 1; !placed; row++) {
			for (let col = 1; col <= columns; col++) {
				if (rangeAvailable(occupied, col, row, width, item.height, columns)) {
					markOccupied(occupied, col, row, width, item.height);
					result.push({ ...item, column: col, row, width });
					placed = true;
					break;
				}
			}
			// Safety: prevent infinite loop on pathological inputs
			if (row > 100) {
				result.push({ ...item, column: 1, row, width });
				markOccupied(occupied, 1, row, width, item.height);
				placed = true;
			}
		}
	}

	return result;
}

/**
 * Compare positions in reading order (row-major)
 */
function positionBefore(a: GridCell, b: GridCell): boolean {
	return a.row < b.row || (a.row === b.row && a.column < b.column);
}

/**
 * Options for calculateReorderLayout
 */
export interface CalculateReorderLayoutOptions {
	/** Number of grid columns */
	columns: number;
}

/**
 * Calculate new layout after reordering an item.
 *
 * 1. Sort items by current position to get logical order
 * 2. Remove moved item from sequence
 * 3. Reflow remaining items to get candidate positions
 * 4. Find insertion index: before the first candidate whose reflowed position
 *    comes after targetCell in reading order
 * 5. Insert moved item at that index
 * 6. Reflow all items
 *
 * @returns New array with updated positions
 */
export function calculateReorderLayout(
	items: ItemRect[],
	movedId: string,
	targetCell: GridCell,
	options: CalculateReorderLayoutOptions,
): ItemRect[] {
	const { columns } = options;

	// Deep copy items
	const all = items.map((item) => ({ ...item }));

	// Get logical order from current positions
	const ordered = getItemOrder(all);

	// Extract moved item
	const movedItem = ordered.find((it) => it.id === movedId);
	if (!movedItem) return reflowItems(ordered, columns);

	const remaining = ordered.filter((it) => it.id !== movedId);

	// Reflow remaining to get candidate positions
	const reflowed = reflowItems(remaining, columns);

	// Find insertion index: before the first reflowed item whose position
	// comes after targetCell in reading order
	let insertIndex = reflowed.length; // default: append at end
	for (let i = 0; i < reflowed.length; i++) {
		if (!positionBefore(reflowed[i], targetCell)) {
			insertIndex = i;
			break;
		}
	}

	// Build final sequence with moved item inserted
	const finalSequence: ItemRect[] = [
		...remaining.slice(0, insertIndex),
		movedItem,
		...remaining.slice(insertIndex),
	];

	// Reflow everything
	return reflowItems(finalSequence, columns);
}

// ============================================================================
// DOM integration via harness
// ============================================================================

/**
 * Options for attachReorderAlgorithm
 */
export interface AttachReorderAlgorithmOptions {
	selectorPrefix?: string;
	selectorSuffix?: string;
	core?: EggCore;
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
	const strategy: AlgorithmStrategy = {
		calculateDragLayout(items, movedId, targetCell, columns) {
			return calculateReorderLayout(items, movedId, targetCell, { columns });
		},

		afterDragMove(layout, movedId, el) {
			// Emit drop-preview so the placeholder knows the actual landing position.
			// Use queueMicrotask to ensure this fires AFTER all drag-move handlers
			// (including the placeholder's) have finished, regardless of listener order.
			const landingItem = layout.find((it) => it.id === movedId);
			if (landingItem) {
				const previewDetail = {
					cell: { column: landingItem.column, row: landingItem.row },
					colspan: landingItem.width,
					rowspan: landingItem.height,
				};
				queueMicrotask(() => {
					el.dispatchEvent(new CustomEvent('egg:drop-preview', {
						detail: previewDetail,
						bubbles: true,
					}));
				});
			}
		},

		calculateResizeLayout(items, _resizedId, _cell, _colspan, _rowspan, columns) {
			// For resize, reflow all items in their current order with the resized item's new size
			const ordered = [...items].sort((a, b) => a.row - b.row || a.column - b.column);
			return reflowItems(ordered, columns);
		},
	};

	return attachAlgorithm(gridElement, strategy, options);
}

// Register as a plugin for auto-initialization via init()
registerPlugin({
	name: 'algorithm-reorder',
	init(
		core,
		options?: AlgorithmReorderPluginOptions & {
			core?: EggCore;
			layoutModel?: ResponsiveLayoutModel;
		},
	) {
		return attachReorderAlgorithm(core.element, {
			...options,
			core: options?.core ?? core,
		});
	},
});
`,
	"plugins/camera.ts": `/**
 * Camera plugin for EG Grid
 *
 * Handles viewport scrolling to keep the active item visible:
 * - Auto-scroll when dragging near viewport edges
 * - Scroll into view when selecting items via keyboard
 *
 * The "active item" is: the dragged item during drag, or the selected item otherwise.
 */

import { listenEvents, registerPlugin } from '../engine';
import type {
	DragStartDetail,
	DragMoveDetail,
	DragEndDetail,
	DragCancelDetail,
	SelectDetail,
	DragState,
	EggCore,
	CameraPluginOptions,
} from '../types';

export type CameraMode = 'contain' | 'center' | 'off';

export interface CameraOptions {
	/**
	 * Scroll behavior mode:
	 * - 'contain': Only scroll when item would leave viewport (default)
	 * - 'center': Keep active item centered (can feel jarring)
	 * - 'off': Disable camera scrolling
	 */
	mode?: CameraMode;

	/**
	 * The scrollable container. Defaults to the grid's scroll parent.
	 * Pass \`window\` to scroll the document.
	 */
	scrollContainer?: HTMLElement | Window;

	/**
	 * Size of edge zones that trigger auto-scroll during drag (in pixels).
	 * @default 60
	 */
	edgeSize?: number;

	/**
	 * Maximum scroll speed in pixels per frame.
	 * @default 15
	 */
	scrollSpeed?: number;

	/**
	 * Scroll behavior for selection changes.
	 * @default 'smooth'
	 */
	scrollBehavior?: ScrollBehavior;

	/**
	 * Margin around item when scrolling into view (in pixels).
	 * @default 20
	 */
	scrollMargin?: number;

	/**
	 * Whether to scroll on selection changes (keyboard nav).
	 * @default true
	 */
	scrollOnSelect?: boolean;

	/**
	 * Whether to auto-scroll during drag.
	 * @default true
	 */
	autoScrollOnDrag?: boolean;

	/**
	 * Time in ms after scrolling stops before considered "settled".
	 * Other plugins can check isScrolling() to defer updates.
	 * @default 150
	 */
	settleDelay?: number;

	/**
	 * EG Grid core instance for provider registration.
	 * If provided, registers a 'camera' provider.
	 */
	core?: EggCore;
}

/**
 * Camera state exposed via provider registry.
 */
export interface CameraState {
	/** Whether the camera is actively auto-scrolling */
	isScrolling: boolean;
	/** Current camera mode */
	mode: CameraMode;
}

export interface CameraInstance {
	/** Change the camera mode */
	setMode(mode: CameraMode): void;
	/** Get current mode */
	getMode(): CameraMode;
	/** Manually scroll an item into view */
	scrollTo(item: HTMLElement, behavior?: ScrollBehavior): void;
	/** Stop any active auto-scrolling */
	stop(): void;
	/** Clean up and remove event listeners */
	destroy(): void;
}

/**
 * Find the nearest scrollable ancestor of an element.
 */
function findScrollParent(element: HTMLElement): HTMLElement | Window {
	let parent = element.parentElement;

	while (parent) {
		const style = getComputedStyle(parent);
		const overflowY = style.overflowY;
		const overflowX = style.overflowX;

		if (
			overflowY === 'auto' ||
			overflowY === 'scroll' ||
			overflowX === 'auto' ||
			overflowX === 'scroll'
		) {
			return parent;
		}

		parent = parent.parentElement;
	}

	return window;
}

/**
 * Get viewport rect for a scroll container.
 */
function getViewportRect(
	container: HTMLElement | Window
): { top: number; left: number; width: number; height: number } {
	if (container === window) {
		return {
			top: 0,
			left: 0,
			width: window.innerWidth,
			height: window.innerHeight,
		};
	}
	const rect = (container as HTMLElement).getBoundingClientRect();
	return {
		top: rect.top,
		left: rect.left,
		width: rect.width,
		height: rect.height,
	};
}

/**
 * Attach camera behavior to a EG Grid grid element.
 */
export function attachCamera(
	gridElement: HTMLElement,
	options: CameraOptions = {}
): CameraInstance {
	const {
		mode: initialMode = 'contain',
		scrollContainer: customContainer,
		edgeSize = 60,
		scrollSpeed = 15,
		scrollBehavior = 'smooth',
		scrollMargin = 20,
		scrollOnSelect = true,
		autoScrollOnDrag = true,
		settleDelay = 150,
		core,
	} = options;

	let mode = initialMode;
	let scrollContainer = customContainer ?? findScrollParent(gridElement);
	let animationFrameId: number | null = null;
	let isDragging = false;
	let dragSource: 'pointer' | 'keyboard' | null = null;
	let lastPointerX = 0;
	let lastPointerY = 0;
	let isScrolling = false;
	let settleTimeoutId: ReturnType<typeof setTimeout> | null = null;

	// Register provider if core is provided
	if (core) {
		core.providers.register<CameraState>('camera', () => ({
			isScrolling,
			mode,
		}));
	}

	/**
	 * Mark scrolling as active, with settle timeout.
	 */
	function setScrolling(active: boolean): void {
		if (active) {
			isScrolling = true;
			if (settleTimeoutId) {
				clearTimeout(settleTimeoutId);
				settleTimeoutId = null;
			}
		} else {
			// Start settle timer
			if (settleTimeoutId) clearTimeout(settleTimeoutId);
			settleTimeoutId = setTimeout(() => {
				isScrolling = false;
				settleTimeoutId = null;
				// Emit settle event so algorithm can recalculate
				gridElement.dispatchEvent(
					new CustomEvent('egg:camera-settled', { bubbles: true })
				);
			}, settleDelay);
		}
	}

	/**
	 * Scroll an item into view based on current mode.
	 */
	function scrollTo(item: HTMLElement, behavior: ScrollBehavior = scrollBehavior): void {
		if (mode === 'off') return;

		const itemRect = item.getBoundingClientRect();
		const viewport = getViewportRect(scrollContainer);

		if (mode === 'center') {
			// Center the item in the viewport
			const targetScrollTop =
				scrollContainer === window
					? window.scrollY + itemRect.top - viewport.height / 2 + itemRect.height / 2
					: (scrollContainer as HTMLElement).scrollTop +
						itemRect.top -
						viewport.top -
						viewport.height / 2 +
						itemRect.height / 2;

			const targetScrollLeft =
				scrollContainer === window
					? window.scrollX + itemRect.left - viewport.width / 2 + itemRect.width / 2
					: (scrollContainer as HTMLElement).scrollLeft +
						itemRect.left -
						viewport.left -
						viewport.width / 2 +
						itemRect.width / 2;

			if (scrollContainer === window) {
				window.scrollTo({ top: targetScrollTop, left: targetScrollLeft, behavior });
			} else {
				(scrollContainer as HTMLElement).scrollTo({
					top: targetScrollTop,
					left: targetScrollLeft,
					behavior,
				});
			}
		} else {
			// 'contain' mode - use CSS scroll-margin with scrollIntoView
			// The scroll-margin should be set in CSS on items (or we set it here)
			// This lets the browser handle all the positioning math

			item.scrollIntoView({
				behavior,
				block: 'nearest',
				inline: 'nearest',
			});
		}
	}

	/**
	 * Calculate scroll velocity based on pointer position relative to edges.
	 */
	function getEdgeScrollVelocity(
		pointerX: number,
		pointerY: number
	): { x: number; y: number } {
		const viewport = getViewportRect(scrollContainer);
		let velocityX = 0;
		let velocityY = 0;

		// Pointer position relative to viewport
		const relativeX = pointerX - viewport.left;
		const relativeY = pointerY - viewport.top;

		// Check horizontal edges
		if (relativeX < edgeSize) {
			// Near left edge - scroll left (negative)
			velocityX = -scrollSpeed * (1 - relativeX / edgeSize);
		} else if (relativeX > viewport.width - edgeSize) {
			// Near right edge - scroll right (positive)
			velocityX = scrollSpeed * (1 - (viewport.width - relativeX) / edgeSize);
		}

		// Check vertical edges
		if (relativeY < edgeSize) {
			// Near top edge - scroll up (negative)
			velocityY = -scrollSpeed * (1 - relativeY / edgeSize);
		} else if (relativeY > viewport.height - edgeSize) {
			// Near bottom edge - scroll down (positive)
			velocityY = scrollSpeed * (1 - (viewport.height - relativeY) / edgeSize);
		}

		return { x: velocityX, y: velocityY };
	}

	/**
	 * Animation loop for edge scrolling during drag.
	 */
	let wasScrollingLastFrame = false;

	function scrollLoop(): void {
		if (!isDragging || !autoScrollOnDrag || mode === 'off') {
			animationFrameId = null;
			if (wasScrollingLastFrame) {
				setScrolling(false);
				wasScrollingLastFrame = false;
			}
			return;
		}

		const velocity = getEdgeScrollVelocity(lastPointerX, lastPointerY);
		const isNearEdge = velocity.x !== 0 || velocity.y !== 0;

		if (isNearEdge) {
			if (!wasScrollingLastFrame) {
				setScrolling(true);
			}
			wasScrollingLastFrame = true;
			if (scrollContainer === window) {
				window.scrollBy(velocity.x, velocity.y);
			} else {
				(scrollContainer as HTMLElement).scrollLeft += velocity.x;
				(scrollContainer as HTMLElement).scrollTop += velocity.y;
			}
		} else {
			// Not near edge
			if (wasScrollingLastFrame) {
				setScrolling(false);
				wasScrollingLastFrame = false;
			}
		}

		animationFrameId = requestAnimationFrame(scrollLoop);
	}

	/**
	 * Start the scroll loop.
	 */
	function startScrollLoop(): void {
		if (animationFrameId === null) {
			animationFrameId = requestAnimationFrame(scrollLoop);
		}
	}

	/**
	 * Stop the scroll loop.
	 */
	function stopScrollLoop(): void {
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		setScrolling(false);
	}

	// Track pointer position continuously during drag (not just on cell change)
	function onPointerMove(e: PointerEvent): void {
		if (!isDragging || !autoScrollOnDrag || mode === 'off') return;

		lastPointerX = e.clientX;
		lastPointerY = e.clientY;
		startScrollLoop();
	}

	// Event handlers
	function onDragStart(e: CustomEvent<DragStartDetail>): void {
		isDragging = true;
		dragSource = e.detail.source;
		// Only listen for raw pointer moves during pointer drags (for edge-scroll detection)
		if (dragSource === 'pointer') {
			window.addEventListener('pointermove', onPointerMove);
		}
	}

	function onDragMove(e: CustomEvent<DragMoveDetail>): void {
		if (mode === 'off') return;

		if (e.detail.source === 'pointer') {
			// Pointer drag: update position for edge detection
			lastPointerX = e.detail.x;
			lastPointerY = e.detail.y;
		} else {
			// Keyboard drag - scroll to keep item visible
			// Use requestAnimationFrame to let the DOM update first
			requestAnimationFrame(() => {
				scrollTo(e.detail.item, 'smooth');
			});
		}
	}

	function onDragEnd(e: CustomEvent<DragEndDetail>): void {
		const wasPointerDrag = dragSource === 'pointer';
		isDragging = false;
		dragSource = null;
		stopScrollLoop();
		if (wasPointerDrag) {
			window.removeEventListener('pointermove', onPointerMove);
		}

		// For keyboard moves (nudge), scroll to keep item visible after it moves
		// Pointer drags handle their own scrolling via edge detection
		if (!wasPointerDrag && scrollOnSelect) {
			// Wait for layout to settle (view transitions may be animating)
			// Use setTimeout + rAF to ensure DOM has updated
			setTimeout(() => {
				requestAnimationFrame(() => {
					scrollTo(e.detail.item, 'smooth');
				});
			}, 100);
		}
	}

	function onDragCancel(e: CustomEvent<DragCancelDetail>): void {
		const wasPointerDrag = dragSource === 'pointer';
		isDragging = false;
		dragSource = null;
		stopScrollLoop();
		if (wasPointerDrag) {
			window.removeEventListener('pointermove', onPointerMove);
		}
	}

	function onSelect(e: CustomEvent<SelectDetail>): void {
		if (!scrollOnSelect || mode === 'off') return;

		// Don't scroll during drag - the drag handles its own scrolling
		if (isDragging) return;

		scrollTo(e.detail.item);
	}

	const removeListeners = listenEvents(gridElement, {
		'egg:drag-start': onDragStart as EventListener,
		'egg:drag-move': onDragMove as EventListener,
		'egg:drag-end': onDragEnd as EventListener,
		'egg:drag-cancel': onDragCancel as EventListener,
		'egg:select': onSelect as EventListener,
	});

	function destroy(): void {
		stopScrollLoop();
		removeListeners();
	}

	return {
		setMode(newMode: CameraMode): void {
			mode = newMode;
			if (mode === 'off') {
				stopScrollLoop();
			}
		},
		getMode(): CameraMode {
			return mode;
		},
		scrollTo,
		stop: stopScrollLoop,
		destroy,
	};
}

// Register as a plugin for auto-initialization via init()
registerPlugin({
	name: 'camera',
	init(core, options?: CameraPluginOptions & { core?: EggCore }) {
		const instance = attachCamera(core.element, {
			...options,
			core: options?.core ?? core,
		});
		return () => instance.destroy();
	},
});
`,
	"plugins/dev-overlay.ts": `/**
 * Development overlay plugin for EG Grid
 *
 * Provides a toggleable panel with:
 * - Debug tab: Grid info, item positions, event log
 * - Config tab: Algorithm options, plugin toggles
 *
 * Toggle with Shift+D (or programmatically)
 */

import { getItemCell } from '../engine';
import type { DragState, GridInfo, EggCore, LayoutState } from '../types';

export interface DevOverlayOptions {
	/** Initial tab to show ('debug' | 'config') */
	initialTab?: 'debug' | 'config';
	/** Keyboard shortcut to toggle (default: 'D' with Shift) */
	toggleKey?: string;
	/** Initial visibility */
	visible?: boolean;
	/** EggCore instance for provider access */
	core?: EggCore;
}

export interface ConfigOption {
	key: string;
	label: string;
	type: 'boolean' | 'select' | 'action';
	value?: boolean | string;
	options?: string[]; // For select type
	onChange?: (value: boolean | string) => void;
	onAction?: () => void; // For action type
}

interface EventLogEntry {
	time: number;
	type: string;
	detail: string;
}

const STYLES = \`
.egg-dev-overlay {
	position: fixed;
	bottom: 16px;
	right: 16px;
	width: 320px;
	max-height: 400px;
	background: rgba(0, 0, 0, 0.95);
	color: #fff;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 12px;
	border-radius: 8px;
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
	z-index: 1000;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	view-transition-name: dev-overlay;
}

.egg-dev-overlay[hidden] {
	display: none;
}

.egg-dev-tabs {
	display: flex;
	border-bottom: 1px solid #333;
	flex-shrink: 0;
}

.egg-dev-tab {
	flex: 1;
	padding: 8px 12px;
	background: transparent;
	border: none;
	color: #888;
	cursor: pointer;
	font-family: inherit;
	font-size: 11px;
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.egg-dev-tab:hover {
	color: #ccc;
}

.egg-dev-tab[data-active="true"] {
	color: #fff;
	background: #222;
}

.egg-dev-content {
	flex: 1;
	overflow-y: auto;
	padding: 12px;
}

.egg-dev-section {
	margin-bottom: 12px;
}

.egg-dev-section:last-child {
	margin-bottom: 0;
}

.egg-dev-section-title {
	color: #888;
	font-size: 10px;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	margin-bottom: 6px;
}

.egg-dev-grid-info {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 4px;
}

.egg-dev-info-item {
	display: flex;
	justify-content: space-between;
}

.egg-dev-info-label {
	color: #888;
}

.egg-dev-info-value {
	color: #4ade80;
}

.egg-dev-items-list {
	max-height: 120px;
	overflow-y: auto;
}

.egg-dev-item-row {
	display: flex;
	justify-content: space-between;
	padding: 2px 0;
	border-bottom: 1px solid #222;
}

.egg-dev-item-id {
	color: #60a5fa;
}

.egg-dev-item-pos {
	color: #888;
}

.egg-dev-event-log {
	max-height: 150px;
	overflow-y: auto;
}

.egg-dev-event {
	padding: 2px 0;
	border-bottom: 1px solid #222;
	display: flex;
	gap: 8px;
}

.egg-dev-event-time {
	color: #666;
	flex-shrink: 0;
}

.egg-dev-event-type {
	color: #f472b6;
	flex-shrink: 0;
}

.egg-dev-event-detail {
	color: #888;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.egg-dev-config-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 6px 0;
	border-bottom: 1px solid #222;
}

.egg-dev-config-label {
	color: #ccc;
}

.egg-dev-toggle {
	position: relative;
	width: 36px;
	height: 20px;
	background: #444;
	border-radius: 10px;
	cursor: pointer;
	transition: background 0.2s;
}

.egg-dev-toggle[data-checked="true"] {
	background: #4ade80;
}

.egg-dev-toggle::after {
	content: '';
	position: absolute;
	top: 2px;
	left: 2px;
	width: 16px;
	height: 16px;
	background: #fff;
	border-radius: 50%;
	transition: transform 0.2s;
}

.egg-dev-toggle[data-checked="true"]::after {
	transform: translateX(16px);
}

.egg-dev-select {
	background: #333;
	color: #fff;
	border: 1px solid #444;
	border-radius: 4px;
	padding: 4px 8px;
	font-family: inherit;
	font-size: 12px;
}

.egg-dev-close {
	position: absolute;
	top: 8px;
	right: 8px;
	background: transparent;
	border: none;
	color: #666;
	cursor: pointer;
	font-size: 16px;
	line-height: 1;
	padding: 4px;
}

.egg-dev-close:hover {
	color: #fff;
}

.egg-dev-hint {
	color: #666;
	font-size: 10px;
	text-align: center;
	padding: 8px;
	border-top: 1px solid #222;
}

.egg-dev-action-btn {
	background: #333;
	color: #fff;
	border: 1px solid #444;
	border-radius: 4px;
	padding: 6px 12px;
	font-family: inherit;
	font-size: 12px;
	cursor: pointer;
	transition: background 0.2s;
}

.egg-dev-action-btn:hover {
	background: #444;
}

.egg-dev-action-btn:active {
	background: #555;
}

.egg-dev-status {
	color: #888;
	font-size: 11px;
	margin-top: 4px;
}
\`;

/**
 * Attach the dev overlay to a grid element
 */
export function attachDevOverlay(
	gridElement: HTMLElement,
	options: DevOverlayOptions = {},
): { toggle: () => void; show: () => void; hide: () => void; registerOption: (option: ConfigOption) => void; destroy: () => void } {
	const { initialTab = 'debug', toggleKey = 'D', visible = false, core } = options;

	// Inject styles
	let styleElement = document.getElementById('egg-dev-overlay-styles') as HTMLStyleElement | null;
	if (!styleElement) {
		styleElement = document.createElement('style');
		styleElement.id = 'egg-dev-overlay-styles';
		styleElement.textContent = STYLES;
		document.head.appendChild(styleElement);
	}

	// State
	let currentTab = initialTab;
	let isVisible = visible;
	const eventLog: EventLogEntry[] = [];
	const configOptions: ConfigOption[] = [];
	const startTime = performance.now();

	// Create overlay element
	const overlay = document.createElement('div');
	overlay.className = 'egg-dev-overlay';
	overlay.hidden = !isVisible;

	function formatTime(time: number): string {
		const elapsed = ((time - startTime) / 1000).toFixed(1);
		return \`\${elapsed}s\`;
	}

	function render() {
		const gridInfo = core?.getGridInfo();
		const items = Array.from(gridElement.querySelectorAll('[data-egg-item]')) as HTMLElement[];

		overlay.innerHTML = \`
			<button class="egg-dev-close">&times;</button>
			<div class="egg-dev-tabs">
				<button class="egg-dev-tab" data-tab="debug" data-active="\${currentTab === 'debug'}">Debug</button>
				<button class="egg-dev-tab" data-tab="config" data-active="\${currentTab === 'config'}">Config</button>
			</div>
			<div class="egg-dev-content">
				\${currentTab === 'debug' ? renderDebugTab(gridInfo, items) : renderConfigTab()}
			</div>
			<div class="egg-dev-hint">Shift+\${toggleKey} to toggle</div>
		\`;

		// Attach event listeners
		overlay.querySelector('.egg-dev-close')?.addEventListener('click', hide);

		overlay.querySelectorAll('.egg-dev-tab').forEach(tab => {
			tab.addEventListener('click', () => {
				currentTab = (tab as HTMLElement).dataset.tab as 'debug' | 'config';
				render();
			});
		});

		// Config toggles
		overlay.querySelectorAll('.egg-dev-toggle').forEach(toggle => {
			toggle.addEventListener('click', () => {
				const key = (toggle as HTMLElement).dataset.key;
				const option = configOptions.find(o => o.key === key);
				if (option && option.type === 'boolean') {
					option.value = !option.value;
					option.onChange(option.value);
					render();
				}
			});
		});

		// Config selects
		overlay.querySelectorAll('.egg-dev-select').forEach(select => {
			select.addEventListener('change', (e) => {
				const key = (select as HTMLElement).dataset.key;
				const option = configOptions.find(o => o.key === key);
				if (option && option.type === 'select' && option.onChange) {
					option.value = (e.target as HTMLSelectElement).value;
					option.onChange(option.value);
				}
			});
		});

		// Action buttons
		overlay.querySelectorAll('.egg-dev-action-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const key = (btn as HTMLElement).dataset.key;
				const option = configOptions.find(o => o.key === key);
				if (option && option.type === 'action' && option.onAction) {
					option.onAction();
				}
			});
		});
	}

	function renderDebugTab(gridInfo: GridInfo | undefined, items: HTMLElement[]): string {
		if (!gridInfo) return '<div class="egg-dev-section">No core available</div>';
		// Query providers for live state
		const dragState = core?.providers.get<DragState>('drag');
		const layoutState = core?.providers.get<LayoutState>('layout');

		return \`
			\${core ? \`
			<div class="egg-dev-section">
				<div class="egg-dev-section-title">Providers</div>
				<div class="egg-dev-grid-info">
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">drag</span>
						<span class="egg-dev-info-value">\${dragState ? \`dragging \${dragState.item.dataset.id || dragState.item.id || '?'}\` : 'idle'}</span>
					</div>
					\${dragState ? \`
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">cell</span>
						<span class="egg-dev-info-value">(\${dragState.cell.column}, \${dragState.cell.row})</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">start</span>
						<span class="egg-dev-info-value">(\${dragState.startCell.column}, \${dragState.startCell.row})</span>
					</div>
					\` : ''}
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">layout</span>
						<span class="egg-dev-info-value">\${layoutState ? \`\${layoutState.items.length} items, \${layoutState.columns} cols\` : 'none'}</span>
					</div>
				</div>
			</div>
			\` : ''}
			<div class="egg-dev-section">
				<div class="egg-dev-section-title">Grid Info</div>
				<div class="egg-dev-grid-info">
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Columns</span>
						<span class="egg-dev-info-value">\${gridInfo.columns.length}</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Rows</span>
						<span class="egg-dev-info-value">\${gridInfo.rows.length}</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Cell W</span>
						<span class="egg-dev-info-value">\${Math.round(gridInfo.cellWidth)}px</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Cell H</span>
						<span class="egg-dev-info-value">\${Math.round(gridInfo.cellHeight)}px</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Gap</span>
						<span class="egg-dev-info-value">\${gridInfo.gap}px</span>
					</div>
					<div class="egg-dev-info-item">
						<span class="egg-dev-info-label">Items</span>
						<span class="egg-dev-info-value">\${items.length}</span>
					</div>
				</div>
			</div>
			<div class="egg-dev-section">
				<div class="egg-dev-section-title">Items</div>
				<div class="egg-dev-items-list">
					\${items.map(item => {
						const cell = getItemCell(item);
						const id = item.dataset.id || item.id || '?';
						const colspan = item.getAttribute('data-egg-colspan') || '1';
						const rowspan = item.getAttribute('data-egg-rowspan') || '1';
						return \`
							<div class="egg-dev-item-row">
								<span class="egg-dev-item-id">\${id}</span>
								<span class="egg-dev-item-pos">col \${cell.column}, row \${cell.row} (\${colspan}×\${rowspan})</span>
							</div>
						\`;
					}).join('')}
				</div>
			</div>
			<div class="egg-dev-section">
				<div class="egg-dev-section-title">Event Log</div>
				<div class="egg-dev-event-log">
					\${eventLog.length === 0 ? '<div style="color: #666">No events yet</div>' : ''}
					\${eventLog.slice(-20).reverse().map(entry => \`
						<div class="egg-dev-event">
							<span class="egg-dev-event-time">\${formatTime(entry.time)}</span>
							<span class="egg-dev-event-type">\${entry.type}</span>
							<span class="egg-dev-event-detail">\${entry.detail}</span>
						</div>
					\`).join('')}
				</div>
			</div>
		\`;
	}

	function renderConfigTab(): string {
		if (configOptions.length === 0) {
			return \`<div style="color: #666; text-align: center; padding: 20px;">No config options registered.<br><br>Use registerOption() to add options.</div>\`;
		}

		const toggles = configOptions.filter(o => o.type === 'boolean');
		const actions = configOptions.filter(o => o.type === 'action');

		return \`
			<div class="egg-dev-section">
				<div class="egg-dev-section-title">Options</div>
				\${toggles.map(option => \`
					<div class="egg-dev-config-row">
						<span class="egg-dev-config-label">\${option.label}</span>
						<div class="egg-dev-toggle" data-key="\${option.key}" data-checked="\${option.value}"></div>
					</div>
				\`).join('')}
			</div>
			\${actions.length > 0 ? \`
				<div class="egg-dev-section">
					<div class="egg-dev-section-title">Actions</div>
					\${actions.map(option => \`
						<div class="egg-dev-config-row">
							<span class="egg-dev-config-label">\${option.label}</span>
							<button class="egg-dev-action-btn" data-key="\${option.key}">Run</button>
						</div>
					\`).join('')}
				</div>
			\` : ''}
		\`;
	}

	function logEvent(type: string, detail: string) {
		eventLog.push({ time: performance.now(), type, detail });
		if (eventLog.length > 100) {
			eventLog.shift();
		}
		if (isVisible && currentTab === 'debug') {
			render();
		}
	}

	function show() {
		isVisible = true;
		overlay.hidden = false;
		render();
	}

	function hide() {
		isVisible = false;
		overlay.hidden = true;
	}

	function toggle() {
		if (isVisible) {
			hide();
		} else {
			show();
		}
	}

	function registerOption(option: ConfigOption) {
		const existing = configOptions.findIndex(o => o.key === option.key);
		if (existing >= 0) {
			configOptions[existing] = option;
		} else {
			configOptions.push(option);
		}
		if (isVisible) {
			render();
		}
	}

	// Event listeners for logging
	const onDragStart = (e: Event) => {
		const detail = (e as CustomEvent).detail;
		const id = detail.item?.dataset?.id || detail.item?.id || '?';
		logEvent('drag-start', \`\${id} at (\${detail.cell.column}, \${detail.cell.row})\`);
	};

	const onDragMove = (e: Event) => {
		const detail = (e as CustomEvent).detail;
		const id = detail.item?.dataset?.id || detail.item?.id || '?';
		logEvent('drag-move', \`\${id} → (\${detail.cell.column}, \${detail.cell.row})\`);
	};

	const onDragEnd = (e: Event) => {
		const detail = (e as CustomEvent).detail;
		const id = detail.item?.dataset?.id || detail.item?.id || '?';
		logEvent('drag-end', \`\${id} at (\${detail.cell.column}, \${detail.cell.row})\`);
	};

	const onDragCancel = (e: Event) => {
		const detail = (e as CustomEvent).detail;
		const id = detail.item?.dataset?.id || detail.item?.id || '?';
		logEvent('drag-cancel', id);
	};

	const onSelect = (e: Event) => {
		const detail = (e as CustomEvent).detail;
		const id = detail.item?.dataset?.id || detail.item?.id || '?';
		logEvent('select', id);
	};

	const onDeselect = (e: Event) => {
		const detail = (e as CustomEvent).detail;
		const id = detail.item?.dataset?.id || detail.item?.id || 'none';
		logEvent('deselect', id);
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === toggleKey && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
			e.preventDefault();
			toggle();
		}
	};

	// Attach listeners
	gridElement.addEventListener('egg:drag-start', onDragStart);
	gridElement.addEventListener('egg:drag-move', onDragMove);
	gridElement.addEventListener('egg:drag-end', onDragEnd);
	gridElement.addEventListener('egg:drag-cancel', onDragCancel);
	gridElement.addEventListener('egg:select', onSelect);
	gridElement.addEventListener('egg:deselect', onDeselect);
	document.addEventListener('keydown', onKeyDown);

	// Add to DOM
	document.body.appendChild(overlay);
	render();

	function destroy() {
		gridElement.removeEventListener('egg:drag-start', onDragStart);
		gridElement.removeEventListener('egg:drag-move', onDragMove);
		gridElement.removeEventListener('egg:drag-end', onDragEnd);
		gridElement.removeEventListener('egg:drag-cancel', onDragCancel);
		gridElement.removeEventListener('egg:select', onSelect);
		gridElement.removeEventListener('egg:deselect', onDeselect);
		document.removeEventListener('keydown', onKeyDown);
		overlay.remove();
	}

	return { toggle, show, hide, registerOption, destroy };
}
`,
	"plugins/keyboard.ts": `import { getItemCell, getItemSize, registerPlugin } from '../engine';
import type { GridCell, ItemPosition } from '../types';
import { isDragging } from '../state-machine';

registerPlugin({
	name: 'keyboard',
	init(core) {
		// Use state machine for all interaction state
		const { stateMachine } = core;

		// Track pending viewTransitionName restoration to avoid race conditions
		let pendingVtnRestore: { item: HTMLElement; timeoutId: number } | null = null;

		/**
		 * Helper to get current column count from grid
		 */
		const getColumnCount = (): number => {
			return core.getGridInfo().columns.length;
		};

		/**
		 * Capture all item positions and sizes in a single DOM walk
		 */
		const captureItemState = (): { positions: Map<string, ItemPosition>; sizes: Map<string, { width: number; height: number }> } => {
			const positions = new Map<string, ItemPosition>();
			const sizes = new Map<string, { width: number; height: number }>();
			for (const item of core.element.querySelectorAll('[data-egg-item]')) {
				const el = item as HTMLElement;
				const id = el.id || el.getAttribute('data-egg-item') || '';
				if (id) {
					const cell = getItemCell(el);
					positions.set(id, { column: cell.column, row: cell.row });
					const { colspan, rowspan } = getItemSize(el);
					sizes.set(id, { width: colspan, height: rowspan });
				}
			}
			return { positions, sizes };
		};

		/**
		 * Check if currently holding an item (keyboard drag in progress)
		 */
		const isHoldingItem = (): boolean => {
			const state = stateMachine.getState();
			return isDragging(state) && state.interaction?.mode === 'keyboard';
		};

		/**
		 * Get the held item element from state machine
		 */
		const getHeldItem = (): HTMLElement | null => {
			const state = stateMachine.getState();
			if (isDragging(state) && state.interaction?.mode === 'keyboard') {
				return state.interaction.element;
			}
			return null;
		};

		/**
		 * Get direction from key, supporting both arrows and vim-style hjkl.
		 * Uses both e.key and e.code to handle Alt+hjkl on Mac (Alt produces special chars).
		 */
		const KEY_DIR: Record<string, 'up' | 'down' | 'left' | 'right'> = {
			ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
			k: 'up', K: 'up', j: 'down', J: 'down', h: 'left', H: 'left', l: 'right', L: 'right',
		};
		// Fallback to code for Alt+hjkl on Mac (Alt produces special characters)
		const CODE_DIR: Record<string, 'up' | 'down' | 'left' | 'right'> = {
			KeyK: 'up', KeyJ: 'down', KeyH: 'left', KeyL: 'right',
		};
		const getDirection = (key: string, code: string) => KEY_DIR[key] ?? CODE_DIR[code] ?? null;

		/**
		 * Get adjacent cell in a direction
		 */
		const getAdjacentCell = (
			cell: GridCell,
			direction: 'up' | 'down' | 'left' | 'right',
			amount = 1,
		): GridCell => {
			switch (direction) {
				case 'up':
					return { ...cell, row: Math.max(1, cell.row - amount) };
				case 'down':
					return { ...cell, row: cell.row + amount };
				case 'left':
					return { ...cell, column: Math.max(1, cell.column - amount) };
				case 'right':
					return { ...cell, column: cell.column + amount };
			}
		};

		/**
		 * Find the item at or closest to a cell position in a direction
		 */
		const findItemInDirection = (
			fromCell: GridCell,
			direction: 'up' | 'down' | 'left' | 'right',
			excludeItem: HTMLElement,
		): HTMLElement | null => {
			const items = Array.from(
				core.element.querySelectorAll('[data-egg-item]'),
			) as HTMLElement[];

			let bestItem: HTMLElement | null = null;
			let bestDistance = Infinity;

			for (const item of items) {
				if (item === excludeItem) continue;

				const cell = getItemCell(item);
				let distance: number;
				let isInDirection: boolean;

				switch (direction) {
					case 'up':
						isInDirection = cell.row < fromCell.row;
						distance = fromCell.row - cell.row + Math.abs(cell.column - fromCell.column) * 0.1;
						break;
					case 'down':
						isInDirection = cell.row > fromCell.row;
						distance = cell.row - fromCell.row + Math.abs(cell.column - fromCell.column) * 0.1;
						break;
					case 'left':
						isInDirection = cell.column < fromCell.column;
						distance = fromCell.column - cell.column + Math.abs(cell.row - fromCell.row) * 0.1;
						break;
					case 'right':
						isInDirection = cell.column > fromCell.column;
						distance = cell.column - fromCell.column + Math.abs(cell.row - fromCell.row) * 0.1;
						break;
				}

				if (isInDirection && distance < bestDistance) {
					bestDistance = distance;
					bestItem = item;
				}
			}

			return bestItem;
		};

		const onKeyDown = (e: KeyboardEvent) => {
			// Toggle keyboard mode with Shift+G (G for Grid)
			if (e.key === 'G' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
				e.preventDefault();
				stateMachine.transition({ type: 'TOGGLE_KEYBOARD_MODE' });
				const keyboardMode = stateMachine.getState().keyboardModeActive;
				if (keyboardMode) {
					core.element.setAttribute('data-egg-keyboard-mode', '');
					// If no item is selected, select the first one
					if (!core.selectedItem) {
						const firstItem = core.element.querySelector('[data-egg-item]') as HTMLElement | null;
						if (firstItem) {
							core.select(firstItem);
						}
					}
				} else {
					core.element.removeAttribute('data-egg-keyboard-mode');
				}
				return;
			}

			// All other keyboard shortcuts require keyboard mode, selected item, or focus inside grid
			const focused = document.activeElement as HTMLElement | null;
			const focusInGrid = focused && core.element.contains(focused);
			const hasSelection = core.selectedItem !== null;
			const keyboardMode = stateMachine.getState().keyboardModeActive;
			if (!keyboardMode && !focusInGrid && !hasSelection) return;

			const selectedItem = core.selectedItem;
			const direction = getDirection(e.key, e.code);

			// Cancel drag or deselect with Escape
			if (e.key === 'Escape') {
				e.preventDefault();
				const heldItem = getHeldItem();
				if (heldItem) {
					heldItem.removeAttribute('data-egg-dragging');
					core.emit('drag-cancel', { item: heldItem, source: 'keyboard' as const });
					stateMachine.transition({ type: 'CANCEL_INTERACTION' });
				} else if (selectedItem) {
					core.deselect();
				}
				// Turn off keyboard mode if it's active
				if (stateMachine.getState().keyboardModeActive) {
					stateMachine.transition({ type: 'TOGGLE_KEYBOARD_MODE' });
				}
				core.element.removeAttribute('data-egg-keyboard-mode');
				return;
			}

			// Pick up / drop with Enter or Space
			if (e.key === 'Enter' || e.key === ' ') {
				if (!selectedItem) return;
				e.preventDefault();

				const heldItem = getHeldItem();
				if (heldItem) {
					// Drop the held item - use target cell from state machine
					const state = stateMachine.getState();
					const targetCell = state.interaction?.targetCell ?? getItemCell(heldItem);
					const size = getItemSize(heldItem);
					heldItem.removeAttribute('data-egg-dragging');
					core.emit('drag-end', { item: heldItem, cell: targetCell, colspan: size.colspan, rowspan: size.rowspan, source: 'keyboard' as const });
					stateMachine.transition({ type: 'COMMIT_INTERACTION' });
					stateMachine.transition({ type: 'FINISH_COMMIT' });
				} else {
					// Pick up the selected item
					const itemId = selectedItem.id || selectedItem.getAttribute('data-egg-item') || '';
					const size = getItemSize(selectedItem);
					const startCell = getItemCell(selectedItem);
					const { positions, sizes } = captureItemState();

					// Start interaction via state machine
					stateMachine.transition({
						type: 'START_INTERACTION',
						context: {
							type: 'drag',
							mode: 'keyboard',
							itemId,
							element: selectedItem,
							columnCount: getColumnCount(),
							originalPositions: positions,
							originalSizes: sizes,
							targetCell: startCell,
							currentSize: { colspan: size.colspan, rowspan: size.rowspan },
						},
					});

					selectedItem.setAttribute('data-egg-dragging', '');
					core.emit('drag-start', { item: selectedItem, cell: startCell, colspan: size.colspan, rowspan: size.rowspan, source: 'keyboard' as const });
				}
				return;
			}

			// Navigation keys
			if (direction) {
				e.preventDefault();

				// Alt+nav: Select adjacent item
				if (e.altKey && !e.ctrlKey && !e.shiftKey && selectedItem) {
					const fromCell = getItemCell(selectedItem);
					const adjacentItem = findItemInDirection(fromCell, direction, selectedItem);
					if (adjacentItem) {
						core.select(adjacentItem);
					}
					return;
				}

				// Must have a selected item for other nav actions
				if (!selectedItem) return;

				const currentCell = getItemCell(selectedItem);
				const itemSize = getItemSize(selectedItem);
				const gridInfo = core.getGridInfo();

				// Shift+nav: Resize item (change colspan/rowspan)
				if (e.shiftKey && !e.ctrlKey && !e.altKey) {
					let newColspan = itemSize.colspan;
					let newRowspan = itemSize.rowspan;

					// Calculate new size based on direction
					switch (direction) {
						case 'right':
							newColspan = Math.min(itemSize.colspan + 1, gridInfo.columns.length - currentCell.column + 1);
							break;
						case 'left':
							newColspan = Math.max(1, itemSize.colspan - 1);
							break;
						case 'down':
							newRowspan = itemSize.rowspan + 1; // No max for rows (grid auto-grows)
							break;
						case 'up':
							newRowspan = Math.max(1, itemSize.rowspan - 1);
							break;
					}

					// Skip if size didn't change (already at limit)
					if (newColspan === itemSize.colspan && newRowspan === itemSize.rowspan) {
						return;
					}

					// Cancel any pending viewTransitionName restoration
					if (pendingVtnRestore) {
						clearTimeout(pendingVtnRestore.timeoutId);
						pendingVtnRestore.item.style.removeProperty('view-transition-name');
						pendingVtnRestore = null;
					}

					const itemId = selectedItem.id || selectedItem.getAttribute('data-egg-item') || '';
					const { positions: rPositions, sizes: rSizes } = captureItemState();

					// Start resize interaction via state machine
					stateMachine.transition({
						type: 'START_INTERACTION',
						context: {
							type: 'resize',
							mode: 'keyboard',
							itemId,
							element: selectedItem,
							columnCount: getColumnCount(),
							originalPositions: rPositions,
							originalSizes: rSizes,
							targetCell: currentCell,
							currentSize: { colspan: newColspan, rowspan: newRowspan },
						},
					});

					// Mark item as resizing so CSS can disable its View Transition animation
					// (matches pointer resize behavior - item snaps, others animate)
					(selectedItem.style as any).viewTransitionName = 'resizing';

					// Emit resize events for algorithm and other plugins to handle
					// Use 'se' handle for increases, appropriate edge for decreases
					const handle = direction === 'right' || direction === 'down' ? 'se' :
					               direction === 'left' ? 'w' : 'n';

					core.emit('resize-start', {
						item: selectedItem,
						cell: currentCell,
						colspan: itemSize.colspan,
						rowspan: itemSize.rowspan,
						handle,
					});

					// Update item data attributes (algorithm reads these for size)
					selectedItem.setAttribute('data-egg-colspan', String(newColspan));
					selectedItem.setAttribute('data-egg-rowspan', String(newRowspan));

					// Don't set inline grid styles - let algorithm handle layout via CSS rules
					// This allows View Transitions to animate other items smoothly

					core.emit('resize-end', {
						item: selectedItem,
						cell: currentCell,
						colspan: newColspan,
						rowspan: newRowspan,
					});

					// Complete the interaction via state machine
					stateMachine.transition({ type: 'COMMIT_INTERACTION' });
					stateMachine.transition({ type: 'FINISH_COMMIT' });

					// Restore viewTransitionName after View Transition completes (200ms)
					// Track the timeout so we can cancel it if another resize starts
					const itemToRestore = selectedItem;
					const timeoutId = window.setTimeout(() => {
						itemToRestore.style.removeProperty('view-transition-name');
						if (pendingVtnRestore?.item === itemToRestore) {
							pendingVtnRestore = null;
						}
					}, 250);
					pendingVtnRestore = { item: itemToRestore, timeoutId };
					return;
				}

				// Calculate move amount
				let amount = 1;
				if (e.ctrlKey || e.metaKey) {
					// Ctrl+nav: Jump by item size
					amount = direction === 'up' || direction === 'down'
						? itemSize.rowspan
						: itemSize.colspan;
				}

				const rawCell = getAdjacentCell(currentCell, direction, amount);

				// Clamp cell so item fits within grid bounds
				const maxColumn = Math.max(1, gridInfo.columns.length - itemSize.colspan + 1);
				const maxRow = Math.max(1, gridInfo.rows.length - itemSize.rowspan + 1);
				const targetCell = {
					column: Math.max(1, Math.min(maxColumn, rawCell.column)),
					row: Math.max(1, Math.min(maxRow, rawCell.row)),
				};

				// Skip if clamped position is same as current (at edge, can't move further)
				if (targetCell.column === currentCell.column && targetCell.row === currentCell.row) {
					return;
				}

				const heldItem = getHeldItem();
				if (heldItem) {
					// Moving a held item - update state machine with new target
					stateMachine.transition({
						type: 'UPDATE_INTERACTION',
						targetCell,
					});
					core.emit('drag-move', { item: heldItem, cell: targetCell, x: 0, y: 0, colspan: itemSize.colspan, rowspan: itemSize.rowspan, source: 'keyboard' as const });
				} else {
					// Nudge: Move item directly
					// Emit drag-start then drag-end (skip drag-move since we don't need preview)
					core.emit('drag-start', { item: selectedItem, cell: currentCell, colspan: itemSize.colspan, rowspan: itemSize.rowspan, source: 'keyboard' as const });
					core.emit('drag-end', { item: selectedItem, cell: targetCell, colspan: itemSize.colspan, rowspan: itemSize.rowspan, source: 'keyboard' as const });
				}
				return;
			}
		};

		document.addEventListener('keydown', onKeyDown);

		return () => {
			document.removeEventListener('keydown', onKeyDown);
			core.element.removeAttribute('data-egg-keyboard-mode');
		};
	},
});
`,
	"plugins/placeholder.ts": `/**
 * Placeholder plugin for EG Grid
 *
 * Shows a visual placeholder where the dragged item will land.
 * Handles creation, positioning, and cleanup automatically.
 */

import { listenEvents, registerPlugin } from '../engine';
import type {
	DragStartDetail,
	DragMoveDetail,
	DragEndDetail,
	DragCancelDetail,
	DropPreviewDetail,
	PlaceholderPluginOptions,
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
 * \`\`\`js
 * import { init } from './eg-grid.js';
 * import { attachPlaceholder } from './placeholder.js';
 *
 * const grid = init(document.getElementById('grid'));
 * const placeholder = attachPlaceholder(grid.element);
 *
 * // Later, to clean up:
 * placeholder.destroy();
 * \`\`\`
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
		placeholder.style.gridColumn = \`\${column} / span \${colspan}\`;
		placeholder.style.gridRow = \`\${row} / span \${rowspan}\`;
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
		'egg:drag-start': handleDragStart as EventListener,
		'egg:drag-move': handleDragMove as EventListener,
		'egg:drag-end': handleDragEnd as EventListener,
		'egg:drag-cancel': handleDragCancel as EventListener,
		'egg:drop-preview': handleDropPreview as EventListener,
		'egg:resize-start': handleResizeStart as EventListener,
		'egg:resize-move': handleResizeMove as EventListener,
		'egg:resize-end': handleResizeEnd as EventListener,
		'egg:resize-cancel': handleResizeCancel as EventListener,
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

// Register as a plugin for auto-initialization via init()
registerPlugin({
	name: 'placeholder',
	init(core, options?: PlaceholderPluginOptions) {
		const instance = attachPlaceholder(core.element, options);
		return () => instance.destroy();
	},
});
`,
	"plugins/pointer.ts": `import { getItemCell, getItemSize, registerPlugin } from '../engine';
import type { DragState as ExposedDragState, GridCell } from '../types';
import { animateFLIPWithTracking } from '../utils/flip';

// Hysteresis: distance in grid units before changing target cell
const HYSTERESIS = 0.4;
// Minimum time (ms) between target changes to prevent jitter
const TARGET_CHANGE_DEBOUNCE = 40;
// Minimum pixels of movement before starting a drag
const DRAG_THRESHOLD = 5;
// Minimum pixels of cumulative movement before applying predictive offset
const PREDICTION_THRESHOLD = 30;
// Fraction of cell to lead ahead when prediction is active (0.5 = half a cell)
const PREDICTION_LEAD = 0.5;

interface PendingDrag {
	item: HTMLElement;
	pointerId: number;
	startX: number;
	startY: number;
	rect: DOMRect;
	startCell: GridCell;
	colspan: number;
	rowspan: number;
}

interface DragState {
	item: HTMLElement;
	pointerId: number;
	offsetX: number;
	offsetY: number;
	initialRect: DOMRect;
	startCell: GridCell;
	lastCell: GridCell;
	lastTargetChangeTime: number;
	colspan: number;
	rowspan: number;
	// For predictive placeholder
	dragStartX: number;
	dragStartY: number;
}

registerPlugin({
	name: 'pointer',
	init(core) {
		let pendingDrag: PendingDrag | null = null;
		let dragState: DragState | null = null;

		// Register provider for drag state - allows other plugins to query current drag
		core.providers.register<ExposedDragState | null>('drag', () => {
			if (!dragState) return null;
			return {
				item: dragState.item,
				cell: dragState.lastCell,
				startCell: dragState.startCell,
				colspan: dragState.colspan,
				rowspan: dragState.rowspan,
			};
		});

		const startDrag = (pending: PendingDrag, e: PointerEvent) => {
			const { item, pointerId, rect, startCell, colspan, rowspan } = pending;

			dragState = {
				item,
				pointerId,
				offsetX: e.clientX - rect.left,
				offsetY: e.clientY - rect.top,
				initialRect: rect,
				startCell,
				lastCell: startCell,
				lastTargetChangeTime: 0,
				colspan,
				rowspan,
				dragStartX: e.clientX,
				dragStartY: e.clientY,
			};

			item.setAttribute('data-egg-dragging', '');
			document.body.classList.add('is-dragging');

			// Emit drag-start BEFORE changing grid styles so originalPositions captures correct layout
			core.emit('drag-start', { item, cell: startCell, colspan, rowspan, source: 'pointer' as const });

			// Switch to fixed positioning - CSS Grid ignores fixed positioned children
			// No need to move item out of grid container
			item.style.position = 'fixed';
			item.style.left = \`\${rect.left}px\`;
			item.style.top = \`\${rect.top}px\`;
			item.style.width = \`\${rect.width}px\`;
			item.style.height = \`\${rect.height}px\`;
			item.style.zIndex = '100';

			pendingDrag = null;
		};

		const onPointerDown = (e: PointerEvent) => {
			const item = (e.target as HTMLElement).closest(
				'[data-egg-item]',
			) as HTMLElement | null;
			if (!item) return;

			// Select the item on click
			core.select(item);

			// Prevent text selection during potential drag
			e.preventDefault();

			const rect = item.getBoundingClientRect();
			const startCell = getItemCell(item);
			const { colspan, rowspan } = getItemSize(item);

			// Store pending drag state - don't start drag until movement
			pendingDrag = {
				item,
				pointerId: e.pointerId,
				startX: e.clientX,
				startY: e.clientY,
				rect,
				startCell,
				colspan,
				rowspan,
			};

			item.setPointerCapture(e.pointerId);
			item.addEventListener('pointermove', onPointerMove);
			item.addEventListener('pointerup', onPointerUp);
			item.addEventListener('pointercancel', onPointerCancel);
		};

		const onPointerMove = (e: PointerEvent) => {
			// Check if we need to start dragging
			if (pendingDrag && !dragState) {
				const dx = e.clientX - pendingDrag.startX;
				const dy = e.clientY - pendingDrag.startY;
				const distance = Math.sqrt(dx * dx + dy * dy);

				if (distance >= DRAG_THRESHOLD) {
					startDrag(pendingDrag, e);
				} else {
					return; // Not enough movement yet
				}
			}

			if (!dragState) return;

			const { item, offsetX, offsetY, initialRect, colspan, rowspan } = dragState;

			// Move item with cursor
			const newLeft = e.clientX - offsetX;
			const newTop = e.clientY - offsetY;
			item.style.left = \`\${newLeft}px\`;
			item.style.top = \`\${newTop}px\`;

			// Calculate target based on card center (feels more natural for multi-cell items)
			let cardCenterX = newLeft + initialRect.width / 2;
			let cardCenterY = newTop + initialRect.height / 2;

			// Predictive offset: shift the effective center in the direction of movement
			const gridInfo = core.getGridInfo();
			const cumulativeDx = e.clientX - dragState.dragStartX;
			const cumulativeDy = e.clientY - dragState.dragStartY;

			// Apply prediction offset when movement exceeds threshold
			if (Math.abs(cumulativeDx) > PREDICTION_THRESHOLD) {
				const leadOffset = PREDICTION_LEAD * (gridInfo.cellWidth + gridInfo.gap);
				cardCenterX += Math.sign(cumulativeDx) * leadOffset;
			}
			if (Math.abs(cumulativeDy) > PREDICTION_THRESHOLD) {
				const leadOffset = PREDICTION_LEAD * (gridInfo.cellHeight + gridInfo.gap);
				cardCenterY += Math.sign(cumulativeDy) * leadOffset;
			}

			const rawCell = core.getCellFromPoint(cardCenterX, cardCenterY);
			if (rawCell) {
				// Clamp cell so item fits within grid bounds
				const gridInfo = core.getGridInfo();
				const maxColumn = Math.max(1, gridInfo.columns.length - colspan + 1);
				const maxRow = Math.max(1, gridInfo.rows.length - rowspan + 1);

				const cell: GridCell = {
					column: Math.max(1, Math.min(maxColumn, rawCell.column)),
					row: Math.max(1, Math.min(maxRow, rawCell.row)),
				};

				const now = performance.now();
				const timeSinceLastChange = now - dragState.lastTargetChangeTime;

				// Check if cell actually changed
				const cellChanged =
					cell.column !== dragState.lastCell.column ||
					cell.row !== dragState.lastCell.row;

				if (cellChanged && timeSinceLastChange >= TARGET_CHANGE_DEBOUNCE) {
					const cellWidth = gridInfo.cellWidth + gridInfo.gap;
					const cellHeight = gridInfo.cellHeight + gridInfo.gap;

					// Current cell center in pixels (CSS Grid is 1-indexed)
					const currentCellCenterX =
						gridInfo.rect.left +
						(dragState.lastCell.column - 1) * cellWidth +
						gridInfo.cellWidth / 2;
					const currentCellCenterY =
						gridInfo.rect.top +
						(dragState.lastCell.row - 1) * cellHeight +
						gridInfo.cellHeight / 2;

					// Signed distance from card center to current cell center (in grid units)
					const offsetFromCellX = (cardCenterX - currentCellCenterX) / cellWidth;
					const offsetFromCellY = (cardCenterY - currentCellCenterY) / cellHeight;

					// Direction-aware hysteresis
					const newCellIsRight = cell.column > dragState.lastCell.column;
					const newCellIsBelow = cell.row > dragState.lastCell.row;
					const cardIsRight = offsetFromCellX > 0;
					const cardIsBelow = offsetFromCellY > 0;

					const alignedX = (newCellIsRight && cardIsRight) || (!newCellIsRight && !cardIsRight);
					const alignedY = (newCellIsBelow && cardIsBelow) || (!newCellIsBelow && !cardIsBelow);

					const thresholdX = alignedX ? 0.5 : 0.5 + HYSTERESIS;
					const thresholdY = alignedY ? 0.5 : 0.5 + HYSTERESIS;

					const distX = Math.abs(offsetFromCellX);
					const distY = Math.abs(offsetFromCellY);

					if (distX < thresholdX && distY < thresholdY) {
						return; // Stay in current cell
					}

					dragState.lastCell = cell;
					dragState.lastTargetChangeTime = now;
					core.emit('drag-move', { item, cell, x: e.clientX, y: e.clientY, colspan, rowspan, source: 'pointer' as const });
				}
			}
		};

		const onPointerUp = (e: PointerEvent) => {
			const item = pendingDrag?.item || dragState?.item;
			if (!item) return;

			// If drag never started, this was just a click - nothing more to do
			if (pendingDrag && !dragState) {
				cleanupListeners(item, pendingDrag.pointerId);
				pendingDrag = null;
				return;
			}

			if (!dragState) return;

			const { initialRect, colspan, rowspan, lastCell, offsetX, offsetY, dragStartX, dragStartY } = dragState;

			// Calculate drop position with same predictive offset as drag-move
			const gridInfo = core.getGridInfo();
			const cumulativeDx = e.clientX - dragStartX;
			const cumulativeDy = e.clientY - dragStartY;

			// Apply prediction offset to get effective center for cell calculation
			const newLeft = e.clientX - offsetX;
			const newTop = e.clientY - offsetY;
			let effectiveCenterX = newLeft + initialRect.width / 2;
			let effectiveCenterY = newTop + initialRect.height / 2;

			if (Math.abs(cumulativeDx) > PREDICTION_THRESHOLD) {
				const leadOffset = PREDICTION_LEAD * (gridInfo.cellWidth + gridInfo.gap);
				effectiveCenterX += Math.sign(cumulativeDx) * leadOffset;
			}
			if (Math.abs(cumulativeDy) > PREDICTION_THRESHOLD) {
				const leadOffset = PREDICTION_LEAD * (gridInfo.cellHeight + gridInfo.gap);
				effectiveCenterY += Math.sign(cumulativeDy) * leadOffset;
			}

			const rawCell = core.getCellFromPoint(effectiveCenterX, effectiveCenterY);

			// FLIP: Capture current visual position (First)
			const firstRect = item.getBoundingClientRect();

			// Emit event BEFORE cleanup so algorithm can set final position
			if (rawCell) {
				const maxColumn = Math.max(1, gridInfo.columns.length - colspan + 1);
				const maxRow = Math.max(1, gridInfo.rows.length - rowspan + 1);

				const cell: GridCell = {
					column: Math.max(1, Math.min(maxColumn, rawCell.column)),
					row: Math.max(1, Math.min(maxRow, rawCell.row)),
				};

				core.emit('drag-end', { item, cell, colspan, rowspan, source: 'pointer' as const });
			} else {
				core.emit('drag-end', { item, cell: lastCell, colspan, rowspan, source: 'pointer' as const });
			}

			cleanup();

			// FLIP: Animate from visual position to final grid position
			requestAnimationFrame(() => {
				animateFLIPWithTracking(item, firstRect);
			});
		};

		const onPointerCancel = () => {
			const item = pendingDrag?.item || dragState?.item;
			if (!item) return;

			if (dragState) {
				core.emit('drag-cancel', { item, source: 'pointer' as const });
			}
			cleanup();
		};

		const cleanupListeners = (item: HTMLElement, pointerId: number) => {
			item.releasePointerCapture(pointerId);
			item.removeEventListener('pointermove', onPointerMove);
			item.removeEventListener('pointerup', onPointerUp);
			item.removeEventListener('pointercancel', onPointerCancel);
		};

		const cleanup = () => {
			if (dragState) {
				const { item, pointerId } = dragState;

				item.removeAttribute('data-egg-dragging');
				document.body.classList.remove('is-dragging');
				item.style.position = '';
				item.style.left = '';
				item.style.top = '';
				item.style.width = '';
				item.style.height = '';
				item.style.zIndex = '';

				cleanupListeners(item, pointerId);
				dragState = null;
			}

			if (pendingDrag) {
				cleanupListeners(pendingDrag.item, pendingDrag.pointerId);
				pendingDrag = null;
			}
		};

		// Deselect when clicking outside the grid
		const onDocumentPointerDown = (e: PointerEvent) => {
			if (core.element.contains(e.target as Node)) return;
			if (dragState) return;
			core.deselect();
		};

		core.element.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('pointerdown', onDocumentPointerDown);

		return () => {
			core.element.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('pointerdown', onDocumentPointerDown);
			cleanup();
		};
	},
});
`,
	"plugins/resize.ts": `/**
 * Resize plugin for EG Grid
 *
 * Pure input plugin — detects resize gestures on grid item corners/edges
 * and emits resize-start/move/end/cancel events. Does NOT persist layout.
 * A behavior plugin (e.g., Algorithm) listens for resize-end and handles persistence.
 *
 * Usage:
 *   import { attachResize } from 'eg-grid/resize';
 *
 *   const detach = attachResize(gridElement, {
 *     core,                 // EggCore instance (required)
 *     handles: 'corners',   // 'corners' | 'edges' | 'all'
 *     handleSize: 12,
 *     minSize: { colspan: 1, rowspan: 1 },
 *     maxSize: { colspan: 6, rowspan: 6 },
 *   });
 */

import { getItemSize, registerPlugin } from '../engine';
import type {
	GridCell,
	EggCore,
	ResizeCancelDetail,
	ResizeEndDetail,
	ResizeHandle,
	ResizeMoveDetail,
	ResizePluginOptions,
	ResizeStartDetail,
	ResizeState,
} from '../types';


export interface ResizeOptions {
	/** EggCore instance (required) */
	core: EggCore;
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

const CURSOR: Record<string, string> = {
	nw: 'nwse-resize', se: 'nwse-resize',
	ne: 'nesw-resize', sw: 'nesw-resize',
	n: 'ns-resize', s: 'ns-resize',
	e: 'ew-resize', w: 'ew-resize',
};

/**
 * Create a size label element
 */
function createSizeLabel(): HTMLElement {
	const label = document.createElement('div');
	label.className = 'egg-resize-label';
	label.style.cssText = \`
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
	\`;
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
): { destroy(): void } {
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
			new CustomEvent(\`egg:\${event}\`, {
				bubbles: true,
				detail,
			}),
		);
	}

	function startResize(item: HTMLElement, handle: ResizeHandle, e: PointerEvent) {
		const { colspan, rowspan } = getItemSize(item);

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
			sizeLabel.textContent = \`\${colspan}×\${rowspan}\`;
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
		};

		item.setAttribute('data-egg-resizing', '');
		item.setAttribute('data-egg-handle-active', handle);
		item.removeAttribute('data-egg-handle-hover'); // Clear hover state
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

		// Switch to fixed positioning - item follows cursor in viewport coordinates
		// CSS Grid ignores fixed positioned children, allowing the grid to reflow
		item.style.position = 'fixed';
		item.style.left = \`\${initialRect.left}px\`;
		item.style.top = \`\${initialRect.top}px\`;
		item.style.width = \`\${initialRect.width}px\`;
		item.style.height = \`\${initialRect.height}px\`;
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
		item.style.left = \`\${newLeft}px\`;
		item.style.top = \`\${newTop}px\`;
		item.style.width = \`\${newWidth}px\`;
		item.style.height = \`\${newHeight}px\`;

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
			sizeLabel.textContent = \`\${projectedColspan}×\${projectedRowspan}\`;
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

	function resetItem(item: HTMLElement, pointerId: number, sizeLabel: HTMLElement | null) {
		cleanupResizeListeners(item, pointerId);
		if (sizeLabel) sizeLabel.remove();
		item.style.position = '';
		item.style.left = '';
		item.style.top = '';
		item.style.width = '';
		item.style.height = '';
		item.style.zIndex = '';
		const itemId = item.style.getPropertyValue('--item-id') || item.id || item.dataset.id;
		item.style.viewTransitionName = itemId || '';
		item.removeAttribute('data-egg-resizing');
		item.removeAttribute('data-egg-handle-active');
	}

	function finishResize() {
		if (!activeResize) return;
		const { item, pointerId, currentSize, currentCell, sizeLabel } = activeResize;
		item.setAttribute('data-egg-colspan', String(currentSize.colspan));
		item.setAttribute('data-egg-rowspan', String(currentSize.rowspan));
		emit<ResizeEndDetail>('resize-end', {
			item, cell: currentCell,
			colspan: currentSize.colspan, rowspan: currentSize.rowspan,
			source: 'pointer',
		});
		resetItem(item, pointerId, sizeLabel);
		activeResize = null;
	}

	function cancelResize() {
		if (!activeResize) return;
		const { item, pointerId, sizeLabel } = activeResize;
		emit<ResizeCancelDetail>('resize-cancel', { item, source: 'pointer' });
		resetItem(item, pointerId, sizeLabel);
		activeResize = null;
	}

	// --- Event handlers ---

	// Use capture phase to intercept before pointer plugin
	const onPointerDown = (e: PointerEvent) => {
		const item = (e.target as HTMLElement).closest(
			'[data-egg-item]',
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
			'[data-egg-item]',
		) as HTMLElement | null;

		if (item) {
			const handle = detectHandle(e, item, handleSize, handles);

			if (handle !== hoveredHandle || item !== hoveredItem) {
				// Clear previous item's hover state
				if (hoveredItem && hoveredItem !== item) {
					hoveredItem.style.cursor = '';
					hoveredItem.removeAttribute('data-egg-handle-hover');
				}

				// Clear hover attribute if handle changed on same item
				if (hoveredItem === item && hoveredHandle && !handle) {
					item.removeAttribute('data-egg-handle-hover');
				}

				hoveredItem = item;
				hoveredHandle = handle;

				// Set cursor and hover attribute based on handle
				item.style.cursor = (handle ? CURSOR[handle] : '') || '';
				if (handle) {
					item.setAttribute('data-egg-handle-hover', handle);
				} else {
					item.removeAttribute('data-egg-handle-hover');
				}
			}
		} else if (hoveredItem) {
			hoveredItem.style.cursor = '';
			hoveredItem.removeAttribute('data-egg-handle-hover');
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

	return { destroy };
}

// Register as a plugin for auto-initialization via init()
registerPlugin({
	name: 'resize',
	init(core, options?: ResizePluginOptions & { core?: EggCore }) {
		const instance = attachResize(core.element, {
			...options,
			core: options?.core ?? core,
		});
		return () => instance.destroy();
	},
});

export type { ResizeHandle };
`,
	"plugins/responsive.ts": `/**
 * Responsive Plugin
 *
 * Handles responsive column detection and CSS injection for different breakpoints.
 *
 * Responsibilities:
 * - Detect column count changes via ResizeObserver
 * - Inject CSS for all breakpoints using container queries
 * - Register 'columnCount' provider for other plugins
 * - Emit 'egg:column-count-change' events
 * - Regenerate CSS when layout model changes
 *
 * CSS is injected once on init and regenerated when the layout model changes.
 * The actual responsive layout switching is handled by CSS container queries.
 */

import { registerPlugin } from '../engine';
import type {
	ColumnCountChangeDetail,
	EggCore,
	ResponsiveLayoutModel,
	ResponsivePluginOptions,
	StyleManager,
} from '../types';

/**
 * Responsive state exposed via provider registry
 */
export interface ResponsiveState {
	columnCount: number;
	maxColumns: number;
	minColumns: number;
	hasOverride: boolean;
}

/**
 * Attach the responsive plugin to a grid element.
 *
 * @param gridElement - The grid container element
 * @param options - Configuration options including layout model and style element
 * @param core - Optional EggCore for provider registration
 * @returns Cleanup function to detach the plugin
 */
export function attachResponsive(
	gridElement: HTMLElement,
	options: ResponsivePluginOptions,
	core?: EggCore,
): () => void {
	const { layoutModel } = options;
	const styles: StyleManager | null = core?.styles ?? null;

	// Infer cell size and gap from CSS if not provided
	let cellSize = options.cellSize;
	let gap = options.gap;

	function inferGridMetrics(): void {
		if (cellSize !== undefined && gap !== undefined) return;

		const style = getComputedStyle(gridElement);

		if (gap === undefined) {
			gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 16;
		}

		if (cellSize === undefined) {
			// Try to infer from grid-auto-rows or first track
			const autoRows = parseFloat(style.gridAutoRows) || 0;
			if (autoRows > 0) {
				cellSize = autoRows;
			} else {
				// Fall back to first column track width
				const columns = style.gridTemplateColumns.split(' ');
				cellSize = parseFloat(columns[0] ?? '184') || 184;
			}
		}

	}

	/**
	 * Detect current column count from computed grid style
	 */
	function detectColumnCount(): number {
		const style = getComputedStyle(gridElement);
		const columns = style.gridTemplateColumns.split(' ').filter(Boolean);
		return Math.max(1, columns.length);
	}

	/**
	 * Inject CSS for all breakpoints
	 */
	function injectCSS(): void {
		if (!styles) return;

		inferGridMetrics();

		// Use the grid element's class or ID as the selector
		const gridSelector = gridElement.id
			? \`#\${gridElement.id}\`
			: gridElement.className
				? \`.\${gridElement.className.split(' ')[0]}\`
				: '.grid';

		const css = layoutModel.generateAllBreakpointCSS({
			cellSize: cellSize!,
			gap: gap!,
			gridSelector,
		});

		styles.set('base', css);
		styles.commit();
	}

	// Register provider if core is provided
	if (core) {
		core.providers.register<ResponsiveState>('responsive', () => ({
			columnCount: layoutModel.currentColumnCount,
			maxColumns: layoutModel.maxColumns,
			minColumns: layoutModel.minColumns,
			hasOverride: layoutModel.hasOverride(layoutModel.currentColumnCount),
		}));
	}

	// Track if server-rendered CSS was detected
	// When true, we only inject CSS for explicit user overrides, not derived layouts
	const hasServerRenderedCSS = !!(styles?.get('base')?.trim());

	// Only inject CSS if base layer is empty (not server-rendered)
	// This prevents flash when server has already provided initial CSS
	if (!hasServerRenderedCSS) {
		injectCSS();
	}

	// Subscribe to layout model changes
	// The subscription only fires on user actions (saveLayout/clearOverride),
	// so we always inject CSS here - the initial hasServerRenderedCSS check
	// prevents injection on page load, this handles user interactions.
	const unsubscribe = layoutModel.subscribe(() => injectCSS());

	// Watch for resize to update column count tracking
	let lastColumnCount = layoutModel.currentColumnCount;

	const resizeObserver = new ResizeObserver(() => {
		const newColumnCount = detectColumnCount();

		if (newColumnCount !== lastColumnCount) {
			const previousCount = lastColumnCount;
			lastColumnCount = newColumnCount;

			// Update layout model
			layoutModel.setCurrentColumnCount(newColumnCount);

			gridElement.dispatchEvent(
				new CustomEvent('egg:column-count-change', {
					bubbles: true,
					detail: { previousCount, currentCount: newColumnCount },
				}),
			);
		}
	});

	resizeObserver.observe(gridElement);

	// Cleanup function
	return () => {
		resizeObserver.disconnect();
		unsubscribe();
	};
}

// Register as a plugin for auto-initialization via init()
registerPlugin({
	name: 'responsive',
	init(
		core,
		options?: ResponsivePluginOptions & {
			core?: EggCore;
			layoutModel?: ResponsiveLayoutModel;
		},
	) {
		// Responsive requires layoutModel
		if (!options?.layoutModel) {
			// Skip silently - responsive is optional and requires layoutModel
			return;
		}

		return attachResponsive(
			core.element,
			{
				layoutModel: options.layoutModel,
				cellSize: options.cellSize,
				gap: options.gap,
			},
			options.core ?? core,
		);
	},
});
`,
	"utils/flip.ts": `/**
 * FLIP Animation Utility
 *
 * Provides shared FLIP (First, Last, Invert, Play) animation utilities
 * used by pointer and resize plugins for smooth position/scale transitions.
 */

export interface FLIPOptions {
	duration?: number;
	easing?: string;
	onStart?: () => void;
	onFinish?: () => void;
}

/**
 * Animate an element from its previous position/size to its new position/size using FLIP.
 *
 * @param element - The element to animate
 * @param firstRect - The element's bounding rect before the DOM change (the "First" in FLIP)
 * @param options - Animation options
 * @returns The Animation object, or null if no animation was needed
 *
 * @example
 * \`\`\`ts
 * // Capture position before DOM change
 * const firstRect = element.getBoundingClientRect();
 *
 * // Make DOM changes (e.g., update grid position)
 * element.style.gridColumn = '2 / span 2';
 *
 * // Animate from old position to new
 * requestAnimationFrame(() => {
 *   animateFLIP(element, firstRect);
 * });
 * \`\`\`
 */
export function animateFLIP(
	element: HTMLElement,
	firstRect: DOMRect,
	options: FLIPOptions = {},
): Animation | null {
	const {
		duration = 200,
		easing = 'cubic-bezier(0.2, 0, 0, 1)',
		onStart,
		onFinish,
	} = options;

	const lastRect = element.getBoundingClientRect();
	const deltaX = firstRect.left - lastRect.left;
	const deltaY = firstRect.top - lastRect.top;

	if (Math.abs(deltaX) <= 1 && Math.abs(deltaY) <= 1) {
		onFinish?.();
		return null;
	}

	onStart?.();

	const keyframes: Keyframe[] = [
		{ transform: \`translate(\${deltaX}px, \${deltaY}px)\` },
		{ transform: 'translate(0, 0)' },
	];

	// Play the animation
	const animation = element.animate(keyframes, {
		duration,
		easing,
	});

	animation.onfinish = () => onFinish?.();

	return animation;
}

/**
 * Get the item's view transition name from various sources.
 * Checks --item-id CSS property, id attribute, and data-id attribute.
 */
export function getItemViewTransitionName(element: HTMLElement): string | null {
	return (
		element.style.getPropertyValue('--item-id') ||
		element.id ||
		element.dataset.id ||
		null
	);
}

/**
 * FLIP animation with View Transition exclusion and data attribute tracking.
 */
export function animateFLIPWithTracking(
	element: HTMLElement,
	firstRect: DOMRect,
	options: FLIPOptions & { attributeName?: string } = {},
): Animation | null {
	const { attributeName = 'data-egg-dropping', ...flipOptions } = options;

	// Exclude from View Transitions
	element.style.viewTransitionName = 'none';

	const animation = animateFLIP(element, firstRect, {
		...flipOptions,
		onStart: () => {
			element.setAttribute(attributeName, '');
			flipOptions.onStart?.();
		},
		onFinish: () => {
			element.removeAttribute(attributeName);
			// Restore view transition name
			const itemId = getItemViewTransitionName(element);
			if (itemId) {
				element.style.viewTransitionName = itemId;
			}
			flipOptions.onFinish?.();
		},
	});

	// If no animation was needed, clean up immediately
	if (!animation) {
		const itemId = getItemViewTransitionName(element);
		if (itemId) {
			element.style.viewTransitionName = itemId;
		}
	}

	return animation;
}
`,
	"bundles/index.ts": `// Full bundle - import all plugins to auto-register them
import '../plugins/accessibility';
import '../plugins/keyboard';
import '../plugins/pointer';
import '../plugins/camera';
import '../plugins/resize';
import '../plugins/placeholder';
import '../plugins/algorithm-push';
import '../plugins/algorithm-reorder';
import '../plugins/responsive';

// Core exports
export {
	getItemCell,
	getItemSize,
	getPlugin,
	init,
	listenEvents,
	registerPlugin,
} from '../engine';
export type * from '../types';

// Layout model for responsive support
export { createLayoutModel } from '../layout-model';

// Backward compatibility: export attach functions for manual plugin usage
export { attachCamera, type CameraInstance, type CameraOptions, type CameraState } from '../plugins/camera';
export { attachResize, type ResizeOptions } from '../plugins/resize';
export { attachPlaceholder, type PlaceholderInstance, type PlaceholderOptions } from '../plugins/placeholder';
export { attachPushAlgorithm, calculateLayout, layoutToCSS, readItemsFromDOM, type AttachPushAlgorithmOptions } from '../plugins/algorithm-push';
export { attachReorderAlgorithm, calculateReorderLayout, getItemOrder, reflowItems, type AttachReorderAlgorithmOptions } from '../plugins/algorithm-reorder';
export { attachResponsive, type ResponsiveState } from '../plugins/responsive';

// FLIP utility
export { animateFLIP, animateFLIPWithTracking, getItemViewTransitionName, type FLIPOptions } from '../utils/flip';
`,
	"bundles/minimal.ts": `// Minimal bundle - just pointer plugin
import '../plugins/pointer';

export {
	getItemCell,
	getPlugin,
	init,
	registerPlugin,
} from '../engine';
export type * from '../types';
`,
	"bundles/core.ts": `// Core bundle - no plugins, bring your own
export {
	getItemCell,
	getPlugin,
	init,
	registerPlugin,
} from '../engine';
export type * from '../types';
`,
};
