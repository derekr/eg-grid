---
# gridiot-e1ou
title: Remove outdated bundles — keep just one
status: completed
type: task
priority: normal
created_at: 2026-02-09T13:52:51Z
updated_at: 2026-02-09T14:05:01Z
parent: gridiot-a822
---

bundles/core.ts and bundles/minimal.ts produce effectively the same output as bundles/index.ts since engine.ts directly imports all plugins. Nobody gets a smaller bundle.

## Todo
- [ ] Remove bundles/core.ts and bundles/minimal.ts
- [ ] Update build.ts to only produce one bundle (gridiot.js)
- [ ] Remove dist/gridiot-minimal.js and dist/gridiot-core.js outputs
- [ ] Update any imports/references to the removed bundles

## Summary of Changes\n\n- Deleted `bundles/core.ts` and `bundles/minimal.ts` (identical, redundant)\n- Removed their build entries from `build.ts`\n- Removed stale dist outputs (`gridiot-minimal.js`, `gridiot-core.js`)\n- Updated build output messages
