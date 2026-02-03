/**
 * Tests for the Gridiot State Machine
 *
 * These tests verify the state machine enforces correct transitions
 * and maintains invariants across all interaction modes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	createStateMachine,
	createInitialState,
	reducer,
	canTransition,
	isInteracting,
	isDragging,
	isResizing,
	shouldUseViewTransition,
	shouldUseFlip,
	getInteractionColumnCount,
	type GridiotState,
	type GridiotStateMachine,
	type InteractionContext,
	type StateTransition,
} from './state-machine';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockElement(): HTMLElement {
	// Mock HTMLElement - state machine only stores reference, doesn't operate on it
	return {} as HTMLElement;
}

function createDragContext(mode: 'pointer' | 'keyboard'): Omit<InteractionContext, 'useFlip' | 'useViewTransition'> {
	return {
		type: 'drag',
		mode,
		itemId: 'item-1',
		element: createMockElement(),
		columnCount: 6,
		originalPositions: new Map([['item-1', { column: 1, row: 1 }]]),
		originalSizes: new Map([['item-1', { width: 2, height: 2 }]]),
		targetCell: { column: 1, row: 1 },
		currentSize: { colspan: 2, rowspan: 2 },
	};
}

function createResizeContext(mode: 'pointer' | 'keyboard'): Omit<InteractionContext, 'useFlip' | 'useViewTransition'> {
	return {
		type: 'resize',
		mode,
		itemId: 'item-1',
		element: createMockElement(),
		columnCount: 6,
		originalPositions: new Map([['item-1', { column: 1, row: 1 }]]),
		originalSizes: new Map([['item-1', { width: 2, height: 2 }]]),
		targetCell: { column: 1, row: 1 },
		currentSize: { colspan: 2, rowspan: 2 },
	};
}

// ============================================================================
// Initial State Tests
// ============================================================================

describe('Initial State', () => {
	it('should start in idle phase', () => {
		const state = createInitialState();
		expect(state.phase).toBe('idle');
	});

	it('should have no selected item', () => {
		const state = createInitialState();
		expect(state.selectedItemId).toBeNull();
	});

	it('should have no active interaction', () => {
		const state = createInitialState();
		expect(state.interaction).toBeNull();
	});

	it('should have keyboard mode disabled', () => {
		const state = createInitialState();
		expect(state.keyboardModeActive).toBe(false);
	});
});

// ============================================================================
// Selection Tests
// ============================================================================

describe('Selection', () => {
	it('should allow selection from idle', () => {
		const state = createInitialState();
		const next = reducer(state, {
			type: 'SELECT',
			itemId: 'item-1',
			element: createMockElement(),
		});

		expect(next.phase).toBe('selected');
		expect(next.selectedItemId).toBe('item-1');
	});

	it('should allow changing selection from selected', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'SELECT', itemId: 'item-2', element: createMockElement() });

		expect(state.selectedItemId).toBe('item-2');
	});

	it('should NOT allow selection during interaction', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
		const before = state;
		state = reducer(state, { type: 'SELECT', itemId: 'item-2', element: createMockElement() });

		expect(state).toBe(before); // State unchanged
		expect(state.selectedItemId).toBe('item-1');
	});

	it('should allow deselection from selected', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'DESELECT' });

		expect(state.phase).toBe('idle');
		expect(state.selectedItemId).toBeNull();
	});

	it('should NOT allow deselection from idle', () => {
		const state = createInitialState();
		const next = reducer(state, { type: 'DESELECT' });

		expect(next).toBe(state); // State unchanged
	});
});

// ============================================================================
// Interaction Start Tests
// ============================================================================

describe('Start Interaction', () => {
	it('should allow starting drag from selected', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });

		expect(state.phase).toBe('interacting');
		expect(state.interaction?.type).toBe('drag');
	});

	it('should allow starting resize from selected', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'START_INTERACTION', context: createResizeContext('pointer') });

		expect(state.phase).toBe('interacting');
		expect(state.interaction?.type).toBe('resize');
	});

	it('should NOT allow starting interaction from idle', () => {
		const state = createInitialState();
		const next = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });

		expect(next).toBe(state); // State unchanged
		expect(next.phase).toBe('idle');
	});

	it('should NOT allow starting interaction while already interacting', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
		const before = state;
		state = reducer(state, { type: 'START_INTERACTION', context: createResizeContext('pointer') });

		expect(state).toBe(before); // State unchanged, still dragging
		expect(state.interaction?.type).toBe('drag');
	});

	it('should capture column count at interaction start', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		const context = createDragContext('pointer');
		context.columnCount = 4;
		state = reducer(state, { type: 'START_INTERACTION', context });

		expect(state.interaction?.columnCount).toBe(4);
	});

	it('should capture original positions at interaction start', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		const context = createDragContext('pointer');
		context.originalPositions = new Map([
			['item-1', { column: 1, row: 1 }],
			['item-2', { column: 3, row: 1 }],
		]);
		state = reducer(state, { type: 'START_INTERACTION', context });

		expect(state.interaction?.originalPositions.size).toBe(2);
		expect(state.interaction?.originalPositions.get('item-1')).toEqual({ column: 1, row: 1 });
	});
});

// ============================================================================
// Animation Strategy Tests (Critical!)
// ============================================================================

describe('Animation Strategy', () => {
	describe('Pointer interactions use FLIP', () => {
		it('should set useFlip=true for pointer drag', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });

			expect(state.interaction?.useFlip).toBe(true);
			expect(state.interaction?.useViewTransition).toBe(false);
		});

		it('should set useFlip=true for pointer resize', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createResizeContext('pointer') });

			expect(state.interaction?.useFlip).toBe(true);
			expect(state.interaction?.useViewTransition).toBe(false);
		});
	});

	describe('Keyboard interactions use View Transitions', () => {
		it('should set useViewTransition=true for keyboard drag', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('keyboard') });

			expect(state.interaction?.useViewTransition).toBe(true);
			expect(state.interaction?.useFlip).toBe(false);
		});

		it('should set useViewTransition=true for keyboard resize', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createResizeContext('keyboard') });

			expect(state.interaction?.useViewTransition).toBe(true);
			expect(state.interaction?.useFlip).toBe(false);
		});
	});

	describe('Helper functions', () => {
		it('shouldUseFlip returns correct value', () => {
			let state = createInitialState();
			expect(shouldUseFlip(state)).toBe(false);

			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
			expect(shouldUseFlip(state)).toBe(true);
		});

		it('shouldUseViewTransition returns correct value', () => {
			let state = createInitialState();
			expect(shouldUseViewTransition(state)).toBe(false);

			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('keyboard') });
			expect(shouldUseViewTransition(state)).toBe(true);
		});
	});
});

// ============================================================================
// Update Interaction Tests
// ============================================================================

describe('Update Interaction', () => {
	it('should update target cell during interaction', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
		state = reducer(state, { type: 'UPDATE_INTERACTION', targetCell: { column: 3, row: 2 } });

		expect(state.interaction?.targetCell).toEqual({ column: 3, row: 2 });
	});

	it('should update size during resize', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'START_INTERACTION', context: createResizeContext('pointer') });
		state = reducer(state, {
			type: 'UPDATE_INTERACTION',
			targetCell: { column: 1, row: 1 },
			currentSize: { colspan: 3, rowspan: 2 },
		});

		expect(state.interaction?.currentSize).toEqual({ colspan: 3, rowspan: 2 });
	});

	it('should NOT update when not interacting', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		const before = state;
		state = reducer(state, { type: 'UPDATE_INTERACTION', targetCell: { column: 3, row: 2 } });

		expect(state).toBe(before); // State unchanged
	});

	it('should preserve column count during updates (immutable)', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		const context = createDragContext('pointer');
		context.columnCount = 6;
		state = reducer(state, { type: 'START_INTERACTION', context });

		// Multiple updates should not change columnCount
		state = reducer(state, { type: 'UPDATE_INTERACTION', targetCell: { column: 2, row: 1 } });
		state = reducer(state, { type: 'UPDATE_INTERACTION', targetCell: { column: 3, row: 1 } });
		state = reducer(state, { type: 'UPDATE_INTERACTION', targetCell: { column: 4, row: 1 } });

		expect(state.interaction?.columnCount).toBe(6);
	});
});

// ============================================================================
// Commit/Cancel Tests
// ============================================================================

describe('Commit Interaction', () => {
	it('should transition to committing phase', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
		state = reducer(state, { type: 'COMMIT_INTERACTION' });

		expect(state.phase).toBe('committing');
		expect(state.interaction).not.toBeNull(); // Interaction preserved during commit
	});

	it('should finish commit and return to selected', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
		state = reducer(state, { type: 'COMMIT_INTERACTION' });
		state = reducer(state, { type: 'FINISH_COMMIT' });

		expect(state.phase).toBe('selected');
		expect(state.interaction).toBeNull();
		expect(state.selectedItemId).toBe('item-1'); // Selection preserved
	});

	it('should NOT allow commit when not interacting', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		const before = state;
		state = reducer(state, { type: 'COMMIT_INTERACTION' });

		expect(state).toBe(before);
	});
});

describe('Cancel Interaction', () => {
	it('should return to selected and clear interaction', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
		state = reducer(state, { type: 'CANCEL_INTERACTION' });

		expect(state.phase).toBe('selected');
		expect(state.interaction).toBeNull();
		expect(state.selectedItemId).toBe('item-1'); // Selection preserved
	});

	it('should NOT allow cancel when not interacting', () => {
		let state = createInitialState();
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		const before = state;
		state = reducer(state, { type: 'CANCEL_INTERACTION' });

		expect(state).toBe(before);
	});
});

// ============================================================================
// Derived State Helpers Tests
// ============================================================================

describe('Derived State Helpers', () => {
	describe('isInteracting', () => {
		it('should return false when idle', () => {
			const state = createInitialState();
			expect(isInteracting(state)).toBe(false);
		});

		it('should return false when selected', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			expect(isInteracting(state)).toBe(false);
		});

		it('should return true when interacting', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
			expect(isInteracting(state)).toBe(true);
		});

		it('should return true when committing', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
			state = reducer(state, { type: 'COMMIT_INTERACTION' });
			expect(isInteracting(state)).toBe(true);
		});
	});

	describe('isDragging / isResizing', () => {
		it('should correctly identify drag', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });

			expect(isDragging(state)).toBe(true);
			expect(isResizing(state)).toBe(false);
		});

		it('should correctly identify resize', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createResizeContext('pointer') });

			expect(isDragging(state)).toBe(false);
			expect(isResizing(state)).toBe(true);
		});
	});

	describe('getInteractionColumnCount', () => {
		it('should return null when not interacting', () => {
			const state = createInitialState();
			expect(getInteractionColumnCount(state)).toBeNull();
		});

		it('should return captured column count during interaction', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			const context = createDragContext('pointer');
			context.columnCount = 4;
			state = reducer(state, { type: 'START_INTERACTION', context });

			expect(getInteractionColumnCount(state)).toBe(4);
		});
	});
});

// ============================================================================
// State Machine Instance Tests
// ============================================================================

describe('State Machine Instance', () => {
	let machine: GridiotStateMachine;

	beforeEach(() => {
		machine = createStateMachine();
	});

	it('should return current state', () => {
		const state = machine.getState();
		expect(state.phase).toBe('idle');
	});

	it('should transition and update state', () => {
		machine.transition({ type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		expect(machine.getState().phase).toBe('selected');
	});

	it('should notify subscribers on transition', () => {
		const listener = vi.fn();
		machine.subscribe(listener);

		machine.transition({ type: 'SELECT', itemId: 'item-1', element: createMockElement() });

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({ phase: 'selected' }),
			expect.objectContaining({ type: 'SELECT' })
		);
	});

	it('should NOT notify subscribers when state unchanged', () => {
		const listener = vi.fn();
		machine.subscribe(listener);

		// Try invalid transition (deselect from idle)
		machine.transition({ type: 'DESELECT' });

		expect(listener).not.toHaveBeenCalled();
	});

	it('should allow unsubscribing', () => {
		const listener = vi.fn();
		const unsubscribe = machine.subscribe(listener);

		unsubscribe();
		machine.transition({ type: 'SELECT', itemId: 'item-1', element: createMockElement() });

		expect(listener).not.toHaveBeenCalled();
	});

	it('should check if transition is valid', () => {
		expect(machine.canTransition({ type: 'SELECT', itemId: 'item-1', element: createMockElement() })).toBe(true);
		expect(machine.canTransition({ type: 'DESELECT' })).toBe(false);
		expect(machine.canTransition({ type: 'START_INTERACTION', context: createDragContext('pointer') })).toBe(false);
	});
});

// ============================================================================
// Keyboard Mode Tests
// ============================================================================

describe('Keyboard Mode', () => {
	it('should toggle keyboard mode', () => {
		let state = createInitialState();
		expect(state.keyboardModeActive).toBe(false);

		state = reducer(state, { type: 'TOGGLE_KEYBOARD_MODE' });
		expect(state.keyboardModeActive).toBe(true);

		state = reducer(state, { type: 'TOGGLE_KEYBOARD_MODE' });
		expect(state.keyboardModeActive).toBe(false);
	});

	it('should allow toggling during any phase', () => {
		let state = createInitialState();

		// Toggle from idle
		state = reducer(state, { type: 'TOGGLE_KEYBOARD_MODE' });
		expect(state.keyboardModeActive).toBe(true);

		// Select and toggle
		state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		state = reducer(state, { type: 'TOGGLE_KEYBOARD_MODE' });
		expect(state.keyboardModeActive).toBe(false);

		// Start interaction and toggle
		state = reducer(state, { type: 'TOGGLE_KEYBOARD_MODE' });
		state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('keyboard') });
		state = reducer(state, { type: 'TOGGLE_KEYBOARD_MODE' });
		expect(state.keyboardModeActive).toBe(false);
	});
});

// ============================================================================
// canTransition Tests
// ============================================================================

describe('canTransition', () => {
	it('should validate SELECT transitions', () => {
		const idle = createInitialState();
		expect(canTransition(idle, { type: 'SELECT', itemId: 'x', element: createMockElement() })).toBe(true);

		const selected = reducer(idle, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		expect(canTransition(selected, { type: 'SELECT', itemId: 'x', element: createMockElement() })).toBe(true);

		const interacting = reducer(selected, { type: 'START_INTERACTION', context: createDragContext('pointer') });
		expect(canTransition(interacting, { type: 'SELECT', itemId: 'x', element: createMockElement() })).toBe(false);
	});

	it('should validate START_INTERACTION transitions', () => {
		const idle = createInitialState();
		expect(canTransition(idle, { type: 'START_INTERACTION', context: createDragContext('pointer') })).toBe(false);

		const selected = reducer(idle, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
		expect(canTransition(selected, { type: 'START_INTERACTION', context: createDragContext('pointer') })).toBe(true);

		const interacting = reducer(selected, { type: 'START_INTERACTION', context: createDragContext('pointer') });
		expect(canTransition(interacting, { type: 'START_INTERACTION', context: createResizeContext('pointer') })).toBe(false);
	});
});

// ============================================================================
// Full Workflow Tests
// ============================================================================

describe('Full Workflows', () => {
	describe('Pointer Drag Workflow', () => {
		it('should complete full pointer drag cycle', () => {
			let state = createInitialState();

			// 1. Select item
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			expect(state.phase).toBe('selected');

			// 2. Start drag
			state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
			expect(state.phase).toBe('interacting');
			expect(state.interaction?.type).toBe('drag');
			expect(state.interaction?.useFlip).toBe(true);

			// 3. Update during drag
			state = reducer(state, { type: 'UPDATE_INTERACTION', targetCell: { column: 3, row: 2 } });
			expect(state.interaction?.targetCell).toEqual({ column: 3, row: 2 });

			// 4. Commit
			state = reducer(state, { type: 'COMMIT_INTERACTION' });
			expect(state.phase).toBe('committing');

			// 5. Finish
			state = reducer(state, { type: 'FINISH_COMMIT' });
			expect(state.phase).toBe('selected');
			expect(state.interaction).toBeNull();
		});
	});

	describe('Keyboard Resize Workflow', () => {
		it('should complete full keyboard resize cycle', () => {
			let state = createInitialState();

			// 1. Enter keyboard mode and select
			state = reducer(state, { type: 'TOGGLE_KEYBOARD_MODE' });
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });

			// 2. Start resize
			state = reducer(state, { type: 'START_INTERACTION', context: createResizeContext('keyboard') });
			expect(state.interaction?.type).toBe('resize');
			expect(state.interaction?.useViewTransition).toBe(true);

			// 3. Update size
			state = reducer(state, {
				type: 'UPDATE_INTERACTION',
				targetCell: { column: 1, row: 1 },
				currentSize: { colspan: 3, rowspan: 2 },
			});
			expect(state.interaction?.currentSize).toEqual({ colspan: 3, rowspan: 2 });

			// 4. Commit and finish
			state = reducer(state, { type: 'COMMIT_INTERACTION' });
			state = reducer(state, { type: 'FINISH_COMMIT' });
			expect(state.phase).toBe('selected');
		});
	});

	describe('Cancel Workflow', () => {
		it('should properly cancel and restore state', () => {
			let state = createInitialState();
			state = reducer(state, { type: 'SELECT', itemId: 'item-1', element: createMockElement() });
			state = reducer(state, { type: 'START_INTERACTION', context: createDragContext('pointer') });
			state = reducer(state, { type: 'UPDATE_INTERACTION', targetCell: { column: 5, row: 5 } });

			// Cancel mid-drag
			state = reducer(state, { type: 'CANCEL_INTERACTION' });

			expect(state.phase).toBe('selected');
			expect(state.interaction).toBeNull();
			expect(state.selectedItemId).toBe('item-1'); // Selection preserved
		});
	});
});
