/**
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

import type {
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

