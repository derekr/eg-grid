/**
 * FLIP Animation Utility
 *
 * Provides shared FLIP (First, Last, Invert, Play) animation utilities
 * used by pointer and resize plugins for smooth position/scale transitions.
 */

export interface FLIPOptions {
	/** Animation duration in milliseconds. @default 200 */
	duration?: number;
	/** CSS easing function. @default 'cubic-bezier(0.2, 0, 0, 1)' */
	easing?: string;
	/** Include scale transform (for resize). @default false */
	includeScale?: boolean;
	/** Transform origin for scale animations. @default undefined (uses center) */
	transformOrigin?: string;
	/** Callback when animation starts */
	onStart?: () => void;
	/** Callback when animation finishes */
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
		includeScale = false,
		transformOrigin,
		onStart,
		onFinish,
	} = options;

	// Measure final position (the "Last" in FLIP)
	const lastRect = element.getBoundingClientRect();

	// Calculate position deltas (the "Invert" in FLIP)
	const deltaX = firstRect.left - lastRect.left;
	const deltaY = firstRect.top - lastRect.top;

	const needsTranslate = Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1;

	// Calculate scale deltas (for resize)
	let scaleX = 1;
	let scaleY = 1;
	let needsScale = false;

	if (includeScale) {
		scaleX = firstRect.width / lastRect.width;
		scaleY = firstRect.height / lastRect.height;
		needsScale = Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01;
	}

	// Skip animation if no significant change
	if (!needsTranslate && !needsScale) {
		onFinish?.();
		return null;
	}

	onStart?.();

	// Build keyframes based on what's needed
	const keyframes: Keyframe[] = includeScale
		? [
				{
					transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
					transformOrigin: transformOrigin ?? 'top left',
				},
				{
					transform: 'translate(0, 0) scale(1, 1)',
					transformOrigin: transformOrigin ?? 'top left',
				},
			]
		: [
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
 * Execute a FLIP animation while temporarily excluding the element from View Transitions.
 *
 * This is useful when you want to use FLIP for an animation instead of View Transitions,
 * to prevent the two from conflicting.
 *
 * @param element - The element to animate
 * @param fn - Function that performs the animation (receives firstRect)
 * @returns The Animation object, or null if no animation was needed
 *
 * @example
 * ```ts
 * const firstRect = element.getBoundingClientRect();
 *
 * // Make DOM changes
 * element.style.gridColumn = '2 / span 2';
 *
 * // Animate with View Transition exclusion
 * requestAnimationFrame(() => {
 *   withViewTransitionExclusion(element, () =>
 *     animateFLIP(element, firstRect)
 *   );
 * });
 * ```
 */
export function withViewTransitionExclusion(
	element: HTMLElement,
	fn: () => Animation | null,
): Animation | null {
	// Exclude from View Transitions during FLIP
	element.style.viewTransitionName = 'none';

	const animation = fn();

	const restoreViewTransitionName = () => {
		const itemId = getItemViewTransitionName(element);
		if (itemId) {
			element.style.viewTransitionName = itemId;
		}
	};

	if (animation) {
		animation.addEventListener('finish', restoreViewTransitionName, { once: true });
	} else {
		// No animation needed, restore immediately
		restoreViewTransitionName();
	}

	return animation;
}

/**
 * Perform a complete FLIP animation with data attribute tracking.
 *
 * This is a higher-level helper that:
 * 1. Excludes the element from View Transitions
 * 2. Sets a tracking attribute during animation
 * 3. Animates using FLIP
 * 4. Restores View Transition name when done
 *
 * @param element - The element to animate
 * @param firstRect - The element's bounding rect before the DOM change
 * @param options - Animation options plus optional attribute name
 *
 * @example
 * ```ts
 * const firstRect = element.getBoundingClientRect();
 * element.style.gridColumn = '2 / span 2';
 *
 * requestAnimationFrame(() => {
 *   animateFLIPWithTracking(element, firstRect, {
 *     attributeName: 'data-gridiot-dropping',
 *     includeScale: true,
 *     transformOrigin: 'top left',
 *   });
 * });
 * ```
 */
export function animateFLIPWithTracking(
	element: HTMLElement,
	firstRect: DOMRect,
	options: FLIPOptions & { attributeName?: string } = {},
): Animation | null {
	const { attributeName = 'data-gridiot-dropping', ...flipOptions } = options;

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
