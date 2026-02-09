---
# gridiot-p89q
title: Release workflow
status: todo
type: task
created_at: 2026-02-08T15:41:07Z
updated_at: 2026-02-08T15:41:07Z
parent: gridiot-ycu5
---

Establish a process for creating releases:

- Version tagging strategy (semver)
- GitHub Releases with dist/ artifacts attached
- Changelog generation (or manual)
- Potentially a simple script or GH Action to automate: build → tag → release

This unblocks CDN distribution since jsDelivr can serve from GitHub releases.
