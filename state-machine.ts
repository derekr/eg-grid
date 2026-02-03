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

export type StateListener = (state: GridiotState, transition: StateTransition) => void;

export interface GridiotStateMachine {
	getState(): GridiotState;
	transition(action: StateTransition): GridiotState;
	subscribe(listener: StateListener): () => void;
	/** Check if a transition is valid from current state */
	canTransition(action: StateTransition): boolean;
}

/**
 * Create the initial state
 */
export function createInitialState(): GridiotState {
	return {
		phase: 'idle',
		selectedItemId: null,
		interaction: null,
		keyboardModeActive: false,
	};
}

/**
 * Pure state reducer - computes next state from current state and action
 */
export function reducer(state: GridiotState, action: StateTransition): GridiotState {
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
 * Check if a transition is valid from the current state
 */
export function canTransition(state: GridiotState, action: StateTransition): boolean {
	switch (action.type) {
		case 'SELECT':
			return state.phase === 'idle' || state.phase === 'selected';
		case 'DESELECT':
			return state.phase === 'selected';
		case 'START_INTERACTION':
			return state.phase === 'selected';
		case 'UPDATE_INTERACTION':
			return state.phase === 'interacting' && state.interaction !== null;
		case 'COMMIT_INTERACTION':
			return state.phase === 'interacting';
		case 'CANCEL_INTERACTION':
			return state.phase === 'interacting';
		case 'FINISH_COMMIT':
			return state.phase === 'committing';
		case 'TOGGLE_KEYBOARD_MODE':
			return true; // Always allowed
		default:
			return false;
	}
}

/**
 * Create a state machine instance
 */
export function createStateMachine(initialState?: GridiotState): GridiotStateMachine {
	let state = initialState ?? createInitialState();
	const listeners = new Set<StateListener>();

	return {
		getState() {
			return state;
		},

		transition(action: StateTransition) {
			const nextState = reducer(state, action);
			if (nextState !== state) {
				state = nextState;
				for (const listener of listeners) {
					listener(state, action);
				}
			}
			return state;
		},

		subscribe(listener: StateListener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},

		canTransition(action: StateTransition) {
			return canTransition(state, action);
		},
	};
}

// ============================================================================
// Derived State Helpers
// ============================================================================

/**
 * Check if currently in an active interaction
 */
export function isInteracting(state: GridiotState): boolean {
	return state.phase === 'interacting' || state.phase === 'committing';
}

/**
 * Check if currently dragging (not resizing)
 */
export function isDragging(state: GridiotState): boolean {
	return isInteracting(state) && state.interaction?.type === 'drag';
}

/**
 * Check if currently resizing (not dragging)
 */
export function isResizing(state: GridiotState): boolean {
	return isInteracting(state) && state.interaction?.type === 'resize';
}

/**
 * Get the interaction mode if active
 */
export function getInteractionMode(state: GridiotState): InteractionMode | null {
	return state.interaction?.mode ?? null;
}

/**
 * Check if View Transitions should be used for current interaction
 */
export function shouldUseViewTransition(state: GridiotState): boolean {
	return state.interaction?.useViewTransition ?? false;
}

/**
 * Check if FLIP animation should be used for current interaction
 */
export function shouldUseFlip(state: GridiotState): boolean {
	return state.interaction?.useFlip ?? false;
}

/**
 * Get the captured column count for current interaction
 */
export function getInteractionColumnCount(state: GridiotState): number | null {
	return state.interaction?.columnCount ?? null;
}
