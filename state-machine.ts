/**
 * Centralized State Machine for Gridiot
 *
 * Single source of truth for interaction state.
 *
 * Key invariants:
 * 1. Only ONE interaction can be active at a time (drag OR resize, not both)
 * 2. Column count is captured at interaction start and immutable during interaction
 * 3. Phases: idle → selected → interacting → committing → selected
 */

// ============================================================================
// State Types
// ============================================================================

export type InteractionMode = 'pointer' | 'keyboard';

export type InteractionType = 'drag' | 'resize';

export type GridiotPhase =
	| 'idle'
	| 'selected'
	| 'interacting'  // Active drag or resize
	| 'committing';  // Saving to layout model, clearing preview

export interface InteractionContext {
	/** The type of interaction (drag or resize) */
	type: InteractionType;
	/** How the interaction was initiated */
	mode: InteractionMode;
	/** The item being interacted with */
	itemId: string;
	/** The DOM element being interacted with */
	element: HTMLElement;
	/** Column count at interaction start (immutable during interaction) */
	columnCount: number;
}

export interface GridiotState {
	phase: GridiotPhase;
	selectedItemId: string | null;
	interaction: InteractionContext | null;
}

// ============================================================================
// State Machine
// ============================================================================

export type StateTransition =
	| { type: 'SELECT'; itemId: string; element: HTMLElement }
	| { type: 'DESELECT' }
	| { type: 'START_INTERACTION'; context: InteractionContext }
	| { type: 'COMMIT_INTERACTION' }
	| { type: 'CANCEL_INTERACTION' }
	| { type: 'FINISH_COMMIT' };

export interface GridiotStateMachine {
	getState(): GridiotState;
	transition(action: StateTransition): GridiotState;
}

function reducer(state: GridiotState, action: StateTransition): GridiotState {
	switch (action.type) {
		case 'SELECT': {
			if (state.phase !== 'idle' && state.phase !== 'selected') {
				return state;
			}
			return {
				...state,
				phase: 'selected',
				selectedItemId: action.itemId,
			};
		}

		case 'DESELECT': {
			if (state.phase !== 'selected') {
				return state;
			}
			return {
				...state,
				phase: 'idle',
				selectedItemId: null,
			};
		}

		case 'START_INTERACTION': {
			if (state.phase !== 'selected') {
				return state;
			}
			return {
				...state,
				phase: 'interacting',
				interaction: action.context,
			};
		}

		case 'COMMIT_INTERACTION': {
			if (state.phase !== 'interacting') {
				return state;
			}
			return {
				...state,
				phase: 'committing',
			};
		}

		case 'CANCEL_INTERACTION': {
			if (state.phase !== 'interacting') {
				return state;
			}
			return {
				...state,
				phase: 'selected',
				interaction: null,
			};
		}

		case 'FINISH_COMMIT': {
			if (state.phase !== 'committing') {
				return state;
			}
			return {
				...state,
				phase: 'selected',
				interaction: null,
			};
		}

		default:
			return state;
	}
}

/**
 * Create a state machine instance
 */
export function createStateMachine(): GridiotStateMachine {
	let state: GridiotState = {
		phase: 'idle',
		selectedItemId: null,
		interaction: null,
	};

	return {
		getState() {
			return state;
		},

		transition(action: StateTransition) {
			const nextState = reducer(state, action);
			if (nextState !== state) {
				state = nextState;
			}
			return state;
		},
	};
}

export function isDragging(state: GridiotState): boolean {
	return (state.phase === 'interacting' || state.phase === 'committing') && state.interaction?.type === 'drag';
}

export function isResizing(state: GridiotState): boolean {
	return (state.phase === 'interacting' || state.phase === 'committing') && state.interaction?.type === 'resize';
}
