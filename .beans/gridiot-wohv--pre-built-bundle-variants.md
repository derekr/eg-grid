---
# gridiot-wohv
title: Pre-built bundle variants
status: scrapped
type: task
priority: normal
created_at: 2026-02-08T15:41:01Z
updated_at: 2026-02-15T20:16:19Z
parent: gridiot-ycu5
---

Define and build a set of pre-built bundles that cover common use cases:

- **All / Kitchen Sink** — every plugin included
- **Core** — engine only, bring your own plugins
- **Minimal** — pointer only (already exists as gridiot-minimal.js)
- **Standard** — pointer + keyboard + accessibility + push algorithm (the most common combo)

Update build.ts to produce these variants. Each should have a clear name and be documented.

## Reasons for Scrapping

Obsolete after condensed-first restructuring. The old multi-file plugin architecture was replaced with a single-file library. See bean egg-ivjb.
