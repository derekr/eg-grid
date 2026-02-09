import { getItemCell, getItemSize } from '../engine';
import type { GridCell, EggCore } from '../types';
import { animateFLIPWithTracking } from '../utils/flip';

// Hysteresis: distance in grid units before changing target cell
const HYSTERESIS = 0.4;
// Minimum time (ms) between target changes to prevent jitter
const TARGET_CHANGE_DEBOUNCE = 40;
// Minimum pixels of movement before starting a drag
const DRAG_THRESHOLD = 5;
// Minimum pixels of cumulative movement before applying predictive offset
const PREDICTION_THRESHOLD = 30;
// Fraction of cell to lead ahead when prediction is active (0.5 = half a cell)
const PREDICTION_LEAD = 0.5;

interface PendingDrag {
	item: HTMLElement;
	pointerId: number;
	startX: number;
	startY: number;
	rect: DOMRect;
	startCell: GridCell;
	colspan: number;
	rowspan: number;
}

interface DragState {
	item: HTMLElement;
	pointerId: number;
	offsetX: number;
	offsetY: number;
	initialRect: DOMRect;
	startCell: GridCell;
	lastCell: GridCell;
	lastTargetChangeTime: number;
	colspan: number;
	rowspan: number;
	// For predictive placeholder
	dragStartX: number;
	dragStartY: number;
}

/**
 * Attach pointer (mouse/touch) drag handling to a EggCore instance.
 * @returns Cleanup function
 */
export function attachPointer(core: EggCore): () => void {
	let pendingDrag: PendingDrag | null = null;
	let dragState: DragState | null = null;

	const startDrag = (pending: PendingDrag, e: PointerEvent) => {
		const { item, pointerId, rect, startCell, colspan, rowspan } = pending;

		dragState = {
			item,
			pointerId,
			offsetX: e.clientX - rect.left,
			offsetY: e.clientY - rect.top,
			initialRect: rect,
			startCell,
			lastCell: startCell,
			lastTargetChangeTime: 0,
			colspan,
			rowspan,
			dragStartX: e.clientX,
			dragStartY: e.clientY,
		};

		item.setAttribute('data-egg-dragging', '');
		document.body.classList.add('is-dragging');

		// Transition state machine to interacting
		const itemId = item.id || item.getAttribute('data-egg-item') || '';
		core.stateMachine.transition({
			type: 'START_INTERACTION',
			context: { type: 'drag', mode: 'pointer', itemId, element: item, columnCount: core.getGridInfo().columns.length },
		});

		// Emit drag-start BEFORE changing grid styles so originalPositions captures correct layout
		core.emit('drag-start', { item, cell: startCell, colspan, rowspan, source: 'pointer' as const });

		// Switch to fixed positioning - CSS Grid ignores fixed positioned children
		// No need to move item out of grid container
		item.style.position = 'fixed';
		item.style.left = `${rect.left}px`;
		item.style.top = `${rect.top}px`;
		item.style.width = `${rect.width}px`;
		item.style.height = `${rect.height}px`;
		item.style.zIndex = '100';

		pendingDrag = null;
	};

	const onPointerDown = (e: PointerEvent) => {
		const item = (e.target as HTMLElement).closest(
			'[data-egg-item]',
		) as HTMLElement | null;
		if (!item) return;

		// Select the item on click
		core.select(item);

		// Prevent text selection during potential drag
		e.preventDefault();

		const rect = item.getBoundingClientRect();
		const startCell = getItemCell(item);
		const { colspan, rowspan } = getItemSize(item);

		// Store pending drag state - don't start drag until movement
		pendingDrag = {
			item,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			rect,
			startCell,
			colspan,
			rowspan,
		};

		item.setPointerCapture(e.pointerId);
		item.addEventListener('pointermove', onPointerMove);
		item.addEventListener('pointerup', onPointerUp);
		item.addEventListener('pointercancel', onPointerCancel);
	};

	const onPointerMove = (e: PointerEvent) => {
		// Check if we need to start dragging
		if (pendingDrag && !dragState) {
			const dx = e.clientX - pendingDrag.startX;
			const dy = e.clientY - pendingDrag.startY;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance >= DRAG_THRESHOLD) {
				startDrag(pendingDrag, e);
			} else {
				return; // Not enough movement yet
			}
		}

		if (!dragState) return;

		const { item, offsetX, offsetY, initialRect, colspan, rowspan } = dragState;

		// Move item with cursor
		const newLeft = e.clientX - offsetX;
		const newTop = e.clientY - offsetY;
		item.style.left = `${newLeft}px`;
		item.style.top = `${newTop}px`;

		// Calculate target based on card center (feels more natural for multi-cell items)
		let cardCenterX = newLeft + initialRect.width / 2;
		let cardCenterY = newTop + initialRect.height / 2;

		// Predictive offset: shift the effective center in the direction of movement
		const gridInfo = core.getGridInfo();
		const cumulativeDx = e.clientX - dragState.dragStartX;
		const cumulativeDy = e.clientY - dragState.dragStartY;

		// Apply prediction offset when movement exceeds threshold
		if (Math.abs(cumulativeDx) > PREDICTION_THRESHOLD) {
			const leadOffset = PREDICTION_LEAD * (gridInfo.cellWidth + gridInfo.gap);
			cardCenterX += Math.sign(cumulativeDx) * leadOffset;
		}
		if (Math.abs(cumulativeDy) > PREDICTION_THRESHOLD) {
			const leadOffset = PREDICTION_LEAD * (gridInfo.cellHeight + gridInfo.gap);
			cardCenterY += Math.sign(cumulativeDy) * leadOffset;
		}

		const rawCell = core.getCellFromPoint(cardCenterX, cardCenterY);
		if (rawCell) {
			// Clamp cell so item fits within grid bounds
			const gridInfo = core.getGridInfo();
			const maxColumn = Math.max(1, gridInfo.columns.length - colspan + 1);
			const maxRow = Math.max(1, gridInfo.rows.length - rowspan + 1);

			const cell: GridCell = {
				column: Math.max(1, Math.min(maxColumn, rawCell.column)),
				row: Math.max(1, Math.min(maxRow, rawCell.row)),
			};

			const now = performance.now();
			const timeSinceLastChange = now - dragState.lastTargetChangeTime;

			// Check if cell actually changed
			const cellChanged =
				cell.column !== dragState.lastCell.column ||
				cell.row !== dragState.lastCell.row;

			if (cellChanged && timeSinceLastChange >= TARGET_CHANGE_DEBOUNCE) {
				const cellWidth = gridInfo.cellWidth + gridInfo.gap;
				const cellHeight = gridInfo.cellHeight + gridInfo.gap;

				// Current cell center in pixels (CSS Grid is 1-indexed)
				const currentCellCenterX =
					gridInfo.rect.left +
					(dragState.lastCell.column - 1) * cellWidth +
					gridInfo.cellWidth / 2;
				const currentCellCenterY =
					gridInfo.rect.top +
					(dragState.lastCell.row - 1) * cellHeight +
					gridInfo.cellHeight / 2;

				// Signed distance from card center to current cell center (in grid units)
				const offsetFromCellX = (cardCenterX - currentCellCenterX) / cellWidth;
				const offsetFromCellY = (cardCenterY - currentCellCenterY) / cellHeight;

				// Direction-aware hysteresis
				const newCellIsRight = cell.column > dragState.lastCell.column;
				const newCellIsBelow = cell.row > dragState.lastCell.row;
				const cardIsRight = offsetFromCellX > 0;
				const cardIsBelow = offsetFromCellY > 0;

				const alignedX = (newCellIsRight && cardIsRight) || (!newCellIsRight && !cardIsRight);
				const alignedY = (newCellIsBelow && cardIsBelow) || (!newCellIsBelow && !cardIsBelow);

				const thresholdX = alignedX ? 0.5 : 0.5 + HYSTERESIS;
				const thresholdY = alignedY ? 0.5 : 0.5 + HYSTERESIS;

				const distX = Math.abs(offsetFromCellX);
				const distY = Math.abs(offsetFromCellY);

				if (distX < thresholdX && distY < thresholdY) {
					return; // Stay in current cell
				}

				dragState.lastCell = cell;
				dragState.lastTargetChangeTime = now;
				core.emit('drag-move', { item, cell, x: e.clientX, y: e.clientY, colspan, rowspan, source: 'pointer' as const });
			}
		}
	};

	const onPointerUp = (e: PointerEvent) => {
		const item = pendingDrag?.item || dragState?.item;
		if (!item) return;

		// If drag never started, this was just a click - nothing more to do
		if (pendingDrag && !dragState) {
			cleanupListeners(item, pendingDrag.pointerId);
			pendingDrag = null;
			return;
		}

		if (!dragState) return;

		const { initialRect, colspan, rowspan, lastCell, offsetX, offsetY, dragStartX, dragStartY } = dragState;

		// Calculate drop position with same predictive offset as drag-move
		const gridInfo = core.getGridInfo();
		const cumulativeDx = e.clientX - dragStartX;
		const cumulativeDy = e.clientY - dragStartY;

		// Apply prediction offset to get effective center for cell calculation
		const newLeft = e.clientX - offsetX;
		const newTop = e.clientY - offsetY;
		let effectiveCenterX = newLeft + initialRect.width / 2;
		let effectiveCenterY = newTop + initialRect.height / 2;

		if (Math.abs(cumulativeDx) > PREDICTION_THRESHOLD) {
			const leadOffset = PREDICTION_LEAD * (gridInfo.cellWidth + gridInfo.gap);
			effectiveCenterX += Math.sign(cumulativeDx) * leadOffset;
		}
		if (Math.abs(cumulativeDy) > PREDICTION_THRESHOLD) {
			const leadOffset = PREDICTION_LEAD * (gridInfo.cellHeight + gridInfo.gap);
			effectiveCenterY += Math.sign(cumulativeDy) * leadOffset;
		}

		const rawCell = core.getCellFromPoint(effectiveCenterX, effectiveCenterY);

		// FLIP: Capture current visual position (First)
		const firstRect = item.getBoundingClientRect();

		// Transition to committing before algorithm processes drag-end
		core.stateMachine.transition({ type: 'COMMIT_INTERACTION' });

		// Emit event BEFORE cleanup so algorithm can set final position
		if (rawCell) {
			const maxColumn = Math.max(1, gridInfo.columns.length - colspan + 1);
			const maxRow = Math.max(1, gridInfo.rows.length - rowspan + 1);

			const cell: GridCell = {
				column: Math.max(1, Math.min(maxColumn, rawCell.column)),
				row: Math.max(1, Math.min(maxRow, rawCell.row)),
			};

			core.emit('drag-end', { item, cell, colspan, rowspan, source: 'pointer' as const });
		} else {
			core.emit('drag-end', { item, cell: lastCell, colspan, rowspan, source: 'pointer' as const });
		}

		cleanup();

		// Commit complete
		core.stateMachine.transition({ type: 'FINISH_COMMIT' });

		// FLIP: Animate from visual position to final grid position
		requestAnimationFrame(() => {
			animateFLIPWithTracking(item, firstRect);
		});
	};

	const onPointerCancel = () => {
		const item = pendingDrag?.item || dragState?.item;
		if (!item) return;

		if (dragState) {
			core.emit('drag-cancel', { item, source: 'pointer' as const });
			core.stateMachine.transition({ type: 'CANCEL_INTERACTION' });
		}
		cleanup();
	};

	const cleanupListeners = (item: HTMLElement, pointerId: number) => {
		item.releasePointerCapture(pointerId);
		item.removeEventListener('pointermove', onPointerMove);
		item.removeEventListener('pointerup', onPointerUp);
		item.removeEventListener('pointercancel', onPointerCancel);
	};

	const cleanup = () => {
		if (dragState) {
			const { item, pointerId } = dragState;

			item.removeAttribute('data-egg-dragging');
			document.body.classList.remove('is-dragging');
			item.style.position = '';
			item.style.left = '';
			item.style.top = '';
			item.style.width = '';
			item.style.height = '';
			item.style.zIndex = '';

			cleanupListeners(item, pointerId);
			dragState = null;
		}

		if (pendingDrag) {
			cleanupListeners(pendingDrag.item, pendingDrag.pointerId);
			pendingDrag = null;
		}
	};

	// Deselect when clicking outside the grid
	const onDocumentPointerDown = (e: PointerEvent) => {
		if (core.element.contains(e.target as Node)) return;
		if (dragState) return;
		core.deselect();
	};

	core.element.addEventListener('pointerdown', onPointerDown);
	document.addEventListener('pointerdown', onDocumentPointerDown);

	return () => {
		core.element.removeEventListener('pointerdown', onPointerDown);
		document.removeEventListener('pointerdown', onDocumentPointerDown);
		cleanup();
	};
}
