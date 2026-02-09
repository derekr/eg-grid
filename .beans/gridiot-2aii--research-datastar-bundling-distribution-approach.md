---
# gridiot-2aii
title: Research Datastar bundling & distribution approach
status: completed
type: task
priority: normal
created_at: 2026-02-08T15:40:53Z
updated_at: 2026-02-08T16:05:40Z
parent: gridiot-ycu5
---

Study how Datastar handles bundling, distribution, and custom builds. Their plugin architecture inspired ours, so see what patterns they use for:

- Custom bundle builder (they may have a web UI)
- CDN distribution (jsDelivr, unpkg, etc.)
- Pre-built bundle variants
- Release workflow

Reference: https://github.com/starfederation/datastar

## Research Findings

### Datastar's Approach
- **Bundle builder**: Web UI at data-star.dev/bundler with plugin checkboxes → custom bundle download
- **CDN**: jsDelivr via npm (`@starfederation/datastar`). For us (no npm): use jsDelivr GitHub provider `cdn.jsdelivr.net/gh/basedash/gridiot@tag/dist/file.js`
- **Build system**: esbuild, same as ours. ESM output, sideEffects: true
- **Bundle variants**: Full (~14-15KB gzip) + core + individual. Most users just use full bundle
- **Release workflow**: GitHub Actions → build → tag → npm publish
- **Plugin pattern**: Identical to ours — singleton registry, side-effect imports, entry point files

### Key Takeaway
Our architecture already mirrors Datastar's. The gaps are operational: bundle tooling, CDN setup, release automation.
