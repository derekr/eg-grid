import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Default to node for pure logic tests
		environment: 'node',
		// Include test files
		include: ['**/*.test.ts'],
		// Exclude node_modules and node:test based tests
		exclude: ['node_modules', 'plugins/algorithm-push-core.test.ts'],
		// Global test utilities
		globals: true,
	},
});
