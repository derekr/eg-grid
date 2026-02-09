/**
 * Centralized State Machine for EG Grid
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

export type EggPhase =
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

export interface EggState {
	phase: EggPhase;
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

export interface EggStateMachine {
	getState(): EggState;
	transition(action: StateTransition): EggState;
}

function reducer(state: EggState, action: StateTransition): EggState {
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
export function createStateMachine(): EggStateMachine {
	let state: EggState = {
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

export function isDragging(state: EggState): boolean {
	return (state.phase === 'interacting' || state.phase === 'committing') && state.interaction?.type === 'drag';
}

export function isResizing(state: EggState): boolean {
	return (state.phase === 'interacting' || state.phase === 'committing') && state.interaction?.type === 'resize';
}
