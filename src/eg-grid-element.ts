/**
 * <eg-grid> Web Component
 *
 * Progressive enhancement wrapper for EG Grid. The element IS the grid
 * container — no Shadow DOM (items need parent CSS, View Transitions are
 * document-scoped).
 *
 * Usage (zero JS required):
 *
 *   <style>
 *     [data-egg-item="item-a"] { grid-column: 1 / span 2; grid-row: 1; }
 *     [data-egg-item="item-b"] { grid-column: 3; grid-row: 1; }
 *   </style>
 *   <eg-grid columns="4" cell-size="120" gap="8" algorithm="push" resize-handles="all">
 *     <div data-egg-item="item-a">A</div>
 *     <div data-egg-item="item-b">B</div>
 *   </eg-grid>
 */

import type { EggCore, InitOptions, ResponsiveLayoutModel } from './eg-grid';
import { init } from './eg-grid';
import type { ItemDefinition, ItemPosition } from './layout-model';
import { createLayoutModel } from './layout-model';

let nextId = 0;

/**
 * Parse the span (width or height in cells) from grid-column/row start+end.
 * getComputedStyle returns: "auto", "3" (line number), or "span 2".
 */
function parseGridSpan(startStr: string, endStr: string): number {
	// "span 2" → 2
	const spanMatch = endStr.match(/span\s+(\d+)/);
	if (spanMatch) return parseInt(spanMatch[1]!, 10) || 1;
	// "3" with start "1" → 3 - 1 = 2
	const endNum = parseInt(endStr, 10);
	const startNum = parseInt(startStr, 10) || 1;
	if (!isNaN(endNum) && endNum > startNum) return endNum - startNum;
	// "auto" or anything else → 1
	return 1;
}

/**
 * Resolve an item element's ID for the layout model.
 *
 * Priority: data-egg-item > data-id > id
 * (data-egg-item="" means "is an item but no explicit ID", so skip empty strings)
 */
function resolveItemId(el: HTMLElement): string {
	return el.dataset.eggItem || el.dataset.id || el.id || '';
}

export class EgGridElement extends HTMLElement {
	static observedAttributes = [
		'columns',
		'cell-size',
		'gap',
		'algorithm',
		'resize-handles',
		'no-camera',
		'no-placeholder',
		'no-keyboard',
		'no-accessibility',
		'placeholder-class',
	];

	/** The EggCore instance. Available after connectedCallback. */
	core: EggCore | null = null;

	/** The responsive layout model (if columns + cell-size are set). */
	layoutModel: ResponsiveLayoutModel | null = null;

	private _styleEl: HTMLStyleElement | null = null;
	private _initialized = false;
	private _rafId = 0;
	private _observer: MutationObserver | null = null;

	connectedCallback(): void {
		if (this._initialized) return;
		this._init();
	}

	disconnectedCallback(): void {
		this._teardown();
	}

	attributeChangedCallback(): void {
		if (!this._initialized) return;
		this._teardown();
		this._init();
	}

	private _init(): void {
		this._initialized = true;

		// Ensure this element has an id (needed for CSS selectors like #my-grid)
		if (!this.id) {
			this.id = `egg-${++nextId}`;
		}

		// 1. Ensure this element is a grid container
		const computed = getComputedStyle(this);
		if (computed.display !== 'grid' && computed.display !== 'inline-grid') {
			this.style.display = 'grid';
		}

		// 2. Read attribute values
		const columnsAttr = this.getAttribute('columns');
		const gapAttr = this.getAttribute('gap');
		const cellSizeAttr = this.getAttribute('cell-size');
		const algorithmAttr = this.getAttribute('algorithm');
		const resizeHandlesAttr = this.getAttribute('resize-handles');

		const maxColumns = columnsAttr ? parseInt(columnsAttr, 10) || 4 : this._detectColumnCount();
		const cellSize = cellSizeAttr ? parseInt(cellSizeAttr, 10) || 120 : 0;
		const gap = gapAttr ? parseInt(gapAttr, 10) || 0 : parseFloat(computed.columnGap) || parseFloat(computed.gap) || 0;
		const responsive = cellSize > 0 && !!columnsAttr;

		// 3. Apply CSS shortcut attributes via inline styles.
		//    For responsive mode, grid-template-columns is set via container query CSS,
		//    not inline styles (inline styles can't be overridden by @container rules).
		//    For non-responsive, inline styles are fine.
		if (columnsAttr && !responsive) {
			const cols = parseInt(columnsAttr, 10);
			if (cols > 0) {
				this.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
			}
		}

		if (gapAttr) {
			this.style.gap = /^\d+$/.test(gapAttr) ? `${gapAttr}px` : gapAttr;
		}

		// 4. Container query context for responsive mode.
		//    @container queries match the nearest ancestor with containment, so the
		//    parent of <eg-grid> needs container-type, not <eg-grid> itself.
		if (responsive && this.parentElement) {
			this.parentElement.style.containerType = 'inline-size';
		}

		// 5. Create <style> element for CSS injection
		this._styleEl = document.createElement('style');
		this.prepend(this._styleEl);

		// 6. Auto-setup items — set tabindex, --item-id, derive span from CSS
		const items = this.querySelectorAll<HTMLElement>('[data-egg-item]');
		const itemDefs: ItemDefinition[] = [];
		const canonicalPositions = new Map<string, ItemPosition>();

		for (const item of items) {
			if (!item.hasAttribute('tabindex')) {
				item.setAttribute('tabindex', '0');
			}

			const id = resolveItemId(item);
			if (!id) continue;

			// Set --item-id for View Transitions
			item.style.setProperty('--item-id', id);

			// Read position and span from computed styles.
			// gridColumnEnd can be "auto", "3" (line number), or "span 2".
			// parseInt("span 2") → NaN, so we must parse span notation explicitly.
			const itemStyle = getComputedStyle(item);
			const colStart = parseInt(itemStyle.gridColumnStart, 10) || 1;
			const rowStart = parseInt(itemStyle.gridRowStart, 10) || 1;

			const cssWidth = parseGridSpan(itemStyle.gridColumnStart, itemStyle.gridColumnEnd);
			const cssHeight = parseGridSpan(itemStyle.gridRowStart, itemStyle.gridRowEnd);

			// Derive span: prefer data attribute, fall back to CSS
			const width = parseInt(item.getAttribute('data-egg-colspan') || '0', 10) || cssWidth;
			const height = parseInt(item.getAttribute('data-egg-rowspan') || '0', 10) || cssHeight;

			// Ensure data-egg-colspan/rowspan are set for algorithm's readItemsFromDOM
			// (during drag, item is position:fixed so CSS grid values aren't reliable)
			if (!item.hasAttribute('data-egg-colspan') && width > 1) {
				item.setAttribute('data-egg-colspan', String(width));
			}
			if (!item.hasAttribute('data-egg-rowspan') && height > 1) {
				item.setAttribute('data-egg-rowspan', String(height));
			}

			itemDefs.push({ id, width, height });
			canonicalPositions.set(id, { column: colStart, row: rowStart });
		}

		// 7. Pack items if no explicit CSS positions were set.
		//    When items lack grid-column/grid-row CSS, getComputedStyle returns "auto"
		//    which resolves to (1,1) for every item. Detect this overlap and run
		//    first-fit compaction so items don't stack on top of each other.
		if (canonicalPositions.size > 1) {
			const allOverlap = Array.from(canonicalPositions.values())
				.every(p => p.column === 1 && p.row === 1);
			if (allOverlap) {
				const occupied: (string | null)[][] = [];
				for (let r = 0; r < 100; r++) occupied.push(new Array(maxColumns).fill(null));
				for (const def of itemDefs) {
					const w = Math.min(def.width, maxColumns);
					const h = def.height;
					let placed = false;
					for (let row = 0; row < 100 && !placed; row++) {
						for (let col = 0; col <= maxColumns - w && !placed; col++) {
							let fits = true;
							for (let dy = 0; dy < h && fits; dy++)
								for (let dx = 0; dx < w && fits; dx++)
									if (occupied[row + dy]?.[col + dx] !== null) fits = false;
							if (fits) {
								canonicalPositions.set(def.id, { column: col + 1, row: row + 1 });
								for (let dy = 0; dy < h; dy++)
									for (let dx = 0; dx < w; dx++)
										if (occupied[row + dy]) occupied[row + dy]![col + dx] = def.id;
								placed = true;
							}
						}
					}
				}
			}
		}

		// 8. Build layout model
		if (itemDefs.length > 0) {
			this.layoutModel = createLayoutModel({
				maxColumns,
				minColumns: 1,
				items: itemDefs,
				canonicalPositions,
			});
		}

		// 9. Build InitOptions from attributes
		const options: InitOptions = {
			styleElement: this._styleEl,
			layoutModel: this.layoutModel ?? undefined,
			algorithm: algorithmAttr === 'none' ? false : (algorithmAttr === 'reorder' ? 'reorder' : 'push'),
			keyboard: this.hasAttribute('no-keyboard') ? false : undefined,
			accessibility: this.hasAttribute('no-accessibility') ? false : undefined,
			camera: this.hasAttribute('no-camera') ? false : undefined,
			placeholder: this.hasAttribute('no-placeholder')
				? false
				: this.getAttribute('placeholder-class')
					? { className: this.getAttribute('placeholder-class')! }
					: undefined,
			resize: resizeHandlesAttr
				? { handles: resizeHandlesAttr as 'corners' | 'edges' | 'all' }
				: false,
		};

		if (responsive && this.layoutModel) {
			options.responsive = {
				layoutModel: this.layoutModel,
				cellSize,
				gap,
			};
		}

		// 10. Initialize
		this.core = init(this, options);

		// 11. Set data-pointer-active (pointer is always enabled)
		this.setAttribute('data-pointer-active', '');

		// 12. MutationObserver for React compat (childList changes)
		this._observeChildren();
	}

	private _teardown(): void {
		if (!this._initialized) return;

		if (this._rafId) {
			cancelAnimationFrame(this._rafId);
			this._rafId = 0;
		}

		if (this._observer) {
			this._observer.disconnect();
			this._observer = null;
		}

		if (this.core) {
			this.core.destroy();
			this.core = null;
		}

		if (this._styleEl) {
			this._styleEl.remove();
			this._styleEl = null;
		}

		this.layoutModel = null;
		this._initialized = false;
	}

	private _observeChildren(): void {
		this._observer = new MutationObserver((mutations) => {
			// Only re-init when data-egg-item elements are added/removed.
			// Ignore internal DOM changes (style elements, placeholder, aria-live regions).
			let itemsChanged = false;
			for (const m of mutations) {
				for (const node of m.addedNodes) {
					if (node instanceof HTMLElement && node.hasAttribute('data-egg-item')) {
						itemsChanged = true;
					}
				}
				for (const node of m.removedNodes) {
					if (node instanceof HTMLElement && node.hasAttribute('data-egg-item')) {
						itemsChanged = true;
					}
				}
			}
			if (!itemsChanged) return;

			if (this._rafId) return;
			this._rafId = requestAnimationFrame(() => {
				this._rafId = 0;
				if (this.core?.phase === 'interacting') return;
				this._teardown();
				this._init();
			});
		});

		this._observer.observe(this, { childList: true });
	}

	private _detectColumnCount(): number {
		const style = getComputedStyle(this);
		const cols = style.gridTemplateColumns.split(' ').filter(Boolean);
		return Math.max(1, cols.length);
	}
}
