export interface GridCell {
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
}

export interface ResizeEndDetail {
	item: HTMLElement;
	/** Final cell position */
	cell: GridCell;
	/** Final colspan */
	colspan: number;
	/** Final rowspan */
	rowspan: number;
}

export interface ResizeCancelDetail {
	item: HTMLElement;
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
import type { GridiotStateMachine, GridiotState, StateTransition } from './state-machine';
export type { GridiotStateMachine, GridiotState, StateTransition };

export interface GridiotCore {
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
	stateMachine: GridiotStateMachine;
}

export interface Plugin<T = unknown> {
	name: string;
	init(core: GridiotCore, options?: T): (() => void) | void;
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
	styleElement?: HTMLStyleElement;
	selectorPrefix?: string;
	selectorSuffix?: string;
	compaction?: boolean;
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
	 * Style element for CSS injection.
	 * Passed to responsive and algorithm-push plugins automatically.
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
	/** Style element for CSS injection */
	styleElement: HTMLStyleElement;
	/** Cell size in pixels (for breakpoint calculation, or infer from CSS) */
	cellSize?: number;
	/** Gap size in pixels (for breakpoint calculation, or infer from CSS) */
	gap?: number;
}

// Custom event types for type-safe event listeners
declare global {
	interface HTMLElementEventMap {
		'gridiot:drag-start': CustomEvent<DragStartDetail>;
		'gridiot:drag-move': CustomEvent<DragMoveDetail>;
		'gridiot:drag-end': CustomEvent<DragEndDetail>;
		'gridiot:drag-cancel': CustomEvent<DragCancelDetail>;
		'gridiot:select': CustomEvent<SelectDetail>;
		'gridiot:deselect': CustomEvent<DeselectDetail>;
		'gridiot:column-count-change': CustomEvent<ColumnCountChangeDetail>;
		'gridiot:resize-start': CustomEvent<ResizeStartDetail>;
		'gridiot:resize-move': CustomEvent<ResizeMoveDetail>;
		'gridiot:resize-end': CustomEvent<ResizeEndDetail>;
		'gridiot:resize-cancel': CustomEvent<ResizeCancelDetail>;
	}
}
