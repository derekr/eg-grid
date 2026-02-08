---
# gridiot-p6ja
title: Consider View Transitions for resize instead of FLIP
status: todo
type: task
priority: low
created_at: 2026-02-08T05:39:31Z
updated_at: 2026-02-08T05:39:31Z
parent: gridiot-b1da
---

CLAUDE.md says 'Always use View Transitions when available' but resize currently disables them (`viewTransitionName = 'none'` at line 809). FLIP works but is more JavaScript, less 'Platform First'. May require careful testing.
