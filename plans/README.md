# Animation Plans

| # | Title | Severity | Status |
|---|-------|----------|--------|
| 001 | Button press soul with ripple and pulse | MEDIUM | DONE (d5f67b1) |
| 002 | Remove animations from high-frequency UI (bottom nav, FAB, filter pills, list cards) | HIGH | TODO |
| 003 | Fix prefers-reduced-motion to keep opacity/color transitions, drop only transform/position | HIGH | TODO |
| 004 | Fix slideIn keyframe: scale(0.95) + opacity:0 + transform-origin for toasts | MEDIUM | TODO |
| 005 | Add easing/duration tokens (--ease-out, --ease-in-out) and migrate all UI entrances/exits | HIGH | TODO |
| 006 | Convert toast/modal entrance to CSS transitions (interruptible) using @starting-style | HIGH | TODO |

Recommended order: 002 → 003 → 005 → 004 → 006

Dependencies:
- 004 depends on 005 (uses `var(--ease-out)` token)
- 006 depends on 005 (uses `var(--duration-normal)`, `var(--ease-out)` tokens)
- 003 can run independently but should precede 005 for consistent reduced-motion behavior
- 002 can run independently