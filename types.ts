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

// Re-export state machine types for convenience
import type { EggStateMachine, EggState, StateTransition } from './state-machine';
export type { EggStateMachine, EggState, StateTransition };

/**
 * Centralized CSS injection manager.
 *
 * Plugins register named layers (e.g. 'base', 'preview') and the manager
 * concatenates them in registration order into a single <style> element.
 * This ensures correct cascade: base (responsive/container queries) first,
 * preview (algorithm) second -- later rules override same-specificity earlier ones.
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

	// Selection state (backed by state machine)
	selectedItem: HTMLElement | null;
	select(item: HTMLElement | null): void;
	deselect(): void;

	// Centralized state machine for interaction management
	stateMachine: EggStateMachine;

	// Centralized CSS injection
	styles: StyleManager;

	// Direct state (replaces providers)
	/** Whether the camera is actively auto-scrolling (set by camera plugin) */
	cameraScrolling: boolean;
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
 * Options for init()
 */
export interface InitOptions {
	/**
	 * Responsive layout model for multi-breakpoint support.
	 * Passed to responsive and algorithm plugins automatically.
	 */
	layoutModel?: ResponsiveLayoutModel;

	/**
	 * Style element for centralized CSS injection (core.styles).
	 * If not provided, one is created automatically and appended to <head>.
	 */
	styleElement?: HTMLStyleElement;

	/**
	 * Algorithm to use: 'push' (default) or 'reorder'.
	 * Set to false to disable algorithm entirely.
	 */
	algorithm?: 'push' | 'reorder' | false;

	/** Options for the algorithm plugin */
	algorithmOptions?: AlgorithmPushPluginOptions | AlgorithmReorderPluginOptions;

	/** Set to false to disable the resize plugin */
	resize?: ResizePluginOptions | false;

	/** Set to false to disable the camera plugin */
	camera?: CameraPluginOptions | false;

	/** Set to false to disable the placeholder plugin */
	placeholder?: PlaceholderPluginOptions | false;

	/** Responsive plugin options. Omit to disable responsive. */
	responsive?: ResponsivePluginOptions;

	/** Set to false to disable the accessibility plugin */
	accessibility?: false;

	/** Set to false to disable the pointer plugin */
	pointer?: false;

	/** Set to false to disable the keyboard plugin */
	keyboard?: false;
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
	/** CSS selector prefix for item rules (default: '[data-egg-item="') */
	selectorPrefix?: string;
	/** CSS selector suffix for item rules (default: '"]') */
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
