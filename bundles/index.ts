// Full bundle - import all plugins to auto-register them
import '../plugins/accessibility';
import '../plugins/keyboard';
import '../plugins/pointer';
import '../plugins/camera';
import '../plugins/resize';
import '../plugins/placeholder';
import '../plugins/algorithm-push';
import '../plugins/algorithm-reorder';
import '../plugins/responsive';

// Core exports
export {
	getItemCell,
	getPlugin,
	init,
	registerPlugin,
	setItemCell,
} from '../engine';
export type * from '../types';

// Layout model for responsive support
export {
	buildLayoutItems,
	createLayoutModel,
	layoutItemsToPositions,
} from '../layout-model';

// Backward compatibility: export attach functions for manual plugin usage
export { attachCamera, type CameraInstance, type CameraOptions, type CameraState } from '../plugins/camera';
export { attachResize, type ResizeOptions } from '../plugins/resize';
export { attachPlaceholder, attachPlaceholderStyles, PLACEHOLDER_CSS, type PlaceholderInstance, type PlaceholderOptions } from '../plugins/placeholder';
export { attachPushAlgorithm, calculateLayout, layoutToCSS, readItemsFromDOM, type AttachPushAlgorithmOptions } from '../plugins/algorithm-push';
export { attachReorderAlgorithm, calculateReorderLayout, getItemOrder, reflowItems, type AttachReorderAlgorithmOptions } from '../plugins/algorithm-reorder';
export { attachResponsive, ensureContainerWrapper, type ResponsiveState } from '../plugins/responsive';

// FLIP utility
export { animateFLIP, animateFLIPWithTracking, getItemViewTransitionName, withViewTransitionExclusion, type FLIPOptions } from '../utils/flip';
