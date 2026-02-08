---
# gridiot-xhmr
title: Optimize bundle size
status: completed
type: task
priority: normal
created_at: 2026-02-08T20:24:23Z
updated_at: 2026-02-08T20:32:15Z
---

Implement 8 bundle size optimizations identified in analysis:
1. Move resize label CSS to injected style
2. Remove unused placeholder field in resize
3. Extract event name constants to engine.ts
4. Extract getItemSize() to engine.ts
5. Simplify keyboard direction mapping
6. Deduplicate accessibility announcement templates
7. Extract saveLayoutPositions helper in algorithm-harness
8. Add shared attachListeners helper to engine.ts

Target: ~3-3.5 KB minified savings (6-9%)

## Summary of Changes

Implemented 6 of 8 planned optimizations (skipped resize label CSS injection and event name constants as savings were negligible):

- getItemSize() in engine.ts: shared utility for 3 plugins
- listenEvents() in engine.ts: shared helper for accessibility + algorithm-harness
- Keyboard direction mapping: object lookup replaces 2 switch statements
- Announcement template dedup: resolveTemplate() replaces duplicated logic
- saveAndClearPreview() in algorithm-harness: replaces duplicated save+clear
- Removed unused placeholder field from resize.ts

Results: 46,517 bytes minified (was ~47,900). ~1.4 KB saved (3%).
