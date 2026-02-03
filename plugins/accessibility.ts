import { registerPlugin } from '../engine';
import type {
	DragCancelDetail,
	DragEndDetail,
	DragMoveDetail,
	DragStartDetail,
	GridCell,
} from '../types';

registerPlugin({
	name: 'accessibility',
	init(core) {
		// Create live region for screen reader announcements
		const liveRegion = document.createElement('div');
		liveRegion.setAttribute('aria-live', 'assertive');
		liveRegion.setAttribute('aria-atomic', 'true');
		// Visually hidden but accessible to screen readers
		Object.assign(liveRegion.style, {
			position: 'absolute',
			width: '1px',
			height: '1px',
			padding: '0',
			margin: '-1px',
			overflow: 'hidden',
			clip: 'rect(0, 0, 0, 0)',
			whiteSpace: 'nowrap',
			border: '0',
		});
		core.element.appendChild(liveRegion);

		let lastCell: GridCell | null = null;

		function announce(message: string) {
			// Clear and re-set to force re-announcement
			liveRegion.textContent = '';
			requestAnimationFrame(() => {
				liveRegion.textContent = message;
			});
		}

		function getLabel(item: HTMLElement): string {
			return (
				item.getAttribute('data-gridiot-label') ||
				item.getAttribute('aria-label') ||
				item.id ||
				'Item'
			);
		}

		function formatPosition(cell: GridCell): string {
			return `row ${cell.row}, column ${cell.column}`;
		}

		function getAnnouncement(
			item: HTMLElement,
			event: 'grab' | 'move' | 'drop' | 'cancel',
			cell?: GridCell,
		): string {
			const label = getLabel(item);
			const pos = cell ? formatPosition(cell) : '';

			// Check for custom template on the item
			const itemTemplate = item.getAttribute(`data-gridiot-announce-${event}`);
			if (itemTemplate) {
				return itemTemplate
					.replace('{label}', label)
					.replace('{row}', String(cell?.row ?? ''))
					.replace('{column}', String(cell?.column ?? ''));
			}

			// Check for custom template on the grid container
			const gridTemplate = core.element.getAttribute(
				`data-gridiot-announce-${event}`,
			);
			if (gridTemplate) {
				return gridTemplate
					.replace('{label}', label)
					.replace('{row}', String(cell?.row ?? ''))
					.replace('{column}', String(cell?.column ?? ''));
			}

			// Default announcements
			switch (event) {
				case 'grab':
					return `${label} grabbed. Position ${pos}. Use arrow keys to move, Enter to drop, Escape to cancel.`;
				case 'move':
					return `Moved to ${pos}.`;
				case 'drop':
					return `${label} dropped at ${pos}.`;
				case 'cancel':
					return `${label} drag cancelled.`;
			}
		}

		const onDragStart = (e: CustomEvent<DragStartDetail>) => {
			lastCell = e.detail.cell;
			announce(getAnnouncement(e.detail.item, 'grab', e.detail.cell));
		};

		const onDragMove = (e: CustomEvent<DragMoveDetail>) => {
			// Only announce if cell actually changed
			const { cell } = e.detail;
			if (
				lastCell &&
				cell.row === lastCell.row &&
				cell.column === lastCell.column
			) {
				return;
			}
			lastCell = cell;
			announce(getAnnouncement(e.detail.item, 'move', cell));
		};

		const onDragEnd = (e: CustomEvent<DragEndDetail>) => {
			lastCell = null;
			announce(getAnnouncement(e.detail.item, 'drop', e.detail.cell));
		};

		const onDragCancel = (e: CustomEvent<DragCancelDetail>) => {
			lastCell = null;
			announce(getAnnouncement(e.detail.item, 'cancel'));
		};

		core.element.addEventListener(
			'gridiot:drag-start',
			onDragStart as EventListener,
		);
		core.element.addEventListener(
			'gridiot:drag-move',
			onDragMove as EventListener,
		);
		core.element.addEventListener(
			'gridiot:drag-end',
			onDragEnd as EventListener,
		);
		core.element.addEventListener(
			'gridiot:drag-cancel',
			onDragCancel as EventListener,
		);

		return () => {
			core.element.removeEventListener(
				'gridiot:drag-start',
				onDragStart as EventListener,
			);
			core.element.removeEventListener(
				'gridiot:drag-move',
				onDragMove as EventListener,
			);
			core.element.removeEventListener(
				'gridiot:drag-end',
				onDragEnd as EventListener,
			);
			core.element.removeEventListener(
				'gridiot:drag-cancel',
				onDragCancel as EventListener,
			);
			liveRegion.remove();
		};
	},
});
