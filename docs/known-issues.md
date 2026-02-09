# Known Issues

Browser-specific quirks and limitations.

## Firefox: ghost element on drop

When dropping an item, a duplicate of the element briefly appears and shrinks into the center of the dropped item's final position. Only observed in Firefox — Chromium browsers are unaffected. Could be a Firefox View Transitions bug or something in our implementation; needs investigation.

**Impact:** Cosmetic only — layout correctness is unaffected.
