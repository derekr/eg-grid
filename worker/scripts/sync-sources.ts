/**
 * Reads eg-grid source files and writes them to worker/src/sources.ts
 * as a Record<string, string> map for the virtual filesystem.
 *
 * Run: node --experimental-strip-types scripts/sync-sources.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

// Core files at root level
const coreFiles = [
	'engine.ts',
	'types.ts',
	'state-machine.ts',
	'layout-model.ts',
];

// Plugin files (excluding tests)
const pluginFiles = readdirSync(join(ROOT, 'plugins'))
	.filter(f => f.endsWith('.ts') && !f.includes('.test.') && !f.includes('.spec.'))
	.map(f => `plugins/${f}`);

// Utilities
const utilFiles = ['utils/flip.ts'];

// Bundle entry points
const bundleFiles = ['bundles/index.ts', 'bundles/minimal.ts', 'bundles/core.ts'];

const allFiles = [...coreFiles, ...pluginFiles, ...utilFiles, ...bundleFiles];

const entries: string[] = [];
for (const file of allFiles) {
	const content = readFileSync(join(ROOT, file), 'utf-8');
	// Escape backticks and ${} in template literal
	const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
	entries.push(`\t${JSON.stringify(file)}: \`${escaped}\``);
}

const output = `// Auto-generated — do not edit. Run \`pnpm sync-sources\` to update.
export const SOURCES: Record<string, string> = {
${entries.join(',\n')},
};
`;

writeFileSync(join(import.meta.dirname, '..', 'src', 'sources.ts'), output);
console.log(`Wrote ${allFiles.length} source files to src/sources.ts`);
