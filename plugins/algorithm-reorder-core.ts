/**
 * Pure reorder layout algorithm - no DOM dependencies
 *
 * Unlike push-down, reorder treats items as a logical sequence (reading order).
 * Dragging changes an item's position in that sequence. All items then reflow
 * into the grid like CSS Grid auto-placement: scan left-to-right, top-to-bottom,
 * place each item at the first position that fits.
 */

import type { GridCell, ItemRect, LayoutToCSSOptions } from './algorithm-push-core';
export { layoutToCSS, type GridCell, type ItemRect, type LayoutToCSSOptions } from './algorithm-push-core';

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
	// Check bounds
	if (column + width - 1 > columns) return false;

	for (let r = row; r < row + height; r++) {
		for (let c = column; c < column + width; c++) {
			if (occupied.has(`${c},${r}`)) return false;
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
			occupied.add(`${c},${r}`);
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
