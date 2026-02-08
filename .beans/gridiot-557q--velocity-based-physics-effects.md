---
# gridiot-557q
title: Velocity-based physics effects
status: todo
type: feature
priority: low
created_at: 2026-02-08T05:39:49Z
updated_at: 2026-02-08T05:39:49Z
---

Apply CSS transforms to the dragged item based on velocity to give it weight/inertia. Card 'sways' when pulled quickly.

- [ ] Add velocity tracking to pointer plugin (VelocitySample[] ring buffer)
- [ ] Expose velocityX/velocityY in 'drag' provider
- [ ] Create `plugins/physics.ts` with configurable parameters
- [ ] Apply transforms during drag (rotation/skew based on velocity)
- [ ] Animate back to neutral on drop
- [ ] Add toggle in dev overlay
