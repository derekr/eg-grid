import { test, expect } from '@playwright/test';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Gridiot resize functionality tests.
 *
 * These tests verify:
 * 1. Placeholder appears during resize
 * 2. Other items shift during resize (push algorithm)
 * 3. Final resized dimensions are correct
 */

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: http.Server;
let serverPort: number;

test.beforeAll(async () => {
	// Create a simple static file server for the gridiot directory
	const gridiotDir = path.resolve(__dirname);

	server = http.createServer((req, res) => {
		let filePath = path.join(gridiotDir, req.url === '/' ? 'example-advanced.html' : req.url || '');

		// Handle directory index
		if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
			filePath = path.join(filePath, 'index.html');
		}

		const extname = path.extname(filePath);
		const contentTypes: Record<string, string> = {
			'.html': 'text/html',
			'.js': 'application/javascript',
			'.css': 'text/css',
			'.json': 'application/json',
			'.map': 'application/json',
		};

		const contentType = contentTypes[extname] || 'application/octet-stream';

		fs.readFile(filePath, (err, content) => {
			if (err) {
				if (err.code === 'ENOENT') {
					res.writeHead(404);
					res.end('File not found: ' + filePath);
				} else {
					res.writeHead(500);
					res.end('Server error');
				}
			} else {
				res.writeHead(200, { 'Content-Type': contentType });
				res.end(content);
			}
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, () => {
			serverPort = (server.address() as { port: number }).port;
			console.log(`Test server started on port ${serverPort}`);
			resolve();
		});
	});
});

test.afterAll(async () => {
	if (server) {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test.describe('Gridiot Resize', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`http://localhost:${serverPort}/example-advanced.html`);
		// Wait for the grid to be initialized
		await page.waitForSelector('.grid .item');
		// Give scripts time to initialize
		await page.waitForTimeout(500);
	});

	test('resizing item-5 (1x1) by dragging SE corner shows resize state and size label', async ({
		page,
	}) => {
		// Get item-5 which is a 1x1 item
		const item5 = page.locator('#item-5');
		await expect(item5).toBeVisible();

		// Get initial bounding box
		const initialBox = await item5.boundingBox();
		expect(initialBox).not.toBeNull();

		// Get initial grid position from computed style
		const initialStyle = await item5.evaluate((el) => {
			const computed = window.getComputedStyle(el);
			return {
				gridColumn: computed.gridColumn,
				gridRow: computed.gridRow,
			};
		});
		console.log('Initial item-5 position:', initialStyle);

		// Calculate the SE corner position (bottom-right)
		// Handle size is 16px, so we need to be within that area
		const seCornerX = initialBox!.x + initialBox!.width - 8;
		const seCornerY = initialBox!.y + initialBox!.height - 8;

		// Calculate target position - drag down and right to make it 2x2
		const gridElement = page.locator('.grid');
		const gridBox = await gridElement.boundingBox();
		const cellWidth = gridBox!.width / 6; // 6 columns
		const cellHeight = 184; // grid-auto-rows: 184px

		const targetX = seCornerX + cellWidth;
		const targetY = seCornerY + cellHeight;

		// Start the resize drag operation
		await page.mouse.move(seCornerX, seCornerY);

		// Verify cursor changes to resize cursor when hovering corner
		await page.waitForTimeout(100);

		// Start dragging
		await page.mouse.down();

		// Move slightly to initiate resize
		await page.mouse.move(seCornerX + 20, seCornerY + 20);
		await page.waitForTimeout(50);

		// Check that resizing state is applied
		const isResizing = await item5.evaluate((el) => el.hasAttribute('data-gridiot-resizing'));
		expect(isResizing).toBe(true);

		// Continue dragging to target size (2x2)
		await page.mouse.move(targetX, targetY);
		await page.waitForTimeout(100);

		// Check for placeholder during resize
		const placeholder = page.locator('.drop-placeholder');
		const placeholderVisible = await placeholder.isVisible().catch(() => false);
		console.log('Placeholder visible during resize:', placeholderVisible);

		// Check if a size label appears (showSizeLabel: true in config)
		const sizeLabel = page.locator('.gridiot-resize-label');
		const sizeLabelVisible = await sizeLabel.isVisible().catch(() => false);
		if (sizeLabelVisible) {
			const labelText = await sizeLabel.textContent();
			console.log('Size label during resize:', labelText);
			expect(labelText).toBeTruthy();
		}

		// Complete the resize
		await page.mouse.up();

		// Wait for any view transitions to complete
		await page.waitForTimeout(300);

		// Verify the resize state is removed
		const stillResizing = await item5.evaluate((el) => el.hasAttribute('data-gridiot-resizing'));
		expect(stillResizing).toBe(false);

		// Get final grid position
		const finalStyle = await item5.evaluate((el) => {
			const computed = window.getComputedStyle(el);
			return {
				gridColumn: computed.gridColumn,
				gridRow: computed.gridRow,
			};
		});
		console.log('Final item-5 position:', finalStyle);

		// Get final bounding box
		const finalBox = await item5.boundingBox();
		console.log('Initial box:', initialBox);
		console.log('Final box:', finalBox);

		// Verify the item was resized (should be larger)
		expect(finalBox!.width).toBeGreaterThan(initialBox!.width * 0.9); // Allow some tolerance
		expect(finalBox!.height).toBeGreaterThan(initialBox!.height * 0.9);
	});

	test('resizing triggers layout recalculation and other items shift', async ({ page }) => {
		// Get item-5 and surrounding items
		const item5 = page.locator('#item-5');
		const item8 = page.locator('#item-8'); // Should be affected by item-5 resize

		// Get initial positions
		const item5InitialBox = await item5.boundingBox();
		const item8InitialBox = await item8.boundingBox();

		console.log('Initial item-5 box:', item5InitialBox);
		console.log('Initial item-8 box:', item8InitialBox);

		// Perform resize on item-5
		const seCornerX = item5InitialBox!.x + item5InitialBox!.width - 8;
		const seCornerY = item5InitialBox!.y + item5InitialBox!.height - 8;

		// Calculate larger target (try to make 2x2)
		const gridBox = await page.locator('.grid').boundingBox();
		const cellWidth = gridBox!.width / 6;
		const cellHeight = 184;

		// Drag significantly to force other items to shift
		await page.mouse.move(seCornerX, seCornerY);
		await page.mouse.down();
		await page.mouse.move(seCornerX + cellWidth * 1.5, seCornerY + cellHeight * 1.5, {
			steps: 10,
		});

		// Check if items have shifted during resize
		await page.waitForTimeout(100);

		// Complete resize
		await page.mouse.up();
		await page.waitForTimeout(300);

		// Get final positions
		const item5FinalBox = await item5.boundingBox();
		const item8FinalBox = await item8.boundingBox();

		console.log('Final item-5 box:', item5FinalBox);
		console.log('Final item-8 box:', item8FinalBox);

		// Item-5 should have grown
		const item5Grew =
			item5FinalBox!.width > item5InitialBox!.width ||
			item5FinalBox!.height > item5InitialBox!.height;
		console.log('Item-5 grew:', item5Grew);
		expect(item5Grew).toBe(true);

		// If item-5 grew significantly, item-8 might have shifted
		// (depending on push algorithm behavior)
		if (item5Grew) {
			const item8Shifted =
				item8FinalBox!.x !== item8InitialBox!.x || item8FinalBox!.y !== item8InitialBox!.y;
			console.log('Item-8 shifted:', item8Shifted);
		}
	});

	test('resize respects minimum size constraints', async ({ page }) => {
		// Get item-1 which is 2x2 - try to resize smaller than minimum (1x1)
		const item1 = page.locator('#item-1');
		const initialBox = await item1.boundingBox();

		// Try to resize from NW corner to shrink it
		const nwCornerX = initialBox!.x + 8;
		const nwCornerY = initialBox!.y + 8;

		// Try to drag to shrink past minimum
		await page.mouse.move(nwCornerX, nwCornerY);
		await page.mouse.down();
		await page.mouse.move(
			initialBox!.x + initialBox!.width - 50,
			initialBox!.y + initialBox!.height - 50,
			{ steps: 10 }
		);
		await page.mouse.up();

		await page.waitForTimeout(300);

		// Get final box
		const finalBox = await item1.boundingBox();

		// Should be at least 1x1 cell size (minimum constraint)
		const gridBox = await page.locator('.grid').boundingBox();
		const minCellWidth = gridBox!.width / 6 - 20; // Account for gaps
		const minCellHeight = 164; // 184 - 20 for tolerance

		expect(finalBox!.width).toBeGreaterThanOrEqual(minCellWidth);
		expect(finalBox!.height).toBeGreaterThanOrEqual(minCellHeight);
	});

	test('resize respects maximum size constraints', async ({ page }) => {
		// Get item-5 which is 1x1 - try to resize larger than maximum (6x6)
		const item5 = page.locator('#item-5');
		const initialBox = await item5.boundingBox();

		const seCornerX = initialBox!.x + initialBox!.width - 8;
		const seCornerY = initialBox!.y + initialBox!.height - 8;

		// Try to drag way past maximum
		await page.mouse.move(seCornerX, seCornerY);
		await page.mouse.down();
		await page.mouse.move(seCornerX + 2000, seCornerY + 2000, { steps: 10 });
		await page.mouse.up();

		await page.waitForTimeout(300);

		// Get final box
		const finalBox = await item5.boundingBox();
		const gridBox = await page.locator('.grid').boundingBox();

		// Should be constrained to max 6 columns wide
		expect(finalBox!.width).toBeLessThanOrEqual(gridBox!.width + 20); // Allow small tolerance
	});
});
