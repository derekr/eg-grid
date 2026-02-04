/**
 * Pure push-down layout algorithm - no DOM dependencies
 * This module contains the core layout logic that can be tested independently.
 */

export interface GridCell {
	column: number;
	row: number;
}

export interface ItemRect {
	id: string;
	column: number;
	row: number;
	width: number;
	height: number;
}

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

/**
 * Options for CSS generation
 */
export interface LayoutToCSSOptions {
	/**
	 * CSS selector prefix for items (default: '#')
	 * Use '#' for id selectors, '.' for class selectors, or '[data-id="' for attribute selectors
	 */
	selectorPrefix?: string;
	/**
	 * CSS selector suffix for items (default: '')
	 * Use ']' to close attribute selectors
	 */
	selectorSuffix?: string;
	/**
	 * Additional selector to exclude (e.g., ':not(.dragging)')
	 */
	excludeSelector?: string;
	/**
	 * Maximum column count for width clamping (optional)
	 */
	maxColumns?: number;
}

/**
 * Convert layout to CSS rules for injection into a <style> tag.
 * This enables the "CSS-driven layout" pattern where:
 * 1. Algorithm returns pure ItemRect[] data
 * 2. Caller converts to CSS string
 * 3. CSS injected into <style> tag
 * 4. View Transitions animate the change
 *
 * @param items - The layout items with positions
 * @param options - CSS generation options
 * @returns CSS rules string ready for injection
 *
 * @example
 * // Basic usage with id selectors
 * const css = layoutToCSS(items);
 * styleElement.textContent = css;
 *
 * @example
 * // During drag, exclude the dragging item
 * const css = layoutToCSS(items, { excludeSelector: ':not(.dragging)' });
 *
 * @example
 * // With data-id attribute selectors
 * const css = layoutToCSS(items, {
 *   selectorPrefix: '[data-id="',
 *   selectorSuffix: '"]'
 * });
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
		// Clamp column so item fits within maxColumns (prevents implicit column creation)
		const column = maxColumns ? Math.max(1, Math.min(item.column, maxColumns - width + 1)) : item.column;
		const selector = `${selectorPrefix}${item.id}${selectorSuffix}${excludeSelector}`;
		const gridColumn = `${column} / span ${width}`;
		const gridRow = `${item.row} / span ${item.height}`;

		rules.push(`${selector} { grid-column: ${gridColumn}; grid-row: ${gridRow}; }`);
	}

	return rules.join('\n');
}
