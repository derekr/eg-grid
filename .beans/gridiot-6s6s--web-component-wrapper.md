---
# gridiot-6s6s
title: Web Component wrapper
status: scrapped
type: feature
priority: normal
created_at: 2026-02-08T15:41:11Z
updated_at: 2026-02-15T20:16:41Z
parent: gridiot-ycu5
---

Create a Web Component (`<grid-iot>` or similar) that wraps the gridiot library for easy drop-in usage.

The web component should:
- Accept configuration via attributes/properties
- Auto-initialize the grid on connected
- Support slot-based children as grid items
- Handle cleanup on disconnected
- Work in any framework or vanilla HTML

This is the primary distribution surface for framework-agnostic usage.

## Reasons for Scrapping

Obsolete after condensed-first restructuring. The old multi-file plugin architecture was replaced with a single-file library. See bean egg-ivjb.
