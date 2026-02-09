---
# gridiot-ufmj
title: React integration via web component
status: todo
type: task
priority: normal
created_at: 2026-02-09T16:34:15Z
updated_at: 2026-02-09T16:36:05Z
blocked_by:
    - gridiot-bdjk
---

Document and demo how to use <eg-grid> web component in React projects.

## Approach

No first-class React wrapper. React uses the web component directly.

### Pattern

- ref + useEffect for event listening (gridiot:* events use colons, React JSX can't map them)
- Attributes passed as JSX props
- MutationObserver in web component handles React child reconciliation

### Deliverables

- [ ] React usage example in docs
- [ ] TypeScript JSX declaration (IntrinsicElements) for eg-grid
- [ ] Note about dynamic children + MutationObserver debouncing
