/**
 * Property-based tests for push-down algorithm
 * Run with: npx tsx --test plugins/algorithm-push.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert';

import {
	itemsOverlap,
	findOverlaps,
	pushDown,
	compactUp,
	calculateLayout,
	layoutToCSS,
	type ItemRect,
} from './algorithm-push';

// ============================================================================
// Random generators for property-based testing
// ============================================================================

function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a valid (non-overlapping) grid using a packing algorithm.
 * Places items one at a time, finding a valid position for each.
 */
function randomValidGrid(itemCount: number, gridCols: number): ItemRect[] {
	const items: ItemRect[] = [];

	for (let i = 0; i < itemCount; i++) {
		const width = randomInt(1, Math.min(3, gridCols));
		const height = randomInt(1, 3);

		// Find a valid position for this item
		let placed = false;
		for (let row = 1; row <= 50 && !placed; row++) {
			for (let col = 1; col <= gridCols - width + 1 && !placed; col++) {
				const candidate: ItemRect = {
					id: `item-${i}`,
					column: col,
					row,
					width,
					height,
				};

				const hasCollision = items.some((other) => itemsOverlap(candidate, other));
				if (!hasCollision) {
					items.push(candidate);
					placed = true;
				}
			}
		}

		// Fallback: place at bottom if no space found
		if (!placed) {
			const maxRow = items.length > 0
				? Math.max(...items.map((it) => it.row + it.height))
				: 1;
			items.push({
				id: `item-${i}`,
				column: randomInt(1, gridCols - width + 1),
				row: maxRow,
				width,
				height,
			});
		}
	}

	return items;
}

/**
 * Generate a valid grid with guaranteed large (multi-cell) items
 */
function randomValidLargeItemGrid(itemCount: number, gridCols: number): ItemRect[] {
	const items: ItemRect[] = [];

	for (let i = 0; i < itemCount; i++) {
		const width = randomInt(2, Math.min(4, gridCols));
		const height = randomInt(2, 4);

		// Find a valid position for this item
		let placed = false;
		for (let row = 1; row <= 100 && !placed; row++) {
			for (let col = 1; col <= gridCols - width + 1 && !placed; col++) {
				const candidate: ItemRect = {
					id: `item-${i}`,
					column: col,
					row,
					width,
					height,
				};

				const hasCollision = items.some((other) => itemsOverlap(candidate, other));
				if (!hasCollision) {
					items.push(candidate);
					placed = true;
				}
			}
		}

		// Fallback: place at bottom if no space found
		if (!placed) {
			const maxRow = items.length > 0
				? Math.max(...items.map((it) => it.row + it.height))
				: 1;
			items.push({
				id: `item-${i}`,
				column: randomInt(1, Math.max(1, gridCols - width + 1)),
				row: maxRow,
				width,
				height,
			});
		}
	}

	return items;
}

function formatGrid(items: ItemRect[], gridCols: number): string {
	if (items.length === 0) return '(empty grid)';

	const maxRow = Math.max(...items.map((it) => it.row + it.height - 1));
	const grid: string[][] = [];

	for (let r = 0; r < maxRow; r++) {
		grid.push(Array(gridCols).fill('.'));
	}

	for (const item of items) {
		for (let r = item.row - 1; r < item.row - 1 + item.height; r++) {
			for (let c = item.column - 1; c < item.column - 1 + item.width; c++) {
				if (r < grid.length && c < gridCols) {
					const existing = grid[r][c];
					if (existing !== '.') {
						grid[r][c] = 'X'; // overlap marker
					} else {
						grid[r][c] = item.id.replace('item-', '');
					}
				}
			}
		}
	}

	return grid.map((row, i) => `${(i + 1).toString().padStart(2)}: ${row.join('')}`).join('\n');
}

// ============================================================================
// Unit tests for itemsOverlap
// ============================================================================

test('itemsOverlap: non-overlapping items horizontally', () => {
	const a: ItemRect = { id: 'a', column: 1, row: 1, width: 2, height: 2 };
	const b: ItemRect = { id: 'b', column: 3, row: 1, width: 2, height: 2 };
	assert.strictEqual(itemsOverlap(a, b), false);
});

test('itemsOverlap: non-overlapping items vertically', () => {
	const a: ItemRect = { id: 'a', column: 1, row: 1, width: 2, height: 2 };
	const b: ItemRect = { id: 'b', column: 1, row: 3, width: 2, height: 2 };
	assert.strictEqual(itemsOverlap(a, b), false);
});

test('itemsOverlap: overlapping items', () => {
	const a: ItemRect = { id: 'a', column: 1, row: 1, width: 2, height: 2 };
	const b: ItemRect = { id: 'b', column: 2, row: 2, width: 2, height: 2 };
	assert.strictEqual(itemsOverlap(a, b), true);
});

test('itemsOverlap: adjacent items (touching edges) do not overlap', () => {
	const a: ItemRect = { id: 'a', column: 1, row: 1, width: 2, height: 2 };
	const b: ItemRect = { id: 'b', column: 3, row: 1, width: 1, height: 1 };
	assert.strictEqual(itemsOverlap(a, b), false);
});

test('itemsOverlap: one item contains another', () => {
	const a: ItemRect = { id: 'a', column: 1, row: 1, width: 4, height: 4 };
	const b: ItemRect = { id: 'b', column: 2, row: 2, width: 1, height: 1 };
	assert.strictEqual(itemsOverlap(a, b), true);
});

// ============================================================================
// Unit tests for findOverlaps
// ============================================================================

test('findOverlaps: no overlaps in valid layout', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 2, height: 1 },
		{ id: 'b', column: 3, row: 1, width: 2, height: 1 },
		{ id: 'c', column: 1, row: 2, width: 4, height: 1 },
	];
	const overlaps = findOverlaps(items);
	assert.strictEqual(overlaps.length, 0);
});

test('findOverlaps: detects single overlap', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 2, height: 2 },
		{ id: 'b', column: 2, row: 1, width: 2, height: 2 },
	];
	const overlaps = findOverlaps(items);
	assert.strictEqual(overlaps.length, 1);
});

test('findOverlaps: detects multiple overlaps', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 3, height: 3 },
		{ id: 'b', column: 2, row: 2, width: 1, height: 1 },
		{ id: 'c', column: 2, row: 2, width: 1, height: 1 },
	];
	const overlaps = findOverlaps(items);
	// a overlaps b, a overlaps c, b overlaps c
	assert.strictEqual(overlaps.length, 3);
});

// ============================================================================
// Unit tests for pushDown
// ============================================================================

test('pushDown: pushes single collider down', () => {
	const items: ItemRect[] = [
		{ id: 'moved', column: 1, row: 1, width: 2, height: 2 },
		{ id: 'other', column: 1, row: 2, width: 2, height: 1 },
	];
	const moved = items[0];
	pushDown(items, moved, 'moved');

	assert.strictEqual(items[1].row, 3); // pushed below moved item
});

test('pushDown: cascades to push multiple items', () => {
	const items: ItemRect[] = [
		{ id: 'moved', column: 1, row: 1, width: 2, height: 2 },
		{ id: 'b', column: 1, row: 2, width: 2, height: 2 },
		{ id: 'c', column: 1, row: 3, width: 2, height: 1 },
	];
	const moved = items[0];
	pushDown(items, moved, 'moved');

	assert.strictEqual(items[1].row, 3); // b pushed down
	assert.strictEqual(items[2].row, 5); // c pushed down by b
});

test('pushDown: does not affect non-colliding items', () => {
	const items: ItemRect[] = [
		{ id: 'moved', column: 1, row: 1, width: 2, height: 2 },
		{ id: 'other', column: 4, row: 1, width: 2, height: 2 },
	];
	const moved = items[0];
	pushDown(items, moved, 'moved');

	assert.strictEqual(items[1].row, 1); // unchanged
});

test('pushDown: preserves relative order of stacked items (E above H scenario)', () => {
	// Scenario: F (2x2) is moved to overlap with E (at row 2) and H (at row 3)
	// E should stay above H after being pushed
	const items: ItemRect[] = [
		{ id: 'F', column: 4, row: 2, width: 2, height: 2 }, // moved item
		{ id: 'E', column: 4, row: 2, width: 1, height: 1 }, // above H
		{ id: 'H', column: 4, row: 3, width: 1, height: 1 }, // below E
	];
	const moved = items[0];
	pushDown(items, moved, 'F');

	const E = items.find((it) => it.id === 'E')!;
	const H = items.find((it) => it.id === 'H')!;

	// E should still be above H (lower row number = higher on screen)
	assert.ok(E.row < H.row, `E (row ${E.row}) should be above H (row ${H.row})`);
});

// ============================================================================
// Unit tests for compactUp
// ============================================================================

test('compactUp: moves item up to fill gap', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 2, height: 1 },
		{ id: 'b', column: 1, row: 5, width: 2, height: 1 },
	];
	compactUp(items, 'none');

	assert.strictEqual(items[1].row, 2); // moved up to row 2
});

test('compactUp: respects collisions when compacting', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 2, height: 2 },
		{ id: 'b', column: 1, row: 5, width: 2, height: 1 },
	];
	compactUp(items, 'none');

	assert.strictEqual(items[1].row, 3); // stopped at row 3 (below a)
});

test('compactUp: excludes specified item', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 2, height: 1 },
		{ id: 'excluded', column: 1, row: 5, width: 2, height: 1 },
	];
	const originalRow = items[1].row;
	compactUp(items, 'excluded');

	assert.strictEqual(items[1].row, originalRow); // unchanged
});

// ============================================================================
// Unit tests for calculateLayout
// ============================================================================

test('calculateLayout: moves item and resolves collisions', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 2, height: 2 },
		{ id: 'b', column: 3, row: 1, width: 2, height: 2 },
	];

	// Move 'a' to where 'b' is
	const result = calculateLayout(items, 'a', { column: 3, row: 1 });

	const a = result.find((it) => it.id === 'a')!;
	const b = result.find((it) => it.id === 'b')!;

	assert.strictEqual(a.column, 3);
	assert.strictEqual(a.row, 1);
	assert.strictEqual(b.row, 3); // pushed down
	assert.strictEqual(findOverlaps(result).length, 0);
});

test('calculateLayout: preserves non-colliding items', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 1, height: 1 },
		{ id: 'b', column: 3, row: 1, width: 1, height: 1 },
		{ id: 'c', column: 5, row: 1, width: 1, height: 1 },
	];

	// Move 'a' to column 2 (no collisions)
	const result = calculateLayout(items, 'a', { column: 2, row: 1 });

	const b = result.find((it) => it.id === 'b')!;
	const c = result.find((it) => it.id === 'c')!;

	assert.strictEqual(b.column, 3);
	assert.strictEqual(b.row, 1);
	assert.strictEqual(c.column, 5);
	assert.strictEqual(c.row, 1);
});

// ============================================================================
// Property-based tests: NO OVERLAPS INVARIANT
// ============================================================================

test('PROPERTY: calculateLayout never produces overlaps (small grids)', () => {
	const iterations = 100;
	const gridCols = 4;

	for (let i = 0; i < iterations; i++) {
		const itemCount = randomInt(2, 6);
		const items = randomValidGrid(itemCount, gridCols);
		const movedId = `item-${randomInt(0, itemCount - 1)}`;
		const targetCell = {
			column: randomInt(1, gridCols),
			row: randomInt(1, 10),
		};

		const result = calculateLayout(items, movedId, targetCell);
		const overlaps = findOverlaps(result);

		if (overlaps.length > 0) {
			console.log('\n=== OVERLAP DETECTED ===');
			console.log('Initial items:', JSON.stringify(items, null, 2));
			console.log(`Moved: ${movedId} to`, targetCell);
			console.log('Result:', JSON.stringify(result, null, 2));
			console.log('Grid visualization:');
			console.log(formatGrid(result, gridCols));
			console.log('Overlapping pairs:', overlaps.map(([a, b]) => `${a.id} <-> ${b.id}`));
		}

		assert.strictEqual(
			overlaps.length,
			0,
			`Iteration ${i}: Found ${overlaps.length} overlaps after moving ${movedId}`,
		);
	}
});

test('PROPERTY: calculateLayout never produces overlaps (medium grids)', () => {
	const iterations = 50;
	const gridCols = 6;

	for (let i = 0; i < iterations; i++) {
		const itemCount = randomInt(5, 12);
		const items = randomValidGrid(itemCount, gridCols);
		const movedId = `item-${randomInt(0, itemCount - 1)}`;
		const targetCell = {
			column: randomInt(1, gridCols),
			row: randomInt(1, 15),
		};

		const result = calculateLayout(items, movedId, targetCell);
		const overlaps = findOverlaps(result);

		if (overlaps.length > 0) {
			console.log('\n=== OVERLAP DETECTED ===');
			console.log('Initial items:', JSON.stringify(items, null, 2));
			console.log(`Moved: ${movedId} to`, targetCell);
			console.log('Result:', JSON.stringify(result, null, 2));
			console.log('Grid visualization:');
			console.log(formatGrid(result, gridCols));
			console.log('Overlapping pairs:', overlaps.map(([a, b]) => `${a.id} <-> ${b.id}`));
		}

		assert.strictEqual(
			overlaps.length,
			0,
			`Iteration ${i}: Found ${overlaps.length} overlaps after moving ${movedId}`,
		);
	}
});

test('PROPERTY: calculateLayout never produces overlaps (large grids)', () => {
	const iterations = 20;
	const gridCols = 12;

	for (let i = 0; i < iterations; i++) {
		const itemCount = randomInt(10, 25);
		const items = randomValidGrid(itemCount, gridCols);
		const movedId = `item-${randomInt(0, itemCount - 1)}`;
		const targetCell = {
			column: randomInt(1, gridCols),
			row: randomInt(1, 20),
		};

		const result = calculateLayout(items, movedId, targetCell);
		const overlaps = findOverlaps(result);

		if (overlaps.length > 0) {
			console.log('\n=== OVERLAP DETECTED ===');
			console.log('Initial items:', JSON.stringify(items, null, 2));
			console.log(`Moved: ${movedId} to`, targetCell);
			console.log('Result:', JSON.stringify(result, null, 2));
			console.log('Grid visualization:');
			console.log(formatGrid(result, gridCols));
			console.log('Overlapping pairs:', overlaps.map(([a, b]) => `${a.id} <-> ${b.id}`));
		}

		assert.strictEqual(
			overlaps.length,
			0,
			`Iteration ${i}: Found ${overlaps.length} overlaps after moving ${movedId}`,
		);
	}
});

test('PROPERTY: calculateLayout never produces overlaps (multi-cell items stress test)', () => {
	const iterations = 50;
	const gridCols = 8;

	for (let i = 0; i < iterations; i++) {
		const itemCount = randomInt(4, 10);
		const items = randomValidLargeItemGrid(itemCount, gridCols);

		const movedId = `item-${randomInt(0, itemCount - 1)}`;
		const movedItem = items.find((it) => it.id === movedId)!;
		const targetCell = {
			column: randomInt(1, gridCols - movedItem.width + 1),
			row: randomInt(1, 10),
		};

		const result = calculateLayout(items, movedId, targetCell);
		const overlaps = findOverlaps(result);

		if (overlaps.length > 0) {
			console.log('\n=== OVERLAP DETECTED (large items) ===');
			console.log('Initial items:', JSON.stringify(items, null, 2));
			console.log(`Moved: ${movedId} to`, targetCell);
			console.log('Result:', JSON.stringify(result, null, 2));
			console.log('Grid visualization:');
			console.log(formatGrid(result, gridCols));
			console.log('Overlapping pairs:', overlaps.map(([a, b]) => `${a.id} <-> ${b.id}`));
		}

		assert.strictEqual(
			overlaps.length,
			0,
			`Iteration ${i}: Found ${overlaps.length} overlaps with large items`,
		);
	}
});

test('PROPERTY: multiple sequential moves never produce overlaps', () => {
	const iterations = 30;
	const gridCols = 6;

	for (let i = 0; i < iterations; i++) {
		const itemCount = randomInt(4, 8);
		let items = randomValidGrid(itemCount, gridCols);

		// Perform multiple sequential moves
		const moveCount = randomInt(3, 8);
		for (let m = 0; m < moveCount; m++) {
			const movedId = `item-${randomInt(0, itemCount - 1)}`;
			const targetCell = {
				column: randomInt(1, gridCols),
				row: randomInt(1, 12),
			};

			items = calculateLayout(items, movedId, targetCell);
			const overlaps = findOverlaps(items);

			if (overlaps.length > 0) {
				console.log('\n=== OVERLAP DETECTED (sequential moves) ===');
				console.log(`Iteration ${i}, move ${m + 1}/${moveCount}`);
				console.log(`Moved: ${movedId} to`, targetCell);
				console.log('Result:', JSON.stringify(items, null, 2));
				console.log('Grid visualization:');
				console.log(formatGrid(items, gridCols));
				console.log('Overlapping pairs:', overlaps.map(([a, b]) => `${a.id} <-> ${b.id}`));
			}

			assert.strictEqual(
				overlaps.length,
				0,
				`Iteration ${i}, move ${m}: Found ${overlaps.length} overlaps`,
			);
		}
	}
});

// ============================================================================
// Edge case tests
// ============================================================================

test('EDGE: moving item to same position', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 2, height: 2 },
		{ id: 'b', column: 3, row: 1, width: 2, height: 2 },
	];

	const result = calculateLayout(items, 'a', { column: 1, row: 1 });
	const overlaps = findOverlaps(result);

	assert.strictEqual(overlaps.length, 0);
	assert.strictEqual(result.find((it) => it.id === 'a')!.column, 1);
	assert.strictEqual(result.find((it) => it.id === 'a')!.row, 1);
});

test('EDGE: moving item to row 1', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 3, width: 2, height: 2 },
		{ id: 'b', column: 1, row: 1, width: 2, height: 2 },
	];

	const result = calculateLayout(items, 'a', { column: 1, row: 1 });
	const overlaps = findOverlaps(result);

	assert.strictEqual(overlaps.length, 0);
});

test('EDGE: single item grid', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 2, height: 2 },
	];

	const result = calculateLayout(items, 'a', { column: 3, row: 5 });

	assert.strictEqual(result[0].column, 3);
	assert.strictEqual(result[0].row, 5);
});

test('EDGE: all items stacked vertically', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 4, height: 1 },
		{ id: 'b', column: 1, row: 2, width: 4, height: 1 },
		{ id: 'c', column: 1, row: 3, width: 4, height: 1 },
		{ id: 'd', column: 1, row: 4, width: 4, height: 1 },
	];

	// Move bottom item to top
	const result = calculateLayout(items, 'd', { column: 1, row: 1 });
	const overlaps = findOverlaps(result);

	assert.strictEqual(overlaps.length, 0);
});

test('EDGE: very wide item', () => {
	const items: ItemRect[] = [
		{ id: 'wide', column: 1, row: 1, width: 10, height: 1 },
		{ id: 'small', column: 5, row: 2, width: 1, height: 1 },
	];

	const result = calculateLayout(items, 'wide', { column: 1, row: 2 });
	const overlaps = findOverlaps(result);

	assert.strictEqual(overlaps.length, 0);
});

test('EDGE: very tall item', () => {
	const items: ItemRect[] = [
		{ id: 'tall', column: 1, row: 1, width: 1, height: 10 },
		{ id: 'small', column: 1, row: 5, width: 2, height: 1 },
	];

	const result = calculateLayout(items, 'tall', { column: 1, row: 1 });
	const overlaps = findOverlaps(result);

	assert.strictEqual(overlaps.length, 0);
});

test('EDGE: nonexistent movedId returns unchanged items', () => {
	const items: ItemRect[] = [
		{ id: 'a', column: 1, row: 1, width: 2, height: 2 },
	];

	const result = calculateLayout(items, 'nonexistent', { column: 5, row: 5 });

	assert.strictEqual(result[0].column, 1);
	assert.strictEqual(result[0].row, 1);
});

// ============================================================================
// Unit tests for layoutToCSS
// ============================================================================

test('layoutToCSS: generates correct CSS rules', () => {
	const items: ItemRect[] = [
		{ id: 'item-1', column: 1, row: 1, width: 2, height: 2 },
		{ id: 'item-2', column: 3, row: 1, width: 1, height: 1 },
	];

	const css = layoutToCSS(items);

	assert.ok(css.includes('#item-1 { grid-column: 1 / span 2; grid-row: 1 / span 2; }'));
	assert.ok(css.includes('#item-2 { grid-column: 3 / span 1; grid-row: 1 / span 1; }'));
});

test('layoutToCSS: supports custom selector prefix', () => {
	const items: ItemRect[] = [
		{ id: 'item-1', column: 1, row: 1, width: 1, height: 1 },
	];

	const css = layoutToCSS(items, { selectorPrefix: '.' });

	assert.ok(css.includes('.item-1 { grid-column: 1 / span 1; grid-row: 1 / span 1; }'));
});

test('layoutToCSS: supports attribute selectors', () => {
	const items: ItemRect[] = [
		{ id: 'item-1', column: 1, row: 1, width: 1, height: 1 },
	];

	const css = layoutToCSS(items, {
		selectorPrefix: '[data-id="',
		selectorSuffix: '"]'
	});

	assert.ok(css.includes('[data-id="item-1"] { grid-column: 1 / span 1; grid-row: 1 / span 1; }'));
});

test('layoutToCSS: supports exclude selector', () => {
	const items: ItemRect[] = [
		{ id: 'item-1', column: 1, row: 1, width: 1, height: 1 },
	];

	const css = layoutToCSS(items, { excludeSelector: ':not(.dragging)' });

	assert.ok(css.includes('#item-1:not(.dragging) { grid-column: 1 / span 1; grid-row: 1 / span 1; }'));
});

test('layoutToCSS: clamps width with maxColumns', () => {
	const items: ItemRect[] = [
		{ id: 'wide', column: 1, row: 1, width: 10, height: 1 },
	];

	const css = layoutToCSS(items, { maxColumns: 4 });

	assert.ok(css.includes('#wide { grid-column: 1 / span 4; grid-row: 1 / span 1; }'));
});

test('layoutToCSS: handles empty items array', () => {
	const css = layoutToCSS([]);

	assert.strictEqual(css, '');
});
