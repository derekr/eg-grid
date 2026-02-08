---
# gridiot-0joz
title: Extract pure resize algorithm to resize-core.ts
status: todo
type: task
created_at: 2026-02-08T05:39:19Z
updated_at: 2026-02-08T05:39:19Z
parent: gridiot-b1da
---

Create pure function with no DOM access, matching the `algorithm-push-core.ts` pattern.

Input: grid dimensions, handle, pointer position, constraints
Output: new cell position and span

Enables unit testing without DOM.
