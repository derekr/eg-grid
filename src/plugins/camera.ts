/**
 * Camera plugin for EG Grid
 *
 * Handles viewport scrolling to keep the active item visible:
 * - Auto-scroll when dragging near viewport edges
 * - Scroll into view when selecting items via keyboard
 *
 * The "active item" is: the dragged item during drag, or the selected item otherwise.
 */

import { listenEvents } from '../engine';
import type {
	DragStartDetail,
	DragMoveDetail,
	DragEndDetail,
	DragCancelDetail,
	SelectDetail,
	EggCore,
} from '../types';

export type CameraMode = 'contain' | 'center' | 'off';

export interface CameraOptions {
	/**
	 * Scroll behavior mode:
	 * - 'contain': Only scroll when item would leave viewport (default)
	 * - 'center': Keep active item centered (can feel jarring)
	 * - 'off': Disable camera scrolling
	 */
	mode?: CameraMode;

	/**
	 * The scrollable container. Defaults to the grid's scroll parent.
	 * Pass `window` to scroll the document.
	 */
	scrollContainer?: HTMLElement | Window;

	/**
	 * Size of edge zones that trigger auto-scroll during drag (in pixels).
	 * @default 60
	 */
	edgeSize?: number;

	/**
	 * Maximum scroll speed in pixels per frame.
	 * @default 15
	 */
	scrollSpeed?: number;

	/**
	 * Scroll behavior for selection changes.
	 * @default 'smooth'
	 */
	scrollBehavior?: ScrollBehavior;

	/**
	 * Margin around item when scrolling into view (in pixels).
	 * @default 20
	 */
	scrollMargin?: number;

	/**
	 * Whether to scroll on selection changes (keyboard nav).
	 * @default true
	 */
	scrollOnSelect?: boolean;

	/**
	 * Whether to auto-scroll during drag.
	 * @default true
	 */
	autoScrollOnDrag?: boolean;

	/**
	 * Time in ms after scrolling stops before considered "settled".
	 * Other plugins can check isScrolling() to defer updates.
	 * @default 150
	 */
	settleDelay?: number;

	/**
	 * EG Grid core instance for provider registration.
	 * If provided, registers a 'camera' provider.
	 */
	core?: EggCore;
}

/**
 * Camera state exposed via provider registry.
 */
export interface CameraState {
	/** Whether the camera is actively auto-scrolling */
	isScrolling: boolean;
	/** Current camera mode */
	mode: CameraMode;
}

export interface CameraInstance {
	/** Change the camera mode */
	setMode(mode: CameraMode): void;
	/** Get current mode */
	getMode(): CameraMode;
	/** Manually scroll an item into view */
	scrollTo(item: HTMLElement, behavior?: ScrollBehavior): void;
	/** Stop any active auto-scrolling */
	stop(): void;
	/** Clean up and remove event listeners */
	destroy(): void;
}

/**
 * Find the nearest scrollable ancestor of an element.
 */
function findScrollParent(element: HTMLElement): HTMLElement | Window {
	let parent = element.parentElement;

	while (parent) {
		const style = getComputedStyle(parent);
		const overflowY = style.overflowY;
		const overflowX = style.overflowX;

		if (
			overflowY === 'auto' ||
			overflowY === 'scroll' ||
			overflowX === 'auto' ||
			overflowX === 'scroll'
		) {
			return parent;
		}

		parent = parent.parentElement;
	}

	return window;
}

/**
 * Get viewport rect for a scroll container.
 */
function getViewportRect(
	container: HTMLElement | Window
): { top: number; left: number; width: number; height: number } {
	if (container === window) {
		return {
			top: 0,
			left: 0,
			width: window.innerWidth,
			height: window.innerHeight,
		};
	}
	const rect = (container as HTMLElement).getBoundingClientRect();
	return {
		top: rect.top,
		left: rect.left,
		width: rect.width,
		height: rect.height,
	};
}

/**
 * Attach camera behavior to a EG Grid grid element.
 */
export function attachCamera(
	gridElement: HTMLElement,
	options: CameraOptions = {}
): CameraInstance {
	const {
		mode: initialMode = 'contain',
		scrollContainer: customContainer,
		edgeSize = 60,
		scrollSpeed = 15,
		scrollBehavior = 'smooth',
		scrollMargin = 20,
		scrollOnSelect = true,
		autoScrollOnDrag = true,
		settleDelay = 150,
		core,
	} = options;

	let mode = initialMode;
	let scrollContainer = customContainer ?? findScrollParent(gridElement);
	let animationFrameId: number | null = null;
	let isDragging = false;
	let dragSource: 'pointer' | 'keyboard' | null = null;
	let lastPointerX = 0;
	let lastPointerY = 0;
	let isScrolling = false;
	let settleTimeoutId: ReturnType<typeof setTimeout> | null = null;

	// Expose scrolling state on core
	if (core) {
		core.cameraScrolling = false;
	}

	/**
	 * Mark scrolling as active, with settle timeout.
	 */
	function setScrolling(active: boolean): void {
		if (active) {
			isScrolling = true;
			if (core) core.cameraScrolling = true;
			if (settleTimeoutId) {
				clearTimeout(settleTimeoutId);
				settleTimeoutId = null;
			}
		} else {
			// Start settle timer
			if (settleTimeoutId) clearTimeout(settleTimeoutId);
			settleTimeoutId = setTimeout(() => {
				isScrolling = false;
				if (core) core.cameraScrolling = false;
				settleTimeoutId = null;
				// Emit settle event so algorithm can recalculate
				gridElement.dispatchEvent(
					new CustomEvent('egg-camera-settled', { bubbles: true })
				);
			}, settleDelay);
		}
	}

	/**
	 * Scroll an item into view based on current mode.
	 */
	function scrollTo(item: HTMLElement, behavior: ScrollBehavior = scrollBehavior): void {
		if (mode === 'off') return;

		const itemRect = item.getBoundingClientRect();
		const viewport = getViewportRect(scrollContainer);

		if (mode === 'center') {
			// Center the item in the viewport
			const targetScrollTop =
				scrollContainer === window
					? window.scrollY + itemRect.top - viewport.height / 2 + itemRect.height / 2
					: (scrollContainer as HTMLElement).scrollTop +
						itemRect.top -
						viewport.top -
						viewport.height / 2 +
						itemRect.height / 2;

			const targetScrollLeft =
				scrollContainer === window
					? window.scrollX + itemRect.left - viewport.width / 2 + itemRect.width / 2
					: (scrollContainer as HTMLElement).scrollLeft +
						itemRect.left -
						viewport.left -
						viewport.width / 2 +
						itemRect.width / 2;

			if (scrollContainer === window) {
				window.scrollTo({ top: targetScrollTop, left: targetScrollLeft, behavior });
			} else {
				(scrollContainer as HTMLElement).scrollTo({
					top: targetScrollTop,
					left: targetScrollLeft,
					behavior,
				});
			}
		} else {
			// 'contain' mode - use CSS scroll-margin with scrollIntoView
			// The scroll-margin should be set in CSS on items (or we set it here)
			// This lets the browser handle all the positioning math

			item.scrollIntoView({
				behavior,
				block: 'nearest',
				inline: 'nearest',
			});
		}
	}

	/**
	 * Calculate scroll velocity based on pointer position relative to edges.
	 */
	function getEdgeScrollVelocity(
		pointerX: number,
		pointerY: number
	): { x: number; y: number } {
		const viewport = getViewportRect(scrollContainer);
		let velocityX = 0;
		let velocityY = 0;

		// Pointer position relative to viewport
		const relativeX = pointerX - viewport.left;
		const relativeY = pointerY - viewport.top;

		// Check horizontal edges
		if (relativeX < edgeSize) {
			// Near left edge - scroll left (negative)
			velocityX = -scrollSpeed * (1 - relativeX / edgeSize);
		} else if (relativeX > viewport.width - edgeSize) {
			// Near right edge - scroll right (positive)
			velocityX = scrollSpeed * (1 - (viewport.width - relativeX) / edgeSize);
		}

		// Check vertical edges
		if (relativeY < edgeSize) {
			// Near top edge - scroll up (negative)
			velocityY = -scrollSpeed * (1 - relativeY / edgeSize);
		} else if (relativeY > viewport.height - edgeSize) {
			// Near bottom edge - scroll down (positive)
			velocityY = scrollSpeed * (1 - (viewport.height - relativeY) / edgeSize);
		}

		return { x: velocityX, y: velocityY };
	}

	/**
	 * Animation loop for edge scrolling during drag.
	 */
	let wasScrollingLastFrame = false;

	function scrollLoop(): void {
		if (!isDragging || !autoScrollOnDrag || mode === 'off') {
			animationFrameId = null;
			if (wasScrollingLastFrame) {
				setScrolling(false);
				wasScrollingLastFrame = false;
			}
			return;
		}

		const velocity = getEdgeScrollVelocity(lastPointerX, lastPointerY);
		const isNearEdge = velocity.x !== 0 || velocity.y !== 0;

		if (isNearEdge) {
			if (!wasScrollingLastFrame) {
				setScrolling(true);
			}
			wasScrollingLastFrame = true;
			if (scrollContainer === window) {
				window.scrollBy(velocity.x, velocity.y);
			} else {
				(scrollContainer as HTMLElement).scrollLeft += velocity.x;
				(scrollContainer as HTMLElement).scrollTop += velocity.y;
			}
		} else {
			// Not near edge
			if (wasScrollingLastFrame) {
				setScrolling(false);
				wasScrollingLastFrame = false;
			}
		}

		animationFrameId = requestAnimationFrame(scrollLoop);
	}

	/**
	 * Start the scroll loop.
	 */
	function startScrollLoop(): void {
		if (animationFrameId === null) {
			animationFrameId = requestAnimationFrame(scrollLoop);
		}
	}

	/**
	 * Stop the scroll loop.
	 */
	function stopScrollLoop(): void {
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		setScrolling(false);
	}

	// Track pointer position continuously during drag (not just on cell change)
	function onPointerMove(e: PointerEvent): void {
		if (!isDragging || !autoScrollOnDrag || mode === 'off') return;

		lastPointerX = e.clientX;
		lastPointerY = e.clientY;
		startScrollLoop();
	}

	// Event handlers
	function onDragStart(e: CustomEvent<DragStartDetail>): void {
		isDragging = true;
		dragSource = e.detail.source;
		// Only listen for raw pointer moves during pointer drags (for edge-scroll detection)
		if (dragSource === 'pointer') {
			window.addEventListener('pointermove', onPointerMove);
		}
	}

	function onDragMove(e: CustomEvent<DragMoveDetail>): void {
		if (mode === 'off') return;

		if (e.detail.source === 'pointer') {
			// Pointer drag: update position for edge detection
			lastPointerX = e.detail.x;
			lastPointerY = e.detail.y;
		} else {
			// Keyboard drag - scroll to keep item visible
			// Use requestAnimationFrame to let the DOM update first
			requestAnimationFrame(() => {
				scrollTo(e.detail.item, 'smooth');
			});
		}
	}

	function onDragEnd(e: CustomEvent<DragEndDetail>): void {
		const wasPointerDrag = dragSource === 'pointer';
		isDragging = false;
		dragSource = null;
		stopScrollLoop();
		if (wasPointerDrag) {
			window.removeEventListener('pointermove', onPointerMove);
		}

		// For keyboard moves (nudge), scroll to keep item visible after it moves
		// Pointer drags handle their own scrolling via edge detection
		if (!wasPointerDrag && scrollOnSelect) {
			// Wait for layout to settle (view transitions may be animating)
			// Use setTimeout + rAF to ensure DOM has updated
			setTimeout(() => {
				requestAnimationFrame(() => {
					scrollTo(e.detail.item, 'smooth');
				});
			}, 100);
		}
	}

	function onDragCancel(e: CustomEvent<DragCancelDetail>): void {
		const wasPointerDrag = dragSource === 'pointer';
		isDragging = false;
		dragSource = null;
		stopScrollLoop();
		if (wasPointerDrag) {
			window.removeEventListener('pointermove', onPointerMove);
		}
	}

	function onSelect(e: CustomEvent<SelectDetail>): void {
		if (!scrollOnSelect || mode === 'off') return;

		// Don't scroll during drag - the drag handles its own scrolling
		if (isDragging) return;

		scrollTo(e.detail.item);
	}

	const removeListeners = listenEvents(gridElement, {
		'egg-drag-start': onDragStart as EventListener,
		'egg-drag-move': onDragMove as EventListener,
		'egg-drag-end': onDragEnd as EventListener,
		'egg-drag-cancel': onDragCancel as EventListener,
		'egg-select': onSelect as EventListener,
	});

	function destroy(): void {
		stopScrollLoop();
		removeListeners();
	}

	return {
		setMode(newMode: CameraMode): void {
			mode = newMode;
			if (mode === 'off') {
				stopScrollLoop();
			}
		},
		getMode(): CameraMode {
			return mode;
		},
		scrollTo,
		stop: stopScrollLoop,
		destroy,
	};
}

