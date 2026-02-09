import * as esbuild from 'esbuild-wasm';
// @ts-ignore — wrangler handles .wasm imports
import wasmModule from '../node_modules/esbuild-wasm/esbuild.wasm';
import { SOURCES } from './sources';
import { PLUGIN_NAMES } from './manifest';

let initialized = false;

async function ensureInit(): Promise<void> {
	if (initialized) return;
	await esbuild.initialize({ wasmModule, worker: false });
	initialized = true;
}

export interface BundleResult {
	code: string;
	size: number;
	gzipSize: number;
	brotliSize: number;
	metafile?: esbuild.Metafile;
}

export async function bundle(
	plugins: string[],
	options?: { minify?: boolean; metafile?: boolean },
): Promise<BundleResult> {
	await ensureInit();

	const entryCode = generateEntryPoint(plugins);

	const result = await esbuild.build({
		stdin: { contents: entryCode, resolveDir: '.', loader: 'ts' },
		bundle: true,
		write: false,
		format: 'esm',
		target: 'es2022',
		minify: options?.minify ?? true,
		metafile: options?.metafile ?? true,
		plugins: [virtualFsPlugin()],
	});

	const code = result.outputFiles![0].text;
	const [gzipSize, brotliSize] = await Promise.all([
		compressedSize(code, 'gzip'),
		compressedSize(code, 'deflate'),
	]);
	return { code, size: code.length, gzipSize, brotliSize, metafile: result.metafile };
}

async function compressedSize(text: string, format: CompressionFormat): Promise<number> {
	const blob = new Blob([text]);
	const stream = blob.stream().pipeThrough(new CompressionStream(format));
	const compressed = await new Response(stream).arrayBuffer();
	return compressed.byteLength;
}

export interface PluginSize {
	name: string;
	bytes: number;
}

/**
 * Extract per-plugin byte contribution from esbuild metafile.
 * Groups source files by plugin name; files not belonging to a plugin are grouped as "core".
 * Shared files (like algorithm-harness) are split evenly among the plugins that use them.
 */
export function getPluginSizes(metafile: esbuild.Metafile, plugins: string[]): PluginSize[] {
	const output = Object.values(metafile.outputs)[0];
	if (!output) return [];

	const buckets = new Map<string, number>();
	buckets.set('core', 0);
	for (const p of plugins) buckets.set(p, 0);

	for (const [path, info] of Object.entries(output.inputs)) {
		const clean = path.replace('virtual:', '');

		// Direct plugin match
		let matched = false;
		for (const p of plugins) {
			if (clean === `plugins/${p}.ts`) {
				buckets.set(p, (buckets.get(p) || 0) + info.bytesInOutput);
				matched = true;
				break;
			}
		}

		// Shared plugin infrastructure — split among algorithm plugins that use it
		if (!matched && clean === 'plugins/algorithm-harness.ts') {
			const algoPlugins = plugins.filter(p => p.startsWith('algorithm-'));
			if (algoPlugins.length > 0) {
				const share = info.bytesInOutput / algoPlugins.length;
				for (const p of algoPlugins) {
					buckets.set(p, (buckets.get(p) || 0) + share);
				}
				matched = true;
			}
		}

		if (!matched) {
			buckets.set('core', (buckets.get('core') || 0) + info.bytesInOutput);
		}
	}

	return Array.from(buckets.entries())
		.map(([name, bytes]) => ({ name, bytes: Math.round(bytes) }))
		.filter(e => e.bytes > 0)
		.sort((a, b) => b.bytes - a.bytes);
}

export function formatMetafile(metafile: esbuild.Metafile): string {
	const output = Object.values(metafile.outputs)[0];
	if (!output) return 'No output';

	const inputs = Object.entries(output.inputs)
		.sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
		.map(([path, info]) => {
			const kb = (info.bytesInOutput / 1024).toFixed(1);
			const pct = ((info.bytesInOutput / output.bytes) * 100).toFixed(0);
			const name = path.replace('virtual:', '');
			return `  ${kb.padStart(7)} KB  ${pct.padStart(3)}%  ${name}`;
		});

	return `Output: ${(output.bytes / 1024).toFixed(1)} KB\n\n` + inputs.join('\n');
}

function virtualFsPlugin(): esbuild.Plugin {
	return {
		name: 'virtual-fs',
		setup(build) {
			// Resolve all imports to virtual namespace
			build.onResolve({ filter: /.*/ }, (args) => {
				if (args.namespace === 'virtual' || args.path === '<stdin>') {
					// Skip stdin
					if (args.path === '<stdin>') return undefined;
				}
				const resolved = resolveImport(args.path, args.importer);
				if (resolved && SOURCES[resolved]) {
					return { path: resolved, namespace: 'virtual' };
				}
				// Let esbuild handle stdin resolution
				if (args.namespace === '' && args.kind === 'entry-point') {
					return undefined;
				}
				// For imports from stdin, resolve as if from root
				const fromRoot = resolveImport(args.path, '');
				if (fromRoot && SOURCES[fromRoot]) {
					return { path: fromRoot, namespace: 'virtual' };
				}
				return undefined;
			});

			// Load from embedded sources
			build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
				const source = SOURCES[args.path];
				if (!source) {
					return { errors: [{ text: `Virtual FS: file not found: ${args.path}` }] };
				}
				return { contents: source, loader: 'ts' };
			});
		},
	};
}

function generateEntryPoint(plugins: string[]): string {
	// Plugin side-effect imports
	const imports = plugins.map(p => `import './plugins/${p}.ts';`).join('\n');

	// Core exports (always included)
	const lines = [
		imports,
		`export { getItemCell, getPlugin, init, registerPlugin, setItemCell } from './engine.ts';`,
		`export type * from './types.ts';`,
	];

	// Conditional exports based on selected plugins
	if (plugins.includes('algorithm-push') || plugins.includes('algorithm-reorder')) {
		lines.push(
			`export { buildLayoutItems, createLayoutModel, layoutItemsToPositions } from './layout-model.ts';`,
		);
	}
	if (plugins.includes('algorithm-push')) {
		lines.push(
			`export { attachPushAlgorithm, calculateLayout, layoutToCSS, readItemsFromDOM } from './plugins/algorithm-push.ts';`,
		);
	}
	if (plugins.includes('algorithm-reorder')) {
		lines.push(
			`export { attachReorderAlgorithm, calculateReorderLayout, getItemOrder, reflowItems } from './plugins/algorithm-reorder.ts';`,
		);
	}
	if (plugins.includes('camera')) {
		lines.push(`export { attachCamera } from './plugins/camera.ts';`);
	}
	if (plugins.includes('resize')) {
		lines.push(`export { attachResize } from './plugins/resize.ts';`);
	}
	if (plugins.includes('placeholder')) {
		lines.push(`export { attachPlaceholder, attachPlaceholderStyles, PLACEHOLDER_CSS } from './plugins/placeholder.ts';`);
	}
	if (plugins.includes('responsive')) {
		lines.push(`export { attachResponsive, ensureContainerWrapper } from './plugins/responsive.ts';`);
	}
	if (plugins.includes('pointer')) {
		lines.push(`export { animateFLIP, animateFLIPWithTracking, getItemViewTransitionName, withViewTransitionExclusion } from './utils/flip.ts';`);
	}

	return lines.join('\n');
}

/**
 * Resolve a relative import path to a SOURCES key.
 *
 * SOURCES keys are flat: "engine.ts", "plugins/pointer.ts", "utils/flip.ts"
 * Imports look like: "../engine" (from plugins/), "./algorithm-push-core" (within plugins/)
 */
function resolveImport(importPath: string, importer: string): string | undefined {
	// Determine importer's directory
	const importerDir = importer.includes('/')
		? importer.substring(0, importer.lastIndexOf('/'))
		: '';

	// Resolve relative path
	let resolved: string;
	if (importPath.startsWith('./') || importPath.startsWith('../')) {
		const parts = (importerDir ? importerDir + '/' + importPath : importPath).split('/');
		const normalized: string[] = [];
		for (const part of parts) {
			if (part === '.' || part === '') continue;
			if (part === '..') {
				normalized.pop();
			} else {
				normalized.push(part);
			}
		}
		resolved = normalized.join('/');
	} else {
		resolved = importPath;
	}

	// Try exact match first
	if (SOURCES[resolved]) return resolved;

	// Try appending .ts
	if (SOURCES[resolved + '.ts']) return resolved + '.ts';

	return undefined;
}
