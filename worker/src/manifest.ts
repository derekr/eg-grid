export const PLUGINS = [
	{ name: 'pointer', description: 'Mouse/touch drag handling', category: 'input' },
	{ name: 'keyboard', description: 'Arrow key navigation, pick-up/drop', category: 'input' },
	{ name: 'accessibility', description: 'ARIA live announcements', category: 'input' },
	{ name: 'algorithm-push', description: 'Push-down layout algorithm', category: 'algorithm' },
	{ name: 'algorithm-reorder', description: 'Sequence-based reorder algorithm', category: 'algorithm' },
	{ name: 'camera', description: 'Viewport auto-scroll during drag', category: 'enhancement' },
	{ name: 'resize', description: 'Item resizing with handles', category: 'enhancement' },
	{ name: 'placeholder', description: 'Drop target indicator', category: 'enhancement' },
	{ name: 'responsive', description: 'Breakpoint detection + CSS injection', category: 'layout' },
] as const;

export const PLUGIN_NAMES = PLUGINS.map(p => p.name);

export type PluginName = typeof PLUGINS[number]['name'];
