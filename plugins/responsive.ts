/**
 * Responsive Plugin
 *
 * Handles responsive column detection and CSS injection for different breakpoints.
 *
 * Responsibilities:
 * - Detect column count changes via ResizeObserver
 * - Inject CSS for all breakpoints using container queries
 * - Register 'columnCount' provider for other plugins
 * - Emit 'gridiot:column-count-change' events
 * - Regenerate CSS when layout model changes
 *
 * CSS is injected once on init and regenerated when the layout model changes.
 * The actual responsive layout switching is handled by CSS container queries.
 */

import { registerPlugin } from '../engine';
import type {
	ColumnCountChangeDetail,
	GridiotCore,
	ResponsiveLayoutModel,
	ResponsivePluginOptions,
	StyleManager,
} from '../types';

const DEBUG = false;
function log(...args: unknown[]) {
	if (DEBUG) console.log('[responsive]', ...args);
}

/**
 * Responsive state exposed via provider registry
 */
export interface ResponsiveState {
	columnCount: number;
	maxColumns: number;
	minColumns: number;
	hasOverride: boolean;
}

/**
 * Attach the responsive plugin to a grid element.
 *
 * @param gridElement - The grid container element
 * @param options - Configuration options including layout model and style element
 * @param core - Optional GridiotCore for provider registration
 * @returns Cleanup function to detach the plugin
 */
export function attachResponsive(
	gridElement: HTMLElement,
	options: ResponsivePluginOptions,
	core?: GridiotCore,
): () => void {
	const { layoutModel } = options;
	const styles: StyleManager | null = core?.styles ?? null;

	// Infer cell size and gap from CSS if not provided
	let cellSize = options.cellSize;
	let gap = options.gap;

	function inferGridMetrics(): void {
		if (cellSize !== undefined && gap !== undefined) return;

		const style = getComputedStyle(gridElement);

		if (gap === undefined) {
			gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 16;
		}

		if (cellSize === undefined) {
			// Try to infer from grid-auto-rows or first track
			const autoRows = parseFloat(style.gridAutoRows) || 0;
			if (autoRows > 0) {
				cellSize = autoRows;
			} else {
				// Fall back to first column track width
				const columns = style.gridTemplateColumns.split(' ');
				cellSize = parseFloat(columns[0] ?? '184') || 184;
			}
		}

		log('Inferred grid metrics:', { cellSize, gap });
	}

	/**
	 * Detect current column count from computed grid style
	 */
	function detectColumnCount(): number {
		const style = getComputedStyle(gridElement);
		const columns = style.gridTemplateColumns.split(' ').filter(Boolean);
		return Math.max(1, columns.length);
	}

	/**
	 * Inject CSS for all breakpoints
	 */
	function injectCSS(): void {
		if (!styles) return;

		inferGridMetrics();

		// Use the grid element's class or ID as the selector
		const gridSelector = gridElement.id
			? `#${gridElement.id}`
			: gridElement.className
				? `.${gridElement.className.split(' ')[0]}`
				: '.grid';

		const css = layoutModel.generateAllBreakpointCSS({
			cellSize: cellSize!,
			gap: gap!,
			gridSelector,
		});

		styles.set('base', css);
		styles.commit();
		log('Injected CSS for all breakpoints');
	}

	// Register provider if core is provided
	if (core) {
		core.providers.register<ResponsiveState>('responsive', () => ({
			columnCount: layoutModel.currentColumnCount,
			maxColumns: layoutModel.maxColumns,
			minColumns: layoutModel.minColumns,
			hasOverride: layoutModel.hasOverride(layoutModel.currentColumnCount),
		}));
	}

	// Track if server-rendered CSS was detected
	// When true, we only inject CSS for explicit user overrides, not derived layouts
	const hasServerRenderedCSS = !!(styles?.get('base')?.trim());

	// Only inject CSS if base layer is empty (not server-rendered)
	// This prevents flash when server has already provided initial CSS
	if (!hasServerRenderedCSS) {
		injectCSS();
	} else {
		log('Skipping initial CSS injection - server-rendered CSS detected');
	}

	// Subscribe to layout model changes
	// The subscription only fires on user actions (saveLayout/clearOverride),
	// so we always inject CSS here - the initial hasServerRenderedCSS check
	// prevents injection on page load, this handles user interactions.
	const unsubscribe = layoutModel.subscribe(() => {
		log('Layout model changed, regenerating CSS');
		injectCSS();
	});

	// Watch for resize to update column count tracking
	let lastColumnCount = layoutModel.currentColumnCount;

	const resizeObserver = new ResizeObserver(() => {
		const newColumnCount = detectColumnCount();

		if (newColumnCount !== lastColumnCount) {
			const previousCount = lastColumnCount;
			lastColumnCount = newColumnCount;

			// Update layout model
			layoutModel.setCurrentColumnCount(newColumnCount);

			log('Column count changed:', previousCount, '->', newColumnCount);

			// Emit event
			const detail: ColumnCountChangeDetail = {
				previousCount,
				currentCount: newColumnCount,
			};

			gridElement.dispatchEvent(
				new CustomEvent('gridiot:column-count-change', {
					bubbles: true,
					detail,
				}),
			);
		}
	});

	resizeObserver.observe(gridElement);

	// Cleanup function
	return () => {
		resizeObserver.disconnect();
		unsubscribe();
	};
}

/**
 * Create a container wrapper element for container queries.
 * The grid must be inside a container with `container-type: inline-size`.
 *
 * If the grid's parent doesn't have container-type set, this helper
 * can wrap the grid or apply the necessary styles.
 *
 * @param gridElement - The grid container element
 * @returns The wrapper element (or the parent if already suitable)
 */
export function ensureContainerWrapper(gridElement: HTMLElement): HTMLElement {
	const parent = gridElement.parentElement;

	if (parent) {
		const style = getComputedStyle(parent);
		if (style.containerType === 'inline-size' || style.containerType === 'size') {
			// Parent already has container-type set
			return parent;
		}
	}

	// Check if the grid itself can be the container
	// (not recommended, but possible)
	const gridStyle = getComputedStyle(gridElement);
	if (gridStyle.containerType === 'inline-size' || gridStyle.containerType === 'size') {
		return gridElement;
	}

	// Need to apply container-type to parent or create a wrapper
	if (parent) {
		parent.style.containerType = 'inline-size';
		log('Applied container-type: inline-size to parent');
		return parent;
	}

	// Fallback: grid is at document root, can't do much
	console.warn(
		'[gridiot:responsive] Grid has no parent element. Container queries may not work.',
	);
	return gridElement;
}

// Register as a plugin for auto-initialization via init()
registerPlugin({
	name: 'responsive',
	init(
		core,
		options?: ResponsivePluginOptions & {
			core?: GridiotCore;
			layoutModel?: ResponsiveLayoutModel;
		},
	) {
		// Responsive requires layoutModel
		if (!options?.layoutModel) {
			// Skip silently - responsive is optional and requires layoutModel
			return;
		}

		return attachResponsive(
			core.element,
			{
				layoutModel: options.layoutModel,
				cellSize: options.cellSize,
				gap: options.gap,
			},
			options.core ?? core,
		);
	},
});
