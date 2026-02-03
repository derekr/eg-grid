import { getItemCell, registerPlugin } from '../engine';
import type { GridCell } from '../types';

const DEBUG = false;
function log(...args: unknown[]) {
	if (DEBUG) console.log('[keyboard]', ...args);
}

registerPlugin({
	name: 'keyboard',
	init(core) {
		let keyboardMode = false;
		let heldItem: HTMLElement | null = null;

		/**
		 * Get direction from key, supporting both arrows and vim-style hjkl
		 */
		const getDirection = (
			key: string,
		): 'up' | 'down' | 'left' | 'right' | null => {
			switch (key) {
				case 'ArrowUp':
				case 'k':
					return 'up';
				case 'ArrowDown':
				case 'j':
					return 'down';
				case 'ArrowLeft':
				case 'h':
					return 'left';
				case 'ArrowRight':
				case 'l':
					return 'right';
				default:
					return null;
			}
		};

		/**
		 * Get adjacent cell in a direction
		 */
		const getAdjacentCell = (
			cell: GridCell,
			direction: 'up' | 'down' | 'left' | 'right',
			amount = 1,
		): GridCell => {
			switch (direction) {
				case 'up':
					return { ...cell, row: Math.max(1, cell.row - amount) };
				case 'down':
					return { ...cell, row: cell.row + amount };
				case 'left':
					return { ...cell, column: Math.max(1, cell.column - amount) };
				case 'right':
					return { ...cell, column: cell.column + amount };
			}
		};

		/**
		 * Find the item at or closest to a cell position in a direction
		 */
		const findItemInDirection = (
			fromCell: GridCell,
			direction: 'up' | 'down' | 'left' | 'right',
			excludeItem: HTMLElement,
		): HTMLElement | null => {
			const items = Array.from(
				core.element.querySelectorAll('[data-gridiot-item]'),
			) as HTMLElement[];

			let bestItem: HTMLElement | null = null;
			let bestDistance = Infinity;

			for (const item of items) {
				if (item === excludeItem) continue;

				const cell = getItemCell(item);
				let distance: number;
				let isInDirection: boolean;

				switch (direction) {
					case 'up':
						isInDirection = cell.row < fromCell.row;
						distance = fromCell.row - cell.row + Math.abs(cell.column - fromCell.column) * 0.1;
						break;
					case 'down':
						isInDirection = cell.row > fromCell.row;
						distance = cell.row - fromCell.row + Math.abs(cell.column - fromCell.column) * 0.1;
						break;
					case 'left':
						isInDirection = cell.column < fromCell.column;
						distance = fromCell.column - cell.column + Math.abs(cell.row - fromCell.row) * 0.1;
						break;
					case 'right':
						isInDirection = cell.column > fromCell.column;
						distance = cell.column - fromCell.column + Math.abs(cell.row - fromCell.row) * 0.1;
						break;
				}

				if (isInDirection && distance < bestDistance) {
					bestDistance = distance;
					bestItem = item;
				}
			}

			return bestItem;
		};

		/**
		 * Get the size of an item for jump calculations
		 */
		const getItemSize = (item: HTMLElement): { colspan: number; rowspan: number } => {
			return {
				colspan: parseInt(item.getAttribute('data-gridiot-colspan') || '1', 10) || 1,
				rowspan: parseInt(item.getAttribute('data-gridiot-rowspan') || '1', 10) || 1,
			};
		};

		const onKeyDown = (e: KeyboardEvent) => {
			// Toggle keyboard mode with Shift+K
			if (e.key === 'K' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
				e.preventDefault();
				keyboardMode = !keyboardMode;
				log('keyboard mode:', keyboardMode);

				if (keyboardMode) {
					core.element.setAttribute('data-gridiot-keyboard-mode', '');
					// If no item is selected, select the first one
					if (!core.selectedItem) {
						const firstItem = core.element.querySelector('[data-gridiot-item]') as HTMLElement | null;
						if (firstItem) {
							core.select(firstItem);
						}
					}
				} else {
					core.element.removeAttribute('data-gridiot-keyboard-mode');
				}
				return;
			}

			// All other keyboard shortcuts require keyboard mode, selected item, or focus inside grid
			const focused = document.activeElement as HTMLElement | null;
			const focusInGrid = focused && core.element.contains(focused);
			const hasSelection = core.selectedItem !== null;
			if (!keyboardMode && !focusInGrid && !hasSelection) return;

			const selectedItem = core.selectedItem;
			const direction = getDirection(e.key);

			// Cancel drag or deselect with Escape
			if (e.key === 'Escape') {
				e.preventDefault();
				if (heldItem) {
					heldItem.removeAttribute('data-gridiot-dragging');
					core.emit('drag-cancel', { item: heldItem });
					heldItem = null;
				} else if (selectedItem) {
					core.deselect();
				}
				keyboardMode = false;
				core.element.removeAttribute('data-gridiot-keyboard-mode');
				return;
			}

			// Pick up / drop with Enter or Space
			if (e.key === 'Enter' || e.key === ' ') {
				if (!selectedItem) return;
				e.preventDefault();

				if (heldItem) {
					// Drop the held item
					const cell = getItemCell(heldItem);
					const size = getItemSize(heldItem);
					heldItem.removeAttribute('data-gridiot-dragging');
					core.emit('drag-end', { item: heldItem, cell, colspan: size.colspan, rowspan: size.rowspan });
					log('drop', { cell });
					heldItem = null;
				} else {
					// Pick up the selected item
					heldItem = selectedItem;
					const size = getItemSize(heldItem);
					heldItem.setAttribute('data-gridiot-dragging', '');
					core.emit('drag-start', { item: heldItem, cell: getItemCell(heldItem), colspan: size.colspan, rowspan: size.rowspan });
					log('pick up');
				}
				return;
			}

			// Navigation keys
			if (direction) {
				e.preventDefault();

				// Alt+nav: Select adjacent item
				if (e.altKey && !e.ctrlKey && selectedItem) {
					const fromCell = getItemCell(selectedItem);
					const adjacentItem = findItemInDirection(fromCell, direction, selectedItem);
					if (adjacentItem) {
						core.select(adjacentItem);
						log('select adjacent', direction);
					}
					return;
				}

				// Must have a selected item for other nav actions
				if (!selectedItem) return;

				const currentCell = getItemCell(selectedItem);
				const itemSize = getItemSize(selectedItem);
				const gridInfo = core.getGridInfo();

				// Calculate move amount
				let amount = 1;
				if (e.ctrlKey || e.metaKey) {
					// Ctrl+nav: Jump by item size
					amount = direction === 'up' || direction === 'down'
						? itemSize.rowspan
						: itemSize.colspan;
				}

				const rawCell = getAdjacentCell(currentCell, direction, amount);

				// Clamp cell so item fits within grid bounds
				const maxColumn = Math.max(1, gridInfo.columns.length - itemSize.colspan + 1);
				const maxRow = Math.max(1, gridInfo.rows.length - itemSize.rowspan + 1);
				const targetCell = {
					column: Math.max(1, Math.min(maxColumn, rawCell.column)),
					row: Math.max(1, Math.min(maxRow, rawCell.row)),
				};

				// Skip if clamped position is same as current (at edge, can't move further)
				if (targetCell.column === currentCell.column && targetCell.row === currentCell.row) {
					return;
				}

				if (heldItem) {
					// Moving a held item
					core.emit('drag-move', { item: heldItem, cell: targetCell, x: 0, y: 0, colspan: itemSize.colspan, rowspan: itemSize.rowspan });
					log('move', { direction, amount, targetCell });
				} else {
					// Nudge: Move item directly
					// Emit drag-start then drag-end (skip drag-move since we don't need preview)
					core.emit('drag-start', { item: selectedItem, cell: currentCell, colspan: itemSize.colspan, rowspan: itemSize.rowspan });
					core.emit('drag-end', { item: selectedItem, cell: targetCell, colspan: itemSize.colspan, rowspan: itemSize.rowspan });
					log('nudge', { direction, amount, targetCell });
				}
				return;
			}
		};

		document.addEventListener('keydown', onKeyDown);

		return () => {
			document.removeEventListener('keydown', onKeyDown);
			core.element.removeAttribute('data-gridiot-keyboard-mode');
		};
	},
});
