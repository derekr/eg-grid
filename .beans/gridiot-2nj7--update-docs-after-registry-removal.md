---
# gridiot-2nj7
title: Update docs after registry removal
status: completed
type: task
priority: normal
created_at: 2026-02-09T13:52:51Z
updated_at: 2026-02-09T14:05:10Z
parent: gridiot-a822
---

README.md and docs/guides/accessibility.md reference removed functions and patterns.

## Todo
- [ ] Remove setItemCell() references from README.md
- [ ] Remove registerPlugin() custom plugin pattern from README.md
- [ ] Update docs/guides/accessibility.md to remove registerPlugin() example (lines ~239-268)
- [ ] Review other docs/ files for stale references

## Summary of Changes\n\n- README.md: Removed `setItemCell`, `registerPlugin`, `disablePlugins`, `attachPlaceholderStyles`, old `plugins` option, provider registry references, old bundle table (3 bundles → 1)\n- README.md: Updated `InitOptions` to show new direct plugin options (`pointer: false`, `resize: {...}`, etc.)\n- README.md: Updated `GridiotCore` interface to include `stateMachine`, `styles`, `selectedItem`, `select()`, `deselect()`, `getGridInfo()`\n- README.md: Updated algorithm and placeholder sections to reflect built-in defaults\n- CLAUDE.md + AGENTS.md: Removed plugin registry, provider registry, `setItemCell`, auto-register pattern, stale bundle refs\n- docs/guides/getting-started.md: Removed `setItemCell` import/usage\n- docs/guides/custom-algorithms.md: Replaced `setItemCell` with inline style equivalents\n- docs/guides/accessibility.md: Replaced `registerPlugin` example with `attach*` function pattern\n- examples/advanced.html: Replaced `disablePlugins` with new option format
