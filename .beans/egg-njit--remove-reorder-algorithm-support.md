---
# egg-njit
title: Remove reorder algorithm support
status: completed
type: task
priority: normal
created_at: 2026-02-15T21:09:14Z
updated_at: 2026-02-15T21:11:47Z
---

Remove all reorder algorithm references from source code, vendor script, docs, and examples

## Summary of Changes\n\nRemoved all reorder algorithm support:\n- **src/eg-grid.ts**: Removed `reflowItems()`, `calculateReorderLayout()`, reorder branches in `calcLayout()`, drop-preview emission, reorder exports, and `'reorder'` from InitOptions type\n- **src/eg-grid-element.ts**: Simplified algorithm attribute parsing (no more reorder branch)\n- **vendor.sh**: Removed reorder from algorithm prompt\n- **index.html**: Updated feature description and options table\n- **README.md**: Updated algorithm option and removed reorder export\n- **CLAUDE.md/AGENTS.md**: Removed reorder references\n- **dist/algorithm-reorder.***: Deleted standalone bundle files\n- Rebuilt dist bundles (core: 8.8→8.4 KB gzip)
