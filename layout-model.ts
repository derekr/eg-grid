/**
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
				console.warn(`[layout-model] updateItemSize: item "${itemId}" not found in items Map. Available IDs:`, Array.from(items.keys()));
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
					`${selectorPrefix}${id}${selectorSuffix} { grid-column: ${pos.column} / span ${itemDef.width}; grid-row: ${pos.row} / span ${itemDef.height}; }`,
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
					containerQuery = `@container (min-width: ${minWidth}px)`;
				} else if (cols === minColumns) {
					// Smallest size is the default/fallback
					const maxWidth = getBreakpointWidth(cols + 1, cellSize, gap) - 1;
					containerQuery = `@container (max-width: ${maxWidth}px)`;
				} else {
					const maxWidth = getBreakpointWidth(cols + 1, cellSize, gap) - 1;
					containerQuery = `@container (min-width: ${minWidth}px) and (max-width: ${maxWidth}px)`;
				}

				// Build rules for this column count
				const itemRules: string[] = [];

				// Grid template
				itemRules.push(
					`${gridSelector} { grid-template-columns: repeat(${cols}, 1fr); }`,
				);

				// Item positions
				for (const [id, pos] of positions) {
					const itemDef = items.get(id);
					if (!itemDef) continue;

					// Clamp width to current column count
					const w = Math.min(itemDef.width, cols);
					itemRules.push(
						`${selectorPrefix}${id}${selectorSuffix} { grid-column: ${pos.column} / span ${w}; grid-row: ${pos.row} / span ${itemDef.height}; }`,
					);
				}

				// Add comment and rules
				const layoutType =
					cols === maxColumns
						? '(canonical)'
						: hasOverride
							? '(override)'
							: '(derived)';
				cssRules.push(`/* ${cols} columns ${layoutType} */`);
				cssRules.push(`${containerQuery} {`);
				cssRules.push(itemRules.map((r) => '  ' + r).join('\n'));
				cssRules.push('}');
				cssRules.push('');
			}

			return cssRules.join('\n');
		},

		subscribe(callback: () => void): () => void {
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
	};

	return model;
}

/**
 * Build LayoutItem array from positions and definitions
 * Useful for algorithm plugins that need the full item data
 */
export function buildLayoutItems(
	itemDefs: ReadonlyMap<string, ItemDefinition>,
	positions: Map<string, ItemPosition>,
	columnCount: number,
): LayoutItem[] {
	const result: LayoutItem[] = [];

	for (const [id, def] of Array.from(itemDefs)) {
		const pos = positions.get(id);
		if (pos) {
			result.push({
				id: def.id,
				// Clamp width to current column count
				width: Math.min(def.width, columnCount),
				height: def.height,
				column: pos.column,
				row: pos.row,
			});
		}
	}

	return result;
}

/**
 * Convert LayoutItem array back to positions map
 */
export function layoutItemsToPositions(
	items: LayoutItem[],
): Map<string, ItemPosition> {
	const positions = new Map<string, ItemPosition>();
	for (const item of items) {
		positions.set(item.id, { column: item.column, row: item.row });
	}
	return positions;
}
