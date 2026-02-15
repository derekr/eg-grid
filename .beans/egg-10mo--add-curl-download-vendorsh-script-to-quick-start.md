---
# egg-10mo
title: Add curl download + vendor.sh script to Quick Start
status: completed
type: feature
priority: normal
created_at: 2026-02-15T20:53:56Z
updated_at: 2026-02-15T20:55:51Z
---

Add a transparent curl one-liner to download bundles from GitHub raw, plus a vendor.sh script that interactively selects a bundle, configures grid columns/items, and outputs starter HTML/CSS.

## Summary of Changes\n\nAdded curl one-liners to Quick Start section for downloading eg-grid.js and eg-grid-element.js directly from GitHub raw. Created vendor.sh interactive script that:\n- Lets user pick core library, web component, or both\n- Downloads to chosen directory\n- Configures grid columns, item count, algorithm, gap\n- Outputs ready-to-use HTML + CSS for both core and web component paths\n\nTested both paths (core + web component) with real downloads from GitHub.
