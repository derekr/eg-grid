import { PLUGINS, PLUGIN_NAMES } from './manifest';
import type { PluginSize } from './bundler';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return bytes + ' B';
	return (bytes / 1024).toFixed(1) + ' KB';
}

export interface OutputData {
	plugins: string[];
	origin: string;
	size?: number;
	gzipSize?: number;
	brotliSize?: number;
	time?: string;
	pluginSizes?: PluginSize[];
	error?: string;
}

export function renderOutput(data: OutputData): string {
	if (data.error) {
		return `<div id="output"><div class="error">Bundle failed: ${escapeHtml(data.error)}</div></div>`;
	}

	const sorted = [...data.plugins].sort();
	const query = sorted.join(',');
	const bundleUrl = `${data.origin}/bundle?plugins=${query}`;

	const sizeParts: string[] = [];
	if (data.size != null) sizeParts.push(`<span>${formatBytes(data.size)} minified</span>`);
	if (data.gzipSize != null) sizeParts.push(`<span>${formatBytes(data.gzipSize)} gzip</span>`);
	if (data.brotliSize != null) sizeParts.push(`<span>${formatBytes(data.brotliSize)} brotli</span>`);
	if (data.time) sizeParts.push(`<span>${data.time}</span>`);
	if (sorted.length === 0) sizeParts.push(`<span>core only (no plugins)</span>`);

	let pluginSizeHtml = '';
	if (data.pluginSizes && data.pluginSizes.length > 0 && data.size) {
		const rows = data.pluginSizes.map(p => {
			const pct = ((p.bytes / data.size!) * 100).toFixed(0);
			return `<tr><td>${escapeHtml(p.name)}</td><td>${formatBytes(p.bytes)}</td><td>${pct}%</td></tr>`;
		}).join('');
		pluginSizeHtml = `
	<table class="sizes">
		<thead><tr><th>Module</th><th>Size</th><th></th></tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
	}

	return `<div id="output">
	<a class="download-btn" href="${escapeHtml(bundleUrl)}" download>Download bundle</a>
	<div class="meta">${sizeParts.join('')}</div>${pluginSizeHtml}
</div>`;
}

export function renderPage(origin: string): string {
	// Single quotes to avoid breaking HTML double-quoted attributes
	const allPluginsExpr = '[' + PLUGIN_NAMES.map(p => `'${p}'`).join(',') + ']';
	const noPluginsExpr = '[' + PLUGIN_NAMES.map(() => `''`).join(',') + ']';

	const checkboxes = PLUGINS.map(p => `
			<label>
				<input type="checkbox" data-bind:plugins value="${p.name}">
				<strong>${p.name}</strong>
				<span class="desc">${p.description}</span>
				<span class="cat">${p.category}</span>
			</label>`).join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gridiot CDN</title>
<style>
	*, *::before, *::after { box-sizing: border-box; }
	body {
		font-family: system-ui, -apple-system, sans-serif;
		max-width: 640px;
		margin: 2rem auto;
		padding: 0 1rem;
		color: #1a1a1a;
		background: #fafafa;
		line-height: 1.5;
	}
	h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
	h1 + p { color: #666; margin-top: 0; }
	h2 { font-size: 1rem; margin: 1.5rem 0 0.5rem; }
	fieldset {
		border: 1px solid #ddd;
		border-radius: 6px;
		padding: 0.75rem 1rem;
		margin: 0;
	}
	legend { font-weight: 600; padding: 0 0.25rem; }
	label {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.25rem 0;
		cursor: pointer;
	}
	label strong { min-width: 120px; font-size: 0.9rem; }
	.desc { color: #666; font-size: 0.85rem; }
	.cat {
		margin-left: auto;
		font-size: 0.75rem;
		color: #999;
		background: #f0f0f0;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
	}
	.actions { display: flex; gap: 0.5rem; margin-top: 1rem; align-items: center; }
	button {
		padding: 0.4rem 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: white;
		cursor: pointer;
		font-size: 0.85rem;
	}
	button:hover { background: #f5f5f5; }
	#output { margin-top: 1.5rem; }
	.download-btn {
		display: inline-block;
		padding: 0.6rem 1.5rem;
		background: #1a1a1a;
		color: #fff;
		text-decoration: none;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 500;
	}
	.download-btn:hover { background: #333; }
	.meta { font-size: 0.85rem; color: #666; margin-top: 0.5rem; }
	.meta span { margin-right: 1rem; }
	.sizes {
		margin-top: 1rem;
		font-size: 0.85rem;
		border-collapse: collapse;
		width: 100%;
	}
	.sizes th, .sizes td { text-align: left; padding: 0.25rem 0.75rem 0.25rem 0; }
	.sizes th { color: #999; font-weight: 500; border-bottom: 1px solid #ddd; }
	.sizes td:nth-child(2), .sizes td:nth-child(3) { text-align: right; font-variant-numeric: tabular-nums; }
	.sizes th:nth-child(2), .sizes th:nth-child(3) { text-align: right; }
	.error { color: #c00; font-size: 0.85rem; margin-top: 0.5rem; }
	.loading { color: #999; font-size: 0.85rem; }
	.spinner {
		display: inline-block;
		width: 12px; height: 12px;
		border: 2px solid #ddd;
		border-top-color: #666;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		vertical-align: middle;
		margin-right: 0.25rem;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
<script type="module" src="https://cdn.jsdelivr.net/gh/starfederation/datastar@1.0.0-RC.7/bundles/datastar.js"></script>
</head>
<body>
	<h1>Gridiot CDN</h1>
	<p>Custom on-demand bundles for <a href="https://github.com/basedash/gridiot">gridiot</a></p>

	<div
		data-signals="{plugins: ${allPluginsExpr}}"
		data-indicator:_loading
		data-init="@post('/build')"
	>
		<fieldset data-on:change__debounce.150ms="@post('/build')">
			<legend>Plugins</legend>
${checkboxes}
		</fieldset>

		<div class="actions">
			<button data-on:click="$plugins = ${allPluginsExpr}; @post('/build')">All</button>
			<button data-on:click="$plugins = ${noPluginsExpr}; @post('/build')">None</button>
			<span data-show="$_loading" style="display:none" class="loading">
				<span class="spinner"></span> Bundling&hellip;
			</span>
		</div>

		<div id="output"></div>
	</div>

</body>
</html>`;
}
