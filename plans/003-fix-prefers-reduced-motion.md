# 003 — Fix prefers-reduced-motion to keep opacity/color transitions, drop only transform/position

- **Status**: TODO
- **Commit**: 85e85e1
- **Severity**: HIGH
- **Category**: Accessibility + Motion budget
- **Estimated scope**: 1 file, ~15 lines

## Problem

Current `prefers-reduced-motion` media query (`css/theme.css:245-253`) disables ALL animations and transitions including cheap opacity/color feedback:

```css
/* css/theme.css:245-253 — current */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .fade-up { opacity: 1 !important; transform: none !important; }
  .glass-card { backdrop-filter: none !important; }
}
```

This removes critical visual feedback (button hover, toast fade, modal fade, form focus) that users with vestibular disorders still need. Only transform/position animations should be dropped.

Also `index.html:34` has a duplicate stricter rule:
```html
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

## Target

Keep opacity, color, background-color, border-color, box-shadow, filter transitions. Drop only transform, position (top/left/right/bottom), width/height, margin, padding, scroll-behavior.

```css
/* css/theme.css:245-253 — target */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    /* Only drop transform/position transitions */
    transition-duration: 0.01ms !important;
    transition-property: transform, translate, scale, rotate, top, left, right, bottom, width, height, margin, padding !important;
    scroll-behavior: auto !important;
  }
  /* Allow opacity/color transitions to run normally */
  *, *::before, *::after {
    transition-duration: 0.15s !important;
    transition-property: opacity, color, background-color, border-color, box-shadow, filter, fill, stroke !important;
  }
  .fade-up { opacity: 1 !important; transform: none !important; }
  .glass-card { backdrop-filter: none !important; }
  /* Ensure slide-in/slide-up animations (transform-based) are disabled */
  .slide-in,
  .fade-up,
  .bar-animate,
  .animate-pulse-fast {
    animation: none !important;
  }
}
```

And remove the duplicate in `index.html:34`.

## Repo conventions to follow

- Media query lives in `css/theme.css:245` (single source of truth).
- `index.html:34` inline style is a duplicate — remove it.
- Tokens for durations live in `:root` (Plan 004 will add `--duration-fast: 150ms`).

## Steps

1. Edit `css/theme.css:245-253` — replace the entire `@media (prefers-reduced-motion: reduce)` block with the target block above.

2. Edit `index.html:34` — delete the inline `@media (prefers-reduced-motion: reduce)` rule entirely (line 34).

## Boundaries

- Do NOT touch any other media queries.
- Do NOT change `scroll-behavior: smooth` on `html` (line 15) — it's correctly overridden in the media query.
- Do NOT add new dependencies.

## Verification

- **Mechanical**: `npm run lint` → 0 errors.
- **Feel check**: 
  - Enable `prefers-reduced-motion` in DevTools Rendering panel.
  - Hover buttons — brightness/color transition still works.
  - Focus form fields — border-color/box-shadow transition still works.
  - Toast appears — fade-in (opacity) still works, no slide transform.
  - Modal opens — fade-in (opacity) still works, no slide transform.
  - Page scroll — instant (no smooth scroll).
  - Chart bars — no grow animation.
  - In DevTools Animations panel at 10%: confirm opacity/color transitions still have duration, transform transitions are 0.01ms.
- **Done when**: `prefers-reduced-motion` keeps opacity/color/box-shadow/filter transitions at normal speed, drops only transform/position/scroll animations. No duplicate rule in `index.html`.