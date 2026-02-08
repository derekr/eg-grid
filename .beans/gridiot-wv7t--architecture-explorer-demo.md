---
# gridiot-wv7t
title: Architecture explorer demo
status: completed
type: feature
priority: normal
created_at: 2026-02-08T14:55:21Z
updated_at: 2026-02-08T15:15:02Z
---

Interactive demo page that visualizes gridiot's architecture in action. Two main panels:

## Plugin Composer
Toggle plugins on/off live to demonstrate the engine+plugin architecture:
- Core only (grid renders, nothing interactive)
- + Pointer (items draggable, drop in place)
- + Algorithm (items push each other)
- + Keyboard (arrow key navigation)
- + Placeholder (drop preview)
- + Resize (resize handles)
- + Camera (auto-scroll)

Each toggle immediately attaches/detaches the plugin.

## Event Flow Sidebar
Real-time visualization of what's happening under the hood:
- Event stream (events light up as they fire)
- Provider state (live readout of drag/resize/state providers)
- Injected CSS (actual CSS being written to `<style>`)
- State machine phase (idle → interacting → committing)

## Tasks
- [x] Create examples/architecture.html scaffold
- [x] Build plugin toggle UI with live attach/detach
- [x] Build event stream panel (subscribe to all gridiot: events)
- [x] Build provider state panel (poll providers on requestAnimationFrame)
- [x] Build CSS inspector panel (MutationObserver on style element)
- [x] Build state machine phase indicator
- [x] Style the whole page to feel polished
- [x] Test all plugin combinations work correctly


## Summary of Changes

Created `examples/architecture.html` — an interactive architecture explorer demo with:

- **Plugin Composer**: 7 toggleable plugins (Pointer, Keyboard, Algorithm, Placeholder, Resize, Camera, Accessibility) grouped as Input vs Behavior, with live attach/detach
- **State Machine**: Real-time phase indicator (idle → selected → interacting → committing) with context display
- **Event Stream**: Flashing badges for all 10 event types (selection, drag, resize) with counters
- **Provider Registry**: Live display of registered providers and their current values
- **CSS Inspector**: MutationObserver-powered display of injected CSS from the algorithm plugin

Also added Architecture nav link to Basic and Advanced examples.
