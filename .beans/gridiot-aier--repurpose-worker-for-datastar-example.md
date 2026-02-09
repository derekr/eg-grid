---
# gridiot-aier
title: Repurpose worker for Datastar example
status: todo
type: task
created_at: 2026-02-09T13:52:51Z
updated_at: 2026-02-09T13:52:51Z
parent: gridiot-a822
---

The worker currently generates custom bundles with stale exports (registerPlugin, getPlugin, setItemCell). Since plugin toggling is being removed and there's only one bundle now, repurpose the Cloudflare Worker to serve a Datastar integration example instead.

## Todo
- [ ] Remove or gut worker/src/bundler.ts and worker/src/sources.ts
- [ ] Repurpose worker for Datastar example (see bean gridiot-v2p5 for context)
- [ ] Update worker deployment config if needed
