import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:8888';

interface GridPosition {
	column: number;
	row: number;
}

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

async function getPlaceholderPosition(page: Page): Promise<GridPosition | null> {
	return page.evaluate(() => {
		const placeholder = document.querySelector('.drop-placeholder') as HTMLElement;
		if (!placeholder || !placeholder.parentElement) return null;
		const style = getComputedStyle(placeholder);
		const col = parseInt(style.gridColumnStart, 10);
		const row = parseInt(style.gridRowStart, 10);
		if (isNaN(col) || isNaN(row)) return null;
		return { column: col, row: row };
	});
}

test.describe('Edge Cases', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE_URL}/example-advanced.html`);
		await page.waitForSelector('.grid');
	});

	test('direction reversal: left then right', async ({ page }) => {
		const item = page.locator('#item-5');
		const box = await item.boundingBox();
		if (!box) throw new Error('Item not found');

		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;

		// Start drag
		await page.mouse.move(startX, startY);
		await page.mouse.down();

		console.log('\n=== Direction Reversal: Left then Right ===');

		// Move left first
		for (let i = 1; i <= 5; i++) {
			await page.mouse.move(startX - i * 40, startY);
			await page.waitForTimeout(30);
		}
		const leftPos = await getPlaceholderPosition(page);
		console.log('After moving left:', leftPos);

		// Now move right
		for (let i = 1; i <= 10; i++) {
			await page.mouse.move(startX + i * 40, startY);
			await page.waitForTimeout(30);
		}
		const rightPos = await getPlaceholderPosition(page);
		console.log('After moving right:', rightPos);

		// Drop
		await page.mouse.up();
		await page.waitForTimeout(300);

		const finalPos = await getGridPosition(page, '#item-5');
		console.log('Final drop position:', finalPos);
		console.log('==========================================\n');

		// Placeholder should match final drop
		expect(rightPos?.column).toBe(finalPos.column);
		expect(rightPos?.row).toBe(finalPos.row);
	});

	test('diagonal drag: down-right', async ({ page }) => {
		const item = page.locator('#item-5');
		const box = await item.boundingBox();
		if (!box) throw new Error('Item not found');

		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;

		await page.mouse.move(startX, startY);
		await page.mouse.down();

		console.log('\n=== Diagonal Drag: Down-Right ===');

		// Move diagonally
		const steps = 10;
		for (let i = 1; i <= steps; i++) {
			await page.mouse.move(startX + i * 30, startY + i * 30);
			await page.waitForTimeout(30);
		}

		const placeholderPos = await getPlaceholderPosition(page);
		console.log('Placeholder during drag:', placeholderPos);

		await page.mouse.up();
		await page.waitForTimeout(300);

		const finalPos = await getGridPosition(page, '#item-5');
		console.log('Final drop position:', finalPos);
		console.log('==========================================\n');

		expect(placeholderPos?.column).toBe(finalPos.column);
		expect(placeholderPos?.row).toBe(finalPos.row);
	});

	test('rapid small movements (jitter simulation)', async ({ page }) => {
		const item = page.locator('#item-5');
		const box = await item.boundingBox();
		if (!box) throw new Error('Item not found');

		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;

		await page.mouse.move(startX, startY);
		await page.mouse.down();

		console.log('\n=== Rapid Jitter Simulation ===');

		// Simulate jittery movement towards the left
		let currentX = startX;
		for (let i = 0; i < 20; i++) {
			// Move mostly left but with some back-and-forth
			const jitter = (Math.random() - 0.5) * 10;
			currentX -= 15 + jitter; // Net leftward movement
			await page.mouse.move(currentX, startY + jitter);
			await page.waitForTimeout(10);
		}

		const placeholderPos = await getPlaceholderPosition(page);
		console.log('Placeholder after jittery drag:', placeholderPos);

		await page.mouse.up();
		await page.waitForTimeout(300);

		const finalPos = await getGridPosition(page, '#item-5');
		console.log('Final drop position:', finalPos);
		console.log('==========================================\n');

		// Should still match (within reason for jitter)
		expect(placeholderPos?.column).toBe(finalPos.column);
		expect(placeholderPos?.row).toBe(finalPos.row);
	});

	test('drag to grid edge and beyond', async ({ page }) => {
		const item = page.locator('#item-5');
		const box = await item.boundingBox();
		if (!box) throw new Error('Item not found');

		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;

		await page.mouse.move(startX, startY);
		await page.mouse.down();

		console.log('\n=== Drag to Edge ===');

		// Move far to the right (beyond grid)
		await page.mouse.move(startX + 1000, startY);
		await page.waitForTimeout(50);

		const placeholderPos = await getPlaceholderPosition(page);
		console.log('Placeholder at edge:', placeholderPos);

		await page.mouse.up();
		await page.waitForTimeout(300);

		const finalPos = await getGridPosition(page, '#item-5');
		console.log('Final drop position:', finalPos);
		console.log('==========================================\n');

		// Should be clamped to grid bounds
		expect(finalPos.column).toBeGreaterThanOrEqual(1);
		expect(finalPos.column).toBeLessThanOrEqual(6);
	});

	test('multi-cell item collision scenario', async ({ page }) => {
		// Drag the 2x2 item (A) and check placeholder/drop consistency
		const item = page.locator('#item-1');
		const box = await item.boundingBox();
		if (!box) throw new Error('Item not found');

		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;

		await page.mouse.move(startX, startY);
		await page.mouse.down();

		console.log('\n=== Multi-cell Item Drag ===');

		// Move right
		for (let i = 1; i <= 10; i++) {
			await page.mouse.move(startX + i * 40, startY);
			await page.waitForTimeout(30);
		}

		const placeholderPos = await getPlaceholderPosition(page);
		console.log('Placeholder for 2x2 item:', placeholderPos);

		await page.mouse.up();
		await page.waitForTimeout(300);

		const finalPos = await getGridPosition(page, '#item-1');
		console.log('Final drop position:', finalPos);
		console.log('==========================================\n');

		expect(placeholderPos?.column).toBe(finalPos.column);
		expect(placeholderPos?.row).toBe(finalPos.row);
	});
});
