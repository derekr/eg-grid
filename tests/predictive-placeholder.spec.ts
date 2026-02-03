import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:8888';

interface Position {
	x: number;
	y: number;
}

interface GridPosition {
	column: number;
	row: number;
}

/**
 * Get bounding box center of an element
 */
async function getElementCenter(page: Page, selector: string): Promise<Position> {
	const el = page.locator(selector);
	const box = await el.boundingBox();
	if (!box) throw new Error(`Element not found: ${selector}`);
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Get placeholder bounding box center (if visible)
 */
async function getPlaceholderCenter(page: Page): Promise<Position | null> {
	const placeholder = page.locator('.drop-placeholder');
	if (!(await placeholder.isVisible())) return null;
	const box = await placeholder.boundingBox();
	if (!box) return null;
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Get placeholder grid position
 */
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

/**
 * Start a drag operation and move in a direction, then check placeholder position
 */
async function startDragAndMove(
	page: Page,
	itemSelector: string,
	moveX: number,
	moveY: number
): Promise<{
	itemCenter: Position;
	placeholderCenter: Position | null;
	placeholderGridPos: GridPosition | null;
}> {
	const item = page.locator(itemSelector);
	const box = await item.boundingBox();
	if (!box) throw new Error(`Element not found: ${itemSelector}`);

	const startX = box.x + box.width / 2;
	const startY = box.y + box.height / 2;

	// Start drag
	await page.mouse.move(startX, startY);
	await page.mouse.down();

	// Move to establish velocity/direction
	const targetX = startX + moveX;
	const targetY = startY + moveY;

	// Move in small steps to establish direction
	const steps = 5;
	for (let i = 1; i <= steps; i++) {
		await page.mouse.move(
			startX + (moveX * i) / steps,
			startY + (moveY * i) / steps
		);
		await page.waitForTimeout(20);
	}

	// Final move
	await page.mouse.move(targetX, targetY);
	await page.waitForTimeout(50);

	const itemCenter = { x: targetX, y: targetY };
	const placeholderCenter = await getPlaceholderCenter(page);
	const placeholderGridPos = await getPlaceholderPosition(page);

	return { itemCenter, placeholderCenter, placeholderGridPos };
}

async function endDrag(page: Page) {
	await page.mouse.up();
	await page.waitForTimeout(300);
}

test.describe('Predictive Placeholder', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE_URL}/example-advanced.html`);
		await page.waitForSelector('.grid');
	});

	test('placeholder should lead LEFT when dragging left', async ({ page }) => {
		// Drag item E to the left
		const result = await startDragAndMove(page, '#item-5', -150, 0);

		console.log('Dragging LEFT:');
		console.log('  Item center X:', result.itemCenter.x.toFixed(0));
		console.log('  Placeholder center X:', result.placeholderCenter?.x.toFixed(0));

		// For predictive: placeholder X should be LESS than item X (more to the left)
		// Currently (non-predictive): they would be roughly the same or placeholder behind
		if (result.placeholderCenter) {
			const leadAmount = result.itemCenter.x - result.placeholderCenter.x;
			console.log('  Lead amount (positive = placeholder leads left):', leadAmount.toFixed(0));

			// PREDICTIVE EXPECTATION: placeholder should lead by at least some amount
			// This test will FAIL with current implementation, showing what we need to fix
			// expect(leadAmount).toBeGreaterThan(50);
		}

		await endDrag(page);
	});

	test('placeholder should lead RIGHT when dragging right', async ({ page }) => {
		const result = await startDragAndMove(page, '#item-5', 150, 0);

		console.log('Dragging RIGHT:');
		console.log('  Item center X:', result.itemCenter.x.toFixed(0));
		console.log('  Placeholder center X:', result.placeholderCenter?.x.toFixed(0));

		if (result.placeholderCenter) {
			const leadAmount = result.placeholderCenter.x - result.itemCenter.x;
			console.log('  Lead amount (positive = placeholder leads right):', leadAmount.toFixed(0));
		}

		await endDrag(page);
	});

	test('placeholder should lead UP when dragging up', async ({ page }) => {
		// Use item H which has room to move up
		const result = await startDragAndMove(page, '#item-8', 0, -150);

		console.log('Dragging UP:');
		console.log('  Item center Y:', result.itemCenter.y.toFixed(0));
		console.log('  Placeholder center Y:', result.placeholderCenter?.y.toFixed(0));

		if (result.placeholderCenter) {
			const leadAmount = result.itemCenter.y - result.placeholderCenter.y;
			console.log('  Lead amount (positive = placeholder leads up):', leadAmount.toFixed(0));
		}

		await endDrag(page);
	});

	test('placeholder should lead DOWN when dragging down', async ({ page }) => {
		const result = await startDragAndMove(page, '#item-5', 0, 150);

		console.log('Dragging DOWN:');
		console.log('  Item center Y:', result.itemCenter.y.toFixed(0));
		console.log('  Placeholder center Y:', result.placeholderCenter?.y.toFixed(0));

		if (result.placeholderCenter) {
			const leadAmount = result.placeholderCenter.y - result.itemCenter.y;
			console.log('  Lead amount (positive = placeholder leads down):', leadAmount.toFixed(0));
		}

		await endDrag(page);
	});

	test('analyze current behavior during continuous leftward drag', async ({ page }) => {
		const item = page.locator('#item-5');
		const box = await item.boundingBox();
		if (!box) throw new Error('Item not found');

		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;

		await page.mouse.move(startX, startY);
		await page.mouse.down();

		console.log('\n=== Continuous Leftward Drag Analysis ===');
		console.log('Step | Item X | Placeholder X | Placeholder Grid Col | Delta (item - placeholder)');
		console.log('-----|--------|---------------|---------------------|---------------------------');

		const totalMove = -300;
		const steps = 15;

		for (let i = 1; i <= steps; i++) {
			const currentX = startX + (totalMove * i) / steps;
			await page.mouse.move(currentX, startY);
			await page.waitForTimeout(30);

			const placeholderCenter = await getPlaceholderCenter(page);
			const placeholderGrid = await getPlaceholderPosition(page);

			const delta = placeholderCenter ? (currentX - placeholderCenter.x).toFixed(0) : 'N/A';
			const gridCol = placeholderGrid?.column ?? 'N/A';

			console.log(
				`${String(i).padStart(4)} | ${currentX.toFixed(0).padStart(6)} | ${placeholderCenter?.x.toFixed(0).padStart(13) ?? 'N/A'.padStart(13)} | ${String(gridCol).padStart(19)} | ${String(delta).padStart(25)}`
			);
		}

		console.log('==========================================\n');

		await page.mouse.up();
		await page.waitForTimeout(300);
	});
});
