---
# egg-1a0s
title: Cross-grid coordinator plugin
status: draft
type: feature
created_at: 2026-02-09T21:36:12Z
updated_at: 2026-02-09T21:36:12Z
---

Design and implement cross-grid dragging support. Allow items to be dragged between multiple eg-grid instances.

## Design Doc (from thoughts/cross-grid-coordinator.md)

### Coordinator API

Two approaches explored:

**Option A: Explicit coordinator**
```typescript
const coordinator = createCoordinator();
coordinator.register(grid1.element);
coordinator.register(grid2.element);
```

**Option B (preferred): Simple plugin per grid**
```typescript
enableCrossGrid(grid1);
enableCrossGrid(grid2);
```

### New Events

| Event | When |
|-------|------|
| egg-item-enter | Foreign item enters grid |
| egg-item-move | Foreign item moves within grid |
| egg-item-leave | Item leaves grid (no drop) |
| egg-item-transferred | Item dropped on other grid (source cleanup) |
| egg-item-received | Item dropped here from other grid (target finalize) |

### Algorithm Updates Needed

Algorithms need to handle foreign items — create virtual item for layout calculation, store original positions for reset on leave, finalize on receive.

### PDD Interop

EG Grid is compelling for grid-to-grid drag (CSS Grid awareness, View Transitions). For heterogeneous containers (grid to list/tree), users can bridge to Pragmatic Drag and Drop with ~10 lines. Key differentiator: View Transitions support (PDD has open issue #150 with no solution).

### Recommendation

- Grid-to-grid: Keep as simple EG Grid plugin
- Grid-to-list/tree: That is PDD territory, document the escape hatch
- Don't build PDD adapters unless there is clear demand

### Open Questions

1. Auto-detect grids vs explicit registration?
2. Transfer control — should users be able to prevent/customize DOM transfer?
3. Different cell sizes between grids?
4. Animation on transfer — FLIP across grids?
