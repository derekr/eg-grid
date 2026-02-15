---
# gridiot-p89q
title: Release workflow
status: scrapped
type: task
priority: normal
created_at: 2026-02-08T15:41:07Z
updated_at: 2026-02-15T20:16:21Z
parent: gridiot-ycu5
---

Establish a process for creating releases:

- Version tagging strategy (semver)
- GitHub Releases with dist/ artifacts attached
- Changelog generation (or manual)
- Potentially a simple script or GH Action to automate: build → tag → release

This unblocks CDN distribution since jsDelivr can serve from GitHub releases.

## Reasons for Scrapping

Obsolete after condensed-first restructuring. The old multi-file plugin architecture was replaced with a single-file library. See bean egg-ivjb.
