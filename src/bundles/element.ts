// Web component bundle — eg-grid + <eg-grid> custom element auto-registration

export * from '../eg-grid';
export { createLayoutModel } from '../layout-model';
export type { ItemDefinition, ItemPosition, CreateLayoutModelOptions, ResponsiveLayoutModel, BreakpointCSSOptions } from '../layout-model';
export { EgGridElement } from '../eg-grid-element';

import { EgGridElement } from '../eg-grid-element';

// Auto-register the custom element
if (!customElements.get('eg-grid')) {
	customElements.define('eg-grid', EgGridElement);
}
