---
# gridiot-hq4i
title: jsDelivr CDN distribution
status: todo
type: task
priority: normal
created_at: 2026-02-08T15:41:04Z
updated_at: 2026-02-08T16:14:26Z
parent: gridiot-ycu5
blocked_by:
    - gridiot-wohv
    - gridiot-p89q
---

Set up serving gridiot bundles via jsDelivr (https://www.jsdelivr.com).

No npm publishing. Two CDN paths:

1. **jsDelivr GitHub provider**: `cdn.jsdelivr.net/gh/basedash/gridiot@v1.0.0/dist/gridiot.js` — serves from tagged GitHub releases. Requires dist/ committed or attached to releases.

2. **Cloudflare Worker direct serving**: The same Worker that handles custom bundling can also serve pre-built variants at well-known paths (e.g., `/bundles/gridiot.js`, `/bundles/gridiot-minimal.js`).

Depends on having pre-built bundles and a release workflow.
