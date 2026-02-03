import * as esbuild from 'esbuild';

const common: esbuild.BuildOptions = {
	bundle: true,
	format: 'esm',
	target: 'es2022',
	minify: false,
	sourcemap: true,
	ignoreAnnotations: true, // Ignore sideEffects: false
};

// Build all bundles
await Promise.all([
	// Full bundle
	esbuild.build({
		...common,
		entryPoints: ['gridiot/bundles/index.ts'],
		outfile: 'gridiot/dist/gridiot.js',
	}),
	// Minimal bundle (pointer only)
	esbuild.build({
		...common,
		entryPoints: ['gridiot/bundles/minimal.ts'],
		outfile: 'gridiot/dist/gridiot-minimal.js',
	}),
	// Core only (no plugins)
	esbuild.build({
		...common,
		entryPoints: ['gridiot/bundles/core.ts'],
		outfile: 'gridiot/dist/gridiot-core.js',
	}),
	// Algorithm plugins (optional add-ons)
	esbuild.build({
		...common,
		entryPoints: ['gridiot/plugins/algorithm-push.ts'],
		outfile: 'gridiot/dist/algorithm-push.js',
	}),
	// Dev overlay plugin
	esbuild.build({
		...common,
		entryPoints: ['gridiot/plugins/dev-overlay.ts'],
		outfile: 'gridiot/dist/dev-overlay.js',
	}),
	// Placeholder plugin
	esbuild.build({
		...common,
		entryPoints: ['gridiot/plugins/placeholder.ts'],
		outfile: 'gridiot/dist/placeholder.js',
	}),
	// Camera plugin
	esbuild.build({
		...common,
		entryPoints: ['gridiot/plugins/camera.ts'],
		outfile: 'gridiot/dist/camera.js',
	}),
	// Resize plugin
	esbuild.build({
		...common,
		entryPoints: ['gridiot/plugins/resize.ts'],
		outfile: 'gridiot/dist/resize.js',
	}),
]);

console.log('Built gridiot bundles:');
console.log('  - gridiot/dist/gridiot.js (full)');
console.log('  - gridiot/dist/gridiot-minimal.js (pointer only)');
console.log('  - gridiot/dist/gridiot-core.js (no plugins)');
console.log('  - gridiot/dist/algorithm-push.js (push layout algorithm)');
console.log('  - gridiot/dist/dev-overlay.js (debug/config overlay)');
console.log('  - gridiot/dist/placeholder.js (drop placeholder)');
console.log('  - gridiot/dist/camera.js (viewport auto-scroll)');
console.log('  - gridiot/dist/resize.js (item resize handles)');
