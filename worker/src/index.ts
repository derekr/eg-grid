import { bundle, formatMetafile, getPluginSizes } from './bundler';
import { PLUGINS, PLUGIN_NAMES } from './manifest';
import { renderOutput, renderPage } from './ui';

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders() });
		}

		// Routing
		if (url.pathname === '/') {
			return new Response(renderPage(url.origin), {
				headers: { 'Content-Type': 'text/html; charset=utf-8' },
			});
		}

		if (url.pathname === '/build' && request.method === 'POST') {
			return handleBuild(request, url);
		}

		if (url.pathname === '/analyze') {
			return handleAnalyze(url);
		}

		if (url.pathname === '/manifest.json') {
			return json(PLUGINS, { 'Cache-Control': 'public, max-age=3600' });
		}

		if (url.pathname === '/bundle' || url.pathname.startsWith('/bundle/')) {
			return handleBundle(request, url);
		}

		return json({ error: 'Not found', endpoints: ['/bundle', '/bundle?plugins=pointer,keyboard', '/manifest.json'] }, {}, 404);
	},
};

// --- Bundle analysis ---

async function handleAnalyze(url: URL): Promise<Response> {
	const param = url.searchParams.get('plugins');
	const plugins = param === null ? [...PLUGIN_NAMES] : param === '' ? [] : param.split(',').filter(Boolean);
	const sorted = [...plugins].sort();

	const { metafile, size } = await bundle(sorted, { minify: true, metafile: true });
	const analysis = formatMetafile(metafile!);

	// Also build unminified to show raw vs minified
	const unminified = await bundle(sorted, { minify: false });

	return new Response(
		`Plugins: ${sorted.join(', ') || '(core only)'}\n` +
		`Minified: ${(size / 1024).toFixed(1)} KB\n` +
		`Unminified: ${(unminified.size / 1024).toFixed(1)} KB\n\n` +
		analysis,
		{ headers: { 'Content-Type': 'text/plain', ...corsHeaders() } },
	);
}

// --- SSE build endpoint (Datastar fat morph) ---

async function handleBuild(request: Request, url: URL): Promise<Response> {
	let signals: Record<string, unknown>;
	try {
		signals = await request.json();
		console.log('[build] signals:', JSON.stringify(signals));
	} catch {
		return sseResponse(renderOutput({ plugins: [], origin: url.origin, error: 'Invalid request body' }));
	}

	const raw = signals.plugins;
	const plugins = (Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : [])
		.filter((p: any) => PLUGIN_NAMES.includes(p as any));
	const sorted = [...plugins].sort();

	try {
		const start = Date.now();
		const result = await bundle(sorted, { minify: true });
		const time = `${Date.now() - start}ms`;
		const pluginSizes = result.metafile ? getPluginSizes(result.metafile, sorted) : [];

		// Warm the /bundle cache
		const cacheKey = new URL(url.origin + '/bundle?plugins=' + sorted.join(','));
		const cache = caches.default;
		const cacheResponse = new Response(result.code, {
			headers: {
				'Content-Type': 'application/javascript; charset=utf-8',
				'Cache-Control': 'public, max-age=31536000, immutable',
				'X-Egg-Plugins': sorted.join(',') || '(core only)',
				'X-Egg-Size': String(result.size),
			},
		});
		request.cf && await cache.put(cacheKey, cacheResponse);

		console.log('[build] success:', sorted.join(',') || '(core)', result.size, 'bytes');
		return sseResponse(renderOutput({
			plugins: sorted,
			origin: url.origin,
			size: result.size,
			gzipSize: result.gzipSize,
			brotliSize: result.brotliSize,
			time,
			pluginSizes,
		}));
	} catch (err: any) {
		console.error('[build] error:', err.message);
		return sseResponse(renderOutput({ plugins: sorted, origin: url.origin, error: err.message }));
	}
}

function sseResponse(fragmentHtml: string): Response {
	// Datastar treats each `data: elements` line as a separate fragment,
	// so the entire HTML must be on a single line.
	const oneLine = fragmentHtml.replace(/\n\s*/g, '');
	const body = `event: datastar-patch-elements\ndata: elements ${oneLine}\n\n`;
	return new Response(body, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
	});
}

// --- Bundle endpoint ---

async function handleBundle(request: Request, url: URL): Promise<Response> {
	// Resolve plugin list from path alias or query param
	const plugins = resolvePlugins(url);
	if ('error' in plugins) {
		return json({ error: plugins.error }, {}, 400);
	}

	const sorted = plugins.list.sort();
	const minify = url.searchParams.get('minify') !== 'false';

	// Build cache key from sorted plugin list + minify flag
	const cacheKey = new URL(url.origin + '/bundle?plugins=' + sorted.join(',') + (minify ? '' : '&minify=false'));
	const cache = caches.default;

	// Check cache
	const cached = await cache.match(cacheKey);
	if (cached) {
		// Clone and add headers not stored in cache
		const headers = new Headers(cached.headers);
		for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
		headers.set('X-Cache', 'HIT');
		headers.set('Content-Disposition', `attachment; filename="${bundleFilename(sorted)}"`);
		return new Response(cached.body, { headers });
	}

	// Bundle on demand
	const start = Date.now();
	let result: Awaited<ReturnType<typeof bundle>>;
	try {
		result = await bundle(sorted, { minify });
	} catch (err: any) {
		return json({ error: 'Bundle failed', detail: err.message }, {}, 500);
	}
	const elapsed = Date.now() - start;

	const filename = bundleFilename(sorted);
	const headers: Record<string, string> = {
		'Content-Type': 'application/javascript; charset=utf-8',
		'Content-Disposition': `attachment; filename="${filename}"`,
		'Cache-Control': 'public, max-age=31536000, immutable',
		'X-Egg-Plugins': sorted.join(',') || '(core only)',
		'X-Egg-Size': String(result.size),
		'X-Bundle-Time': `${elapsed}ms`,
		'X-Cache': 'MISS',
		...corsHeaders(),
	};

	const response = new Response(result.code, { headers });

	// Store in cache (without CORS headers — we add them on read)
	const cacheResponse = new Response(result.code, {
		headers: {
			'Content-Type': 'application/javascript; charset=utf-8',
			'Cache-Control': 'public, max-age=31536000, immutable',
			'X-Egg-Plugins': sorted.join(',') || '(core only)',
			'X-Egg-Size': String(result.size),
		},
	});
	request.cf && await cache.put(cacheKey, cacheResponse);

	return response;
}

function resolvePlugins(url: URL): { list: string[] } | { error: string } {
	// Path aliases
	const path = url.pathname;
	if (path === '/bundle/eg-grid.js') return { list: [...PLUGIN_NAMES] };
	if (path === '/bundle/eg-grid-minimal.js') return { list: ['pointer'] };
	if (path === '/bundle/eg-grid-core.js') return { list: [] };

	// Query param
	const param = url.searchParams.get('plugins');
	if (param === null || param === undefined) {
		// No param = full bundle
		return { list: [...PLUGIN_NAMES] };
	}
	if (param === '') {
		// Empty string = core only
		return { list: [] };
	}

	const requested = param.split(',').map(s => s.trim()).filter(Boolean);
	const invalid = requested.filter(p => !PLUGIN_NAMES.includes(p as any));
	if (invalid.length > 0) {
		return { error: `Unknown plugins: ${invalid.join(', ')}. Valid: ${PLUGIN_NAMES.join(', ')}` };
	}

	return { list: requested };
}

function bundleFilename(plugins: string[]): string {
	if (plugins.length === 0) return 'eg-grid-core.js';
	if (plugins.length === PLUGIN_NAMES.length) return 'eg-grid.js';
	if (plugins.length === 1 && plugins[0] === 'pointer') return 'eg-grid-minimal.js';
	return 'eg-grid-custom.js';
}

function corsHeaders(): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Expose-Headers': 'X-Egg-Plugins, X-Egg-Size, X-Bundle-Time, X-Cache',
	};
}

function json(data: unknown, extraHeaders: Record<string, string> = {}, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders(),
			...extraHeaders,
		},
	});
}
