import { getItemCell, registerPlugin } from '../engine';
import type { GridCell, ItemPosition } from '../types';
import { isDragging, isResizing } from '../state-machine';

const DEBUG = false;
function log(...args: unknown[]) {
	if (DEBUG) console.log('[keyboard]', ...args);
}

registerPlugin({
	name: 'keyboard',
	init(core) {
		// Use state machine for all interaction state
		const { stateMachine } = core;

		// Track pending viewTransitionName restoration to avoid race conditions
		let pendingVtnRestore: { item: HTMLElement; timeoutId: number } | null = null;

		/**
		 * Helper to get current column count from grid
		 */
		const getColumnCount = (): number => {
			return core.getGridInfo().columns.length;
		};

		/**
		 * Helper to capture all item positions from DOM
		 */
		const capturePositions = (): Map<string, ItemPosition> => {
			const positions = new Map<string, ItemPosition>();
			const items = core.element.querySelectorAll('[data-gridiot-item]');
			for (const item of items) {
				const id = item.id || (item as HTMLElement).getAttribute('data-gridiot-item') || '';
				if (id) {
					const cell = getItemCell(item as HTMLElement);
					positions.set(id, { column: cell.column, row: cell.row });
				}
			}
			return positions;
		};

		/**
		 * Helper to capture all item sizes from DOM
		 */
		const captureSizes = (): Map<string, { width: number; height: number }> => {
			const sizes = new Map<string, { width: number; height: number }>();
			const items = core.element.querySelectorAll('[data-gridiot-item]');
			for (const item of items) {
				const el = item as HTMLElement;
				const id = el.id || el.getAttribute('data-gridiot-item') || '';
				if (id) {
					const width = parseInt(el.getAttribute('data-gridiot-colspan') || '1', 10) || 1;
					const height = parseInt(el.getAttribute('data-gridiot-rowspan') || '1', 10) || 1;
					sizes.set(id, { width, height });
				}
			}
			return sizes;
		};

		/**
		 * Check if currently holding an item (keyboard drag in progress)
		 */
		const isHoldingItem = (): boolean => {
			const state = stateMachine.getState();
			return isDragging(state) && state.interaction?.mode === 'keyboard';
		};

		/**
		 * Get the held item element from state machine
		 */
		const getHeldItem = (): HTMLElement | null => {
			const state = stateMachine.getState();
			if (isDragging(state) && state.interaction?.mode === 'keyboard') {
				return state.interaction.element;
			}
			return null;
		};

		/**
		 * Get direction from key, supporting both arrows and vim-style hjkl.
		 * Uses both e.key and e.code to handle Alt+hjkl on Mac (Alt produces special chars).
		 */
		const getDirection = (
			key: string,
			code: string,
		): 'up' | 'down' | 'left' | 'right' | null => {
			switch (key) {
				case 'ArrowUp':
					return 'up';
				case 'ArrowDown':
					return 'down';
				case 'ArrowLeft':
					return 'left';
				case 'ArrowRight':
					return 'right';
				case 'k':
				case 'K':
					return 'up';
				case 'j':
				case 'J':
					return 'down';
				case 'h':
				case 'H':
					return 'left';
				case 'l':
				case 'L':
					return 'right';
			}
			// Fallback to code for Alt+hjkl on Mac (Alt produces special characters)
			switch (code) {
				case 'KeyK':
					return 'up';
				case 'KeyJ':
					return 'down';
				case 'KeyH':
					return 'left';
				case 'KeyL':
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
			// Toggle keyboard mode with Shift+G (G for Grid)
			if (e.key === 'G' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
				e.preventDefault();
				stateMachine.transition({ type: 'TOGGLE_KEYBOARD_MODE' });
				const keyboardMode = stateMachine.getState().keyboardModeActive;
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
			const keyboardMode = stateMachine.getState().keyboardModeActive;
			if (!keyboardMode && !focusInGrid && !hasSelection) return;

			const selectedItem = core.selectedItem;
			const direction = getDirection(e.key, e.code);

			// Cancel drag or deselect with Escape
			if (e.key === 'Escape') {
				e.preventDefault();
				const heldItem = getHeldItem();
				if (heldItem) {
					heldItem.removeAttribute('data-gridiot-dragging');
					core.emit('drag-cancel', { item: heldItem });
					stateMachine.transition({ type: 'CANCEL_INTERACTION' });
				} else if (selectedItem) {
					core.deselect();
				}
				// Turn off keyboard mode if it's active
				if (stateMachine.getState().keyboardModeActive) {
					stateMachine.transition({ type: 'TOGGLE_KEYBOARD_MODE' });
				}
				core.element.removeAttribute('data-gridiot-keyboard-mode');
				return;
			}

			// Pick up / drop with Enter or Space
			if (e.key === 'Enter' || e.key === ' ') {
				if (!selectedItem) return;
				e.preventDefault();

				const heldItem = getHeldItem();
				if (heldItem) {
					// Drop the held item - use target cell from state machine
					const state = stateMachine.getState();
					const targetCell = state.interaction?.targetCell ?? getItemCell(heldItem);
					const size = getItemSize(heldItem);
					heldItem.removeAttribute('data-gridiot-dragging');
					core.emit('drag-end', { item: heldItem, cell: targetCell, colspan: size.colspan, rowspan: size.rowspan });
					stateMachine.transition({ type: 'COMMIT_INTERACTION' });
					stateMachine.transition({ type: 'FINISH_COMMIT' });
					log('drop', { cell: targetCell });
				} else {
					// Pick up the selected item
					const itemId = selectedItem.id || selectedItem.getAttribute('data-gridiot-item') || '';
					const size = getItemSize(selectedItem);
					const startCell = getItemCell(selectedItem);

					// Start interaction via state machine
					stateMachine.transition({
						type: 'START_INTERACTION',
						context: {
							type: 'drag',
							mode: 'keyboard',
							itemId,
							element: selectedItem,
							columnCount: getColumnCount(),
							originalPositions: capturePositions(),
							originalSizes: captureSizes(),
							targetCell: startCell,
							currentSize: { colspan: size.colspan, rowspan: size.rowspan },
						},
					});

					selectedItem.setAttribute('data-gridiot-dragging', '');
					core.emit('drag-start', { item: selectedItem, cell: startCell, colspan: size.colspan, rowspan: size.rowspan });
					log('pick up');
				}
				return;
			}

			// Navigation keys
			if (direction) {
				e.preventDefault();

				// Alt+nav: Select adjacent item
				if (e.altKey && !e.ctrlKey && !e.shiftKey && selectedItem) {
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

				// Shift+nav: Resize item (change colspan/rowspan)
				if (e.shiftKey && !e.ctrlKey && !e.altKey) {
					let newColspan = itemSize.colspan;
					let newRowspan = itemSize.rowspan;

					// Calculate new size based on direction
					switch (direction) {
						case 'right':
							newColspan = Math.min(itemSize.colspan + 1, gridInfo.columns.length - currentCell.column + 1);
							break;
						case 'left':
							newColspan = Math.max(1, itemSize.colspan - 1);
							break;
						case 'down':
							newRowspan = itemSize.rowspan + 1; // No max for rows (grid auto-grows)
							break;
						case 'up':
							newRowspan = Math.max(1, itemSize.rowspan - 1);
							break;
					}

					// Skip if size didn't change (already at limit)
					if (newColspan === itemSize.colspan && newRowspan === itemSize.rowspan) {
						return;
					}

					// Cancel any pending viewTransitionName restoration
					if (pendingVtnRestore) {
						clearTimeout(pendingVtnRestore.timeoutId);
						pendingVtnRestore.item.style.removeProperty('view-transition-name');
						pendingVtnRestore = null;
					}

					const itemId = selectedItem.id || selectedItem.getAttribute('data-gridiot-item') || '';

					// Start resize interaction via state machine
					stateMachine.transition({
						type: 'START_INTERACTION',
						context: {
							type: 'resize',
							mode: 'keyboard',
							itemId,
							element: selectedItem,
							columnCount: getColumnCount(),
							originalPositions: capturePositions(),
							originalSizes: captureSizes(),
							targetCell: currentCell,
							currentSize: { colspan: newColspan, rowspan: newRowspan },
						},
					});

					// Mark item as resizing so CSS can disable its View Transition animation
					// (matches pointer resize behavior - item snaps, others animate)
					(selectedItem.style as any).viewTransitionName = 'resizing';

					// Emit resize events for algorithm and other plugins to handle
					// Use 'se' handle for increases, appropriate edge for decreases
					const handle = direction === 'right' || direction === 'down' ? 'se' :
					               direction === 'left' ? 'w' : 'n';

					core.emit('resize-start', {
						item: selectedItem,
						cell: currentCell,
						colspan: itemSize.colspan,
						rowspan: itemSize.rowspan,
						handle,
					});

					// Update item data attributes (algorithm reads these for size)
					selectedItem.setAttribute('data-gridiot-colspan', String(newColspan));
					selectedItem.setAttribute('data-gridiot-rowspan', String(newRowspan));

					// Don't set inline grid styles - let algorithm handle layout via CSS rules
					// This allows View Transitions to animate other items smoothly

					core.emit('resize-end', {
						item: selectedItem,
						cell: currentCell,
						colspan: newColspan,
						rowspan: newRowspan,
					});

					// Complete the interaction via state machine
					stateMachine.transition({ type: 'COMMIT_INTERACTION' });
					stateMachine.transition({ type: 'FINISH_COMMIT' });

					// Restore viewTransitionName after View Transition completes (200ms)
					// Track the timeout so we can cancel it if another resize starts
					const itemToRestore = selectedItem;
					const timeoutId = window.setTimeout(() => {
						itemToRestore.style.removeProperty('view-transition-name');
						if (pendingVtnRestore?.item === itemToRestore) {
							pendingVtnRestore = null;
						}
					}, 250);
					pendingVtnRestore = { item: itemToRestore, timeoutId };

					log('resize', { direction, newColspan, newRowspan });
					return;
				}

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

				const heldItem = getHeldItem();
				if (heldItem) {
					// Moving a held item - update state machine with new target
					stateMachine.transition({
						type: 'UPDATE_INTERACTION',
						targetCell,
					});
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
