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
		entryPoints: ['bundles/index.ts'],
		outfile: 'dist/gridiot.js',
	}),
	// Minimal bundle (pointer only)
	esbuild.build({
		...common,
		entryPoints: ['bundles/minimal.ts'],
		outfile: 'dist/gridiot-minimal.js',
	}),
	// Core only (no plugins)
	esbuild.build({
		...common,
		entryPoints: ['bundles/core.ts'],
		outfile: 'dist/gridiot-core.js',
	}),
	// Algorithm plugins (optional add-ons)
	esbuild.build({
		...common,
		entryPoints: ['plugins/algorithm-push.ts'],
		outfile: 'dist/algorithm-push.js',
	}),
	// Dev overlay plugin
	esbuild.build({
		...common,
		entryPoints: ['plugins/dev-overlay.ts'],
		outfile: 'dist/dev-overlay.js',
	}),
	// Placeholder plugin
	esbuild.build({
		...common,
		entryPoints: ['plugins/placeholder.ts'],
		outfile: 'dist/placeholder.js',
	}),
	// Camera plugin
	esbuild.build({
		...common,
		entryPoints: ['plugins/camera.ts'],
		outfile: 'dist/camera.js',
	}),
	// Resize plugin
	esbuild.build({
		...common,
		entryPoints: ['plugins/resize.ts'],
		outfile: 'dist/resize.js',
	}),
]);

console.log('Built gridiot bundles:');
console.log('  - dist/gridiot.js (full)');
console.log('  - dist/gridiot-minimal.js (pointer only)');
console.log('  - dist/gridiot-core.js (no plugins)');
console.log('  - dist/algorithm-push.js (push layout algorithm)');
console.log('  - dist/dev-overlay.js (debug/config overlay)');
console.log('  - dist/placeholder.js (drop placeholder)');
console.log('  - dist/camera.js (viewport auto-scroll)');
console.log('  - dist/resize.js (item resize handles)');
