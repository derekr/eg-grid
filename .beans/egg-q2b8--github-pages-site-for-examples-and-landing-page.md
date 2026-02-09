---
# egg-q2b8
title: GitHub Pages site for examples and landing page
status: completed
type: feature
priority: normal
created_at: 2026-02-09T19:24:28Z
updated_at: 2026-02-09T19:30:16Z
---

Set up a build pipeline so the examples (and optionally a landing page) are built as a static site and deployed to GitHub Pages.

## Requirements

- Built site served via GitHub Pages
- Vite dev server continues to serve everything during development
- `examples/` stays as a top-level directory (good for repo browsing)
- Library bundle (eg-grid.js) included in the built site

## Open Questions

- [x] Structure: root `index.html` that also bundles examples, or a separate `site/` dir?
- [x] Landing page: just a redirect to examples for now, or a real landing page?
- [x] Vite config: multi-page app build (`build.rollupOptions.input`) pointing at example HTML files?
- [x] GitHub Actions: workflow to build and deploy on push to main?

## Tasks

- [x] Decide on directory structure / build approach
- [x] Configure Vite for multi-page static site build
- [x] Add GitHub Actions workflow for Pages deployment
- [x] Verify dev server still works as before
- [x] Add landing page (or redirect) at root

## Summary of Changes

- Root index.html landing page linking to all three examples
- vite.config.ts multi-page build outputting to dist/site/
- package.json build:site script
- .github/workflows/pages.yml builds on push to main, deploys to GitHub Pages
- Nav links in all examples updated with EG Grid link back to landing page
- Dev server unchanged, pnpm dev still works as before
