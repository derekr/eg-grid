// Web component bundle — full library + <eg-grid> custom element auto-registration

export * from './index';
export { EgGridElement } from '../eg-grid-element';

import { EgGridElement } from '../eg-grid-element';

// Auto-register the custom element
if (!customElements.get('eg-grid')) {
	customElements.define('eg-grid', EgGridElement);
}
