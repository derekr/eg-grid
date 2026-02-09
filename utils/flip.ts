/**
 * FLIP Animation Utility
 *
 * Provides shared FLIP (First, Last, Invert, Play) animation utilities
 * used by pointer and resize plugins for smooth position/scale transitions.
 */

export interface FLIPOptions {
	duration?: number;
	easing?: string;
	onStart?: () => void;
	onFinish?: () => void;
}

/**
 * Animate an element from its previous position/size to its new position/size using FLIP.
 *
 * @param element - The element to animate
 * @param firstRect - The element's bounding rect before the DOM change (the "First" in FLIP)
 * @param options - Animation options
 * @returns The Animation object, or null if no animation was needed
 *
 * @example
 * ```ts
 * // Capture position before DOM change
 * const firstRect = element.getBoundingClientRect();
 *
 * // Make DOM changes (e.g., update grid position)
 * element.style.gridColumn = '2 / span 2';
 *
 * // Animate from old position to new
 * requestAnimationFrame(() => {
 *   animateFLIP(element, firstRect);
 * });
 * ```
 */
export function animateFLIP(
	element: HTMLElement,
	firstRect: DOMRect,
	options: FLIPOptions = {},
): Animation | null {
	const {
		duration = 200,
		easing = 'cubic-bezier(0.2, 0, 0, 1)',
		onStart,
		onFinish,
	} = options;

	const lastRect = element.getBoundingClientRect();
	const deltaX = firstRect.left - lastRect.left;
	const deltaY = firstRect.top - lastRect.top;

	if (Math.abs(deltaX) <= 1 && Math.abs(deltaY) <= 1) {
		onFinish?.();
		return null;
	}

	onStart?.();

	const keyframes: Keyframe[] = [
		{ transform: `translate(${deltaX}px, ${deltaY}px)` },
		{ transform: 'translate(0, 0)' },
	];

	// Play the animation
	const animation = element.animate(keyframes, {
		duration,
		easing,
	});

	animation.onfinish = () => onFinish?.();

	return animation;
}

/**
 * Get the item's view transition name from various sources.
 * Checks --item-id CSS property, id attribute, and data-id attribute.
 */
export function getItemViewTransitionName(element: HTMLElement): string | null {
	return (
		element.style.getPropertyValue('--item-id') ||
		element.id ||
		element.dataset.id ||
		null
	);
}

/**
 * FLIP animation with View Transition exclusion and data attribute tracking.
 */
export function animateFLIPWithTracking(
	element: HTMLElement,
	firstRect: DOMRect,
	options: FLIPOptions & { attributeName?: string } = {},
): Animation | null {
	const { attributeName = 'data-egg-dropping', ...flipOptions } = options;

	// Exclude from View Transitions
	element.style.viewTransitionName = 'none';

	const animation = animateFLIP(element, firstRect, {
		...flipOptions,
		onStart: () => {
			element.setAttribute(attributeName, '');
			flipOptions.onStart?.();
		},
		onFinish: () => {
			element.removeAttribute(attributeName);
			// Restore view transition name
			const itemId = getItemViewTransitionName(element);
			if (itemId) {
				element.style.viewTransitionName = itemId;
			}
			flipOptions.onFinish?.();
		},
	});

	// If no animation was needed, clean up immediately
	if (!animation) {
		const itemId = getItemViewTransitionName(element);
		if (itemId) {
			element.style.viewTransitionName = itemId;
		}
	}

	return animation;
}
