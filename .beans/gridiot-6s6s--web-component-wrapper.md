---
# gridiot-6s6s
title: Web Component wrapper
status: draft
type: feature
created_at: 2026-02-08T15:41:11Z
updated_at: 2026-02-08T15:41:11Z
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
