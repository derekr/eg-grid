/**
 * Centralized State Machine for Gridiot
 *
 * This module provides a single source of truth for interaction state,
 * replacing the distributed state management across plugins.
 *
 * Key invariants:
 * 1. Only ONE interaction can be active at a time (drag OR resize, not both)
 * 2. Column count is captured at interaction start and immutable during interaction
 * 3. CSS injection is coordinated through this state machine
 * 4. View Transitions are only used for keyboard interactions (not pointer/FLIP)
 */

import type { GridCell, ItemPosition } from './types';

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
	/** Original positions of all items at interaction start */
	originalPositions: Map<string, ItemPosition>;
	/** Original sizes of all items at interaction start (for resize) */
	originalSizes: Map<string, { width: number; height: number }>;
	/** Current target cell during interaction */
	targetCell: GridCell;
	/** Current size during resize */
	currentSize: { colspan: number; rowspan: number };
	/** Whether FLIP animation should be used (pointer mode only) */
	useFlip: boolean;
	/** Whether View Transitions should be used (keyboard mode only) */
	useViewTransition: boolean;
}

export interface GridiotState {
	phase: GridiotPhase;
	selectedItemId: string | null;
	interaction: InteractionContext | null;
	/** Track if keyboard mode is active (Shift+G toggle) */
	keyboardModeActive: boolean;
}

// ============================================================================
// State Machine
// ============================================================================

export type StateTransition =
	| { type: 'SELECT'; itemId: string; element: HTMLElement }
	| { type: 'DESELECT' }
	| { type: 'START_INTERACTION'; context: Omit<InteractionContext, 'useFlip' | 'useViewTransition'> }
	| { type: 'UPDATE_INTERACTION'; targetCell: GridCell; currentSize?: { colspan: number; rowspan: number } }
	| { type: 'COMMIT_INTERACTION' }
	| { type: 'CANCEL_INTERACTION' }
	| { type: 'FINISH_COMMIT' }
	| { type: 'TOGGLE_KEYBOARD_MODE' };

export interface GridiotStateMachine {
	getState(): GridiotState;
	transition(action: StateTransition): GridiotState;
}

function reducer(state: GridiotState, action: StateTransition): GridiotState {
	switch (action.type) {
		case 'SELECT': {
			// Can select from idle or selected (changes selection)
			if (state.phase !== 'idle' && state.phase !== 'selected') {
				return state; // Can't select during interaction
			}
			return {
				...state,
				phase: 'selected',
				selectedItemId: action.itemId,
			};
		}

		case 'DESELECT': {
			// Can deselect from selected only
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
			// Can start interaction from selected only
			if (state.phase !== 'selected') {
				return state;
			}
			const { context } = action;
			return {
				...state,
				phase: 'interacting',
				interaction: {
					...context,
					// Derive animation strategy from mode
					useFlip: context.mode === 'pointer',
					useViewTransition: context.mode === 'keyboard',
				},
			};
		}

		case 'UPDATE_INTERACTION': {
			// Can only update during active interaction
			if (state.phase !== 'interacting' || !state.interaction) {
				return state;
			}
			return {
				...state,
				interaction: {
					...state.interaction,
					targetCell: action.targetCell,
					currentSize: action.currentSize ?? state.interaction.currentSize,
				},
			};
		}

		case 'COMMIT_INTERACTION': {
			// Transition from interacting to committing
			if (state.phase !== 'interacting') {
				return state;
			}
			return {
				...state,
				phase: 'committing',
			};
		}

		case 'CANCEL_INTERACTION': {
			// Can cancel from interacting
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
			// Transition from committing back to selected
			if (state.phase !== 'committing') {
				return state;
			}
			return {
				...state,
				phase: 'selected',
				interaction: null,
			};
		}

		case 'TOGGLE_KEYBOARD_MODE': {
			return {
				...state,
				keyboardModeActive: !state.keyboardModeActive,
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
		keyboardModeActive: false,
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
