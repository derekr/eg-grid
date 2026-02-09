import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:8888';

interface GridPosition {
	column: number;
	row: number;
}

/**
 * Get the grid position of an element from its computed style
 */
async function getGridPosition(page: Page, selector: string): Promise<GridPosition> {
	return page.evaluate((sel) => {
		const el = document.querySelector(sel) as HTMLElement;
		if (!el) throw new Error(`Element not found: ${sel}`);
		const style = getComputedStyle(el);
		return {
			column: parseInt(style.gridColumnStart, 10) || 1,
			row: parseInt(style.gridRowStart, 10) || 1,
		};
	}, selector);
}

/**
 * Get placeholder position (if visible)
 */
async function getPlaceholderPosition(page: Page): Promise<GridPosition | null> {
	return page.evaluate(() => {
		const placeholder = document.querySelector('.drop-placeholder') as HTMLElement;
		if (!placeholder || !placeholder.parentElement) return null;
		const style = getComputedStyle(placeholder);
		// Check if it has grid positioning
		const col = parseInt(style.gridColumnStart, 10);
		const row = parseInt(style.gridRowStart, 10);
		if (isNaN(col) || isNaN(row)) return null;
		return { column: col, row: row };
	});
}

/**
 * Get bounding rect of an element
 */
async function getElementRect(page: Page, selector: string) {
	const el = page.locator(selector);
	return el.boundingBox();
}

/**
 * Perform a drag operation and capture placeholder positions during drag
 */
async function dragAndCapture(
	page: Page,
	itemSelector: string,
	deltaX: number,
	deltaY: number,
	steps: number = 10
): Promise<{ placeholderPositions: (GridPosition | null)[], finalDropPosition: GridPosition }> {
	const item = page.locator(itemSelector);
	const box = await item.boundingBox();
	if (!box) throw new Error(`Element not found: ${itemSelector}`);

	const startX = box.x + box.width / 2;
	const startY = box.y + box.height / 2;
	const endX = startX + deltaX;
	const endY = startY + deltaY;

	const placeholderPositions: (GridPosition | null)[] = [];

	// Start drag
	await page.mouse.move(startX, startY);
	await page.mouse.down();

	// Move in steps, capturing placeholder position at each step
	for (let i = 1; i <= steps; i++) {
		const x = startX + (deltaX * i) / steps;
		const y = startY + (deltaY * i) / steps;
		await page.mouse.move(x, y);
		await page.waitForTimeout(20); // Small delay to let events process
		const pos = await getPlaceholderPosition(page);
		placeholderPositions.push(pos);
	}

	// Get item ID to check final position
	const itemId = await item.getAttribute('id');

	// Release
	await page.mouse.up();
	await page.waitForTimeout(300); // Wait for animations

	// Get final position
	const finalDropPosition = await getGridPosition(page, `#${itemId}`);

	return { placeholderPositions, finalDropPosition };
}

test.describe('EG Grid Drag Placeholder', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE_URL}/example-advanced.html`);
		await page.waitForSelector('.grid');
	});

	test('placeholder matches drop location for rightward drag', async ({ page }) => {
		// Drag item E (1x1 at col 4, row 2) to the right
		const result = await dragAndCapture(page, '#item-5', 200, 0);

		// The last placeholder position before drop should match final drop position
		const lastPlaceholder = result.placeholderPositions.filter(p => p !== null).pop();

		console.log('Rightward drag:');
		console.log('  Last placeholder:', lastPlaceholder);
		console.log('  Final drop:', result.finalDropPosition);

		// They should match (or be very close)
		if (lastPlaceholder) {
			expect(lastPlaceholder.column).toBe(result.finalDropPosition.column);
			expect(lastPlaceholder.row).toBe(result.finalDropPosition.row);
		}
	});

	test('placeholder matches drop location for leftward drag', async ({ page }) => {
		// Drag item E (1x1 at col 4, row 2) to the left
		const result = await dragAndCapture(page, '#item-5', -200, 0);

		const lastPlaceholder = result.placeholderPositions.filter(p => p !== null).pop();

		console.log('Leftward drag:');
		console.log('  Last placeholder:', lastPlaceholder);
		console.log('  Final drop:', result.finalDropPosition);

		if (lastPlaceholder) {
			expect(lastPlaceholder.column).toBe(result.finalDropPosition.column);
			expect(lastPlaceholder.row).toBe(result.finalDropPosition.row);
		}
	});

	test('placeholder matches drop location for downward drag', async ({ page }) => {
		// Drag item E (1x1 at col 4, row 2) down
		const result = await dragAndCapture(page, '#item-5', 0, 200);

		const lastPlaceholder = result.placeholderPositions.filter(p => p !== null).pop();

		console.log('Downward drag:');
		console.log('  Last placeholder:', lastPlaceholder);
		console.log('  Final drop:', result.finalDropPosition);

		if (lastPlaceholder) {
			expect(lastPlaceholder.column).toBe(result.finalDropPosition.column);
			expect(lastPlaceholder.row).toBe(result.finalDropPosition.row);
		}
	});

	test('placeholder matches drop location for upward drag', async ({ page }) => {
		// Drag item H (1x1 at col 4, row 3) up
		const result = await dragAndCapture(page, '#item-8', 0, -200);

		const lastPlaceholder = result.placeholderPositions.filter(p => p !== null).pop();

		console.log('Upward drag:');
		console.log('  Last placeholder:', lastPlaceholder);
		console.log('  Final drop:', result.finalDropPosition);

		if (lastPlaceholder) {
			expect(lastPlaceholder.column).toBe(result.finalDropPosition.column);
			expect(lastPlaceholder.row).toBe(result.finalDropPosition.row);
		}
	});

	test('multi-cell item placeholder matches drop location', async ({ page }) => {
		// Drag item A (2x2 at col 1, row 1) right
		const result = await dragAndCapture(page, '#item-1', 400, 0);

		const lastPlaceholder = result.placeholderPositions.filter(p => p !== null).pop();

		console.log('Multi-cell rightward drag:');
		console.log('  Last placeholder:', lastPlaceholder);
		console.log('  Final drop:', result.finalDropPosition);

		if (lastPlaceholder) {
			expect(lastPlaceholder.column).toBe(result.finalDropPosition.column);
			expect(lastPlaceholder.row).toBe(result.finalDropPosition.row);
		}
	});

	test('debug: log all placeholder positions during leftward drag', async ({ page }) => {
		// This test is for debugging - logs all positions during drag
		const result = await dragAndCapture(page, '#item-5', -300, 0, 20);

		console.log('\n=== Leftward Drag Debug ===');
		console.log('Placeholder positions during drag:');
		result.placeholderPositions.forEach((pos, i) => {
			console.log(`  Step ${i + 1}: ${pos ? `col ${pos.column}, row ${pos.row}` : 'null'}`);
		});
		console.log(`Final drop position: col ${result.finalDropPosition.column}, row ${result.finalDropPosition.row}`);
		console.log('===========================\n');
	});
});
