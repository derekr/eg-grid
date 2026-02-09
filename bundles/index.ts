// Full bundle - all plugins included via direct init wiring in engine.ts

// Core exports
export {
	getItemCell,
	getItemSize,
	init,
	listenEvents,
} from '../engine';
export type * from '../types';

// Layout model for responsive support
export { createLayoutModel } from '../layout-model';

// Export attach functions for manual plugin usage
export { attachPointer } from '../plugins/pointer';
export { attachKeyboard } from '../plugins/keyboard';
export { attachAccessibility } from '../plugins/accessibility';
export { attachCamera, type CameraInstance, type CameraOptions, type CameraState } from '../plugins/camera';
export { attachResize, type ResizeOptions } from '../plugins/resize';
export { attachPlaceholder, type PlaceholderInstance, type PlaceholderOptions } from '../plugins/placeholder';
export { attachPushAlgorithm, calculateLayout, layoutToCSS, readItemsFromDOM, type AttachPushAlgorithmOptions } from '../plugins/algorithm-push';
export { attachReorderAlgorithm, calculateReorderLayout, getItemOrder, reflowItems, type AttachReorderAlgorithmOptions } from '../plugins/algorithm-reorder';
export { attachResponsive, type ResponsiveState } from '../plugins/responsive';

// FLIP utility
export { animateFLIP, animateFLIPWithTracking, getItemViewTransitionName, type FLIPOptions } from '../utils/flip';
