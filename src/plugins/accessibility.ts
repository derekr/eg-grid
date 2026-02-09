import { listenEvents } from '../engine';
import type {
	DragCancelDetail,
	DragEndDetail,
	DragMoveDetail,
	DragStartDetail,
	GridCell,
	EggCore,
	ResizeCancelDetail,
	ResizeEndDetail,
	ResizeMoveDetail,
	ResizeStartDetail,
} from '../types';

export function attachAccessibility(core: EggCore): () => void {
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
	let lastResizeSize: { colspan: number; rowspan: number } | null = null;

	function announce(message: string) {
		// Clear and re-set to force re-announcement
		liveRegion.textContent = '';
		requestAnimationFrame(() => {
			liveRegion.textContent = message;
		});
	}

	function getLabel(item: HTMLElement): string {
		return (
			item.getAttribute('data-egg-label') ||
			item.getAttribute('aria-label') ||
			item.id ||
			'Item'
		);
	}

	function formatPosition(cell: GridCell): string {
		return `row ${cell.row}, column ${cell.column}`;
	}

	function resolveTemplate(
		item: HTMLElement,
		event: string,
		vars: Record<string, string>,
		fallback: string,
	): string {
		const template =
			item.getAttribute(`data-egg-announce-${event}`) ||
			core.element.getAttribute(`data-egg-announce-${event}`);
		if (!template) return fallback;
		return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
	}

	function getAnnouncement(
		item: HTMLElement,
		event: 'grab' | 'move' | 'drop' | 'cancel',
		cell?: GridCell,
	): string {
		const label = getLabel(item);
		const pos = cell ? formatPosition(cell) : '';
		const vars = { label, row: String(cell?.row ?? ''), column: String(cell?.column ?? '') };

		const defaults: Record<string, string> = {
			grab: `${label} grabbed. Position ${pos}. Use arrow keys to move, Enter to drop, Escape to cancel.`,
			move: `Moved to ${pos}.`,
			drop: `${label} dropped at ${pos}.`,
			cancel: `${label} drag cancelled.`,
		};
		return resolveTemplate(item, event, vars, defaults[event]);
	}

	function getResizeAnnouncement(
		item: HTMLElement,
		event: 'resize-start' | 'resize-move' | 'resize-end' | 'resize-cancel',
		opts?: { cell?: GridCell; colspan?: number; rowspan?: number },
	): string {
		const label = getLabel(item);
		const size = opts?.colspan != null && opts?.rowspan != null
			? `${opts.colspan} columns by ${opts.rowspan} rows`
			: '';
		const pos = opts?.cell ? formatPosition(opts.cell) : '';
		const vars = {
			label,
			colspan: String(opts?.colspan ?? ''),
			rowspan: String(opts?.rowspan ?? ''),
			row: String(opts?.cell?.row ?? ''),
			column: String(opts?.cell?.column ?? ''),
		};

		const defaults: Record<string, string> = {
			'resize-start': `${label} resize started. Size ${size}. Use pointer to resize, Escape to cancel.`,
			'resize-move': `Resized to ${size}.`,
			'resize-end': `${label} resized to ${size} at ${pos}.`,
			'resize-cancel': `${label} resize cancelled.`,
		};
		return resolveTemplate(item, event, vars, defaults[event]);
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

	const onResizeStart = (e: CustomEvent<ResizeStartDetail>) => {
		const { item, colspan, rowspan } = e.detail;
		lastResizeSize = { colspan, rowspan };
		announce(getResizeAnnouncement(item, 'resize-start', { colspan, rowspan }));
	};

	const onResizeMove = (e: CustomEvent<ResizeMoveDetail>) => {
		const { item, cell, colspan, rowspan } = e.detail;
		// Only announce if size actually changed
		if (
			lastResizeSize &&
			colspan === lastResizeSize.colspan &&
			rowspan === lastResizeSize.rowspan
		) {
			return;
		}
		lastResizeSize = { colspan, rowspan };
		announce(getResizeAnnouncement(item, 'resize-move', { cell, colspan, rowspan }));
	};

	const onResizeEnd = (e: CustomEvent<ResizeEndDetail>) => {
		const { item, cell, colspan, rowspan } = e.detail;
		lastResizeSize = null;
		announce(getResizeAnnouncement(item, 'resize-end', { cell, colspan, rowspan }));
	};

	const onResizeCancel = (e: CustomEvent<ResizeCancelDetail>) => {
		lastResizeSize = null;
		announce(getResizeAnnouncement(e.detail.item, 'resize-cancel'));
	};

	const unlisten = listenEvents(core.element, {
		'egg-drag-start': onDragStart as EventListener,
		'egg-drag-move': onDragMove as EventListener,
		'egg-drag-end': onDragEnd as EventListener,
		'egg-drag-cancel': onDragCancel as EventListener,
		'egg-resize-start': onResizeStart as EventListener,
		'egg-resize-move': onResizeMove as EventListener,
		'egg-resize-end': onResizeEnd as EventListener,
		'egg-resize-cancel': onResizeCancel as EventListener,
	});

	return () => {
		unlisten();
		liveRegion.remove();
	};
}
