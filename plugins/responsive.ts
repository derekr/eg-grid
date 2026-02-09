/**
 * Responsive Plugin
 *
 * Handles responsive column detection and CSS injection for different breakpoints.
 *
 * Responsibilities:
 * - Detect column count changes via ResizeObserver
 * - Inject CSS for all breakpoints using container queries
 * - Register 'columnCount' provider for other plugins
 * - Emit 'egg:column-count-change' events
 * - Regenerate CSS when layout model changes
 *
 * CSS is injected once on init and regenerated when the layout model changes.
 * The actual responsive layout switching is handled by CSS container queries.
 */

import type {
	ColumnCountChangeDetail,
	EggCore,
	ResponsivePluginOptions,
	StyleManager,
} from '../types';

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
 * @param core - Optional EggCore for provider registration
 * @returns Cleanup function to detach the plugin
 */
export function attachResponsive(
	gridElement: HTMLElement,
	options: ResponsivePluginOptions,
	core?: EggCore,
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
	}

	// Track if server-rendered CSS was detected
	// When true, we only inject CSS for explicit user overrides, not derived layouts
	const hasServerRenderedCSS = !!(styles?.get('base')?.trim());

	// Only inject CSS if base layer is empty (not server-rendered)
	// This prevents flash when server has already provided initial CSS
	if (!hasServerRenderedCSS) {
		injectCSS();
	}

	// Subscribe to layout model changes
	// The subscription only fires on user actions (saveLayout/clearOverride),
	// so we always inject CSS here - the initial hasServerRenderedCSS check
	// prevents injection on page load, this handles user interactions.
	const unsubscribe = layoutModel.subscribe(() => injectCSS());

	// Watch for resize to update column count tracking
	let lastColumnCount = layoutModel.currentColumnCount;

	const resizeObserver = new ResizeObserver(() => {
		const newColumnCount = detectColumnCount();

		if (newColumnCount !== lastColumnCount) {
			const previousCount = lastColumnCount;
			lastColumnCount = newColumnCount;

			// Update layout model
			layoutModel.setCurrentColumnCount(newColumnCount);

			gridElement.dispatchEvent(
				new CustomEvent('egg:column-count-change', {
					bubbles: true,
					detail: { previousCount, currentCount: newColumnCount },
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

