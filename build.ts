import { build, type InlineConfig } from 'vite';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { statSync, readFileSync } from 'node:fs';

const root = import.meta.dirname;

const entries = [
	{ entry: 'src/bundles/index.ts', name: 'eg-grid', label: 'full' },
	{ entry: 'src/bundles/element.ts', name: 'eg-grid-element', label: 'web component' },
	{ entry: 'src/plugins/dev-overlay.ts', name: 'dev-overlay', label: 'debug overlay' },
	{ entry: 'src/eg-grid-condensed.ts', name: 'eg-grid-condensed', label: 'condensed' },
];

const minifyOptions = {
	compress: {
		target: 'es2022',
		dropDebugger: true,
		unused: true,
	},
	mangle: {
		toplevel: true,
	},
};

function libConfig(entry: string, fileName: string, minify: boolean): InlineConfig {
	return {
		root,
		configFile: false,
		logLevel: 'warn',
		build: {
			lib: {
				entry: resolve(root, entry),
				formats: ['es'],
				fileName: () => fileName,
			},
			outDir: 'dist',
			emptyOutDir: false,
			sourcemap: true,
			minify,
			target: 'es2022',
			rolldownOptions: minify ? { output: { minify: minifyOptions } } : undefined,
		},
	};
}

// Build all bundles — unminified + minified
await Promise.all(entries.flatMap(({ entry, name }) => [
	build(libConfig(entry, `${name}.js`, false)),
	build(libConfig(entry, `${name}.min.js`, true)),
]));

// Size report
function formatSize(bytes: number): string {
	return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

const col = 42;
console.log(`\n  ${'Bundle'.padEnd(col)} ${'Raw'.padStart(9)} ${'Min'.padStart(9)} ${'Gzip'.padStart(9)}`);
console.log(`  ${'─'.repeat(col)} ${'─'.repeat(9)} ${'─'.repeat(9)} ${'─'.repeat(9)}`);

for (const { name, label } of entries) {
	const rawPath = resolve(root, 'dist', `${name}.js`);
	const minPath = resolve(root, 'dist', `${name}.min.js`);
	const rawSize = statSync(rawPath).size;
	const minBuf = readFileSync(minPath);
	const minSize = minBuf.byteLength;
	const gzSize = gzipSync(minBuf, { level: 9 }).byteLength;

	const nameStr = `${name}.js (${label})`;
	console.log(`  ${nameStr.padEnd(col)} ${formatSize(rawSize).padStart(9)} ${formatSize(minSize).padStart(9)} ${formatSize(gzSize).padStart(9)}`);
}
