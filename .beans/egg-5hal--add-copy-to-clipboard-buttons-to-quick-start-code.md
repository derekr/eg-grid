---
# egg-5hal
title: Add copy-to-clipboard buttons to Quick Start code blocks
status: completed
type: task
priority: normal
created_at: 2026-02-15T20:59:31Z
updated_at: 2026-02-15T21:00:56Z
---

Add copy buttons to pre blocks in Quick Start section using navigator.clipboard.writeText()

## Summary of Changes\n\nAdded copy-to-clipboard buttons to all `<pre>` code blocks in the docs page:\n- CSS: positioned top-right, subtle glass style, appears on hover, green "Copied!" feedback\n- JS: captures textContent before appending button (avoids copying button text), uses navigator.clipboard.writeText()\n- 8 buttons total across all code blocks
