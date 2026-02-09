import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for eg-grid standalone tests.
 * These tests serve static HTML files directly without needing the main app.
 */
export default defineConfig({
	testDir: './',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'list',
	use: {
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	// No webServer - tests serve their own files
});
