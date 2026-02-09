---
# gridiot-uzp8
title: Insert/delete interactions for grid items
status: draft
type: feature
created_at: 2026-02-09T05:26:14Z
updated_at: 2026-02-09T05:26:14Z
---

Add insert and delete as first-class interaction types alongside drag and resize.

## Insert
- User can create new grid items by clicking/tapping on empty cells
- State machine gets a new interaction type: `'insert'`
- Insert plugin emits insert-start/confirm/cancel events
- Algorithm plugins handle layout adjustment when a new item is added

## Delete
- User can remove grid items (e.g. via keyboard shortcut on selected item, or a delete button)
- State machine gets a new interaction type: `'delete'` (or just a one-shot event)
- Delete plugin emits delete events
- Algorithm plugins handle layout compaction when an item is removed

## Why
These are natural extensions of the interaction model. The state machine already prevents concurrent interactions — adding insert/delete as proper interaction types means they get mutual exclusion with drag/resize for free, plus accessibility announcements, undo support, etc.

## Open Questions
- Should delete go through the state machine (it's instantaneous, not a multi-step interaction)?
- Insert UX: click empty cell? Drag from palette? Both?
- How does insert interact with the layout model (responsive)?
