---
# egg-ivjb
title: 'Condensed-first: make condensed the default'
status: in-progress
type: milestone
priority: normal
created_at: 2026-02-15T19:37:06Z
updated_at: 2026-02-15T19:37:35Z
---

Major direction shift: condensed single-file becomes the canonical eg-grid. The library philosophy is vendor-it-in, not install-from-npm. Use your LLM to customize. No versions, no publishing.

## Competitive Context

```
                     eg-grid          Packery 2        gridster.js       react-grid-layout
                     (condensed)
                     ────────────     ────────────     ────────────      ─────────────────
Min size             29 KB            ~38 KB           ~32 KB            ~43 KB
Gzip (est.)          8.8 KB           ~12 KB           ~10 KB            ~13 KB
Dependencies         0                0 (bundled)      jQuery (~30 KB)   React (~42 KB)
Total w/ deps        29 KB            ~48 KB           ~62 KB            ~85 KB+
Framework            none             none             jQuery            React only

Layout engine        CSS Grid         abs positioning  abs positioning   CSS Transforms
Drag                 ✓                ✓ (addon)        ✓                 ✓
Resize               ✓ (8-way)        ✗                ✓                 ✓ (SE only)
Keyboard             ✓                ✗                ✗                 ✗
Accessibility        ✓ (ARIA)         ✗                ✗                 ✗
View Transitions     ✓                ✗                ✗                 ✗
Vendorable           ✓ (1 file)       npm/CDN          npm/CDN           npm only
```

## Core Values (preserve these)

- CSS Grid does layout math — JS only sets grid-column/grid-row, browser computes pixels
- Style injection via `<style>` elements, never inline styles (View Transitions require it)
- State machine for core logic (phase: idle → selected → interacting)
- Data attributes for state (`data-egg-*`), CSS selectors for styling
- Custom events for plugin coordination
- Zero dependencies
- Platform-first: maximize browser features, minimize JavaScript

## Critical & Opinionated: Vendor-First Philosophy

This is NOT a library you install from npm. It IS a working solution you copy into your codebase and own.
- No versions. No publishing. No semver.
- Copy the file. Read it. Tweak it. Use your LLM to customize.
- One file = one grep away from understanding everything.
- The condensed file IS the documentation — readable code, not API docs.

## Work Items

- [ ] Verify condensed works with existing examples (skip workers)
- [ ] Remove non-essential source files (old plugin architecture)
- [ ] New bundle structure: base (eg-grid.js), element (eg-grid-element.js), responsive (standalone import)
- [ ] Update build.ts for new bundle targets
- [ ] Rewrite README with comparison table, vendor-first philosophy, core values
- [ ] Update CLAUDE.md / AGENTS.md for new structure
- [ ] Clean up examples (Architecture Explorer → condensed, remove redundant)
- [ ] Scrap/archive old beans that no longer apply (plugin registry, CDN distribution, etc.)
