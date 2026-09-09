# 004 — Fix slideIn keyframe: scale(0.95) + opacity:0 + transform-origin for toasts

- **Status**: TODO
- **Commit**: 85e85e1
- **Severity**: MEDIUM
- **Category**: Easing & duration + Physicality & origin
- **Estimated scope**: 1 file, ~10 lines

## Problem

The `slideIn` keyframe (`css/theme.css:72-76`) uses `scale(0.98)` + `translateY(-8px)` which feels floaty and doesn't match toast emergence from top-center. Toasts and modals both use this same keyframe but need different origins.

Current:
```css
/* css/theme.css:72-76 — current */
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.slide-in { animation: slideIn 0.2s ease-out both; }
```

Usage:
- Toasts (`theme.css:188`): `.toast { animation: slideIn 0.2s ease-out both; }` — positioned at `top: 1rem; left: 50%; transform: translateX(-50%)` (center-top)
- Modals (`theme.css:211`): `.modal-panel { animation: slideIn 0.22s ease-out both; }` — centered via flexbox on backdrop

Toasts should emerge from their center (scale from center) with slight scale-in, not slide from above.

## Target

Create two keyframes: `slideInToast` for toasts (scale from center) and keep `slideIn` for modals (slide up from bottom). Add `transform-origin` for toasts.

```css
/* css/theme.css:72-76 — replace with two keyframes */
/* Toast: scale from center (0.95) + fade */
@keyframes slideInToast {
  from { opacity: 0; transform: translateX(-50%) scale(0.95); }
  to { opacity: 1; transform: translateX(-50%) scale(1); }
}

/* Modal: slide up from bottom (existing behavior, refined) */
@keyframes slideIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.slide-in { animation: slideIn 0.2s var(--ease-out) both; }
.slide-in-toast { animation: slideInToast 0.18s var(--ease-out) both; transform-origin: center top; }
```

```css
/* css/theme.css:188 — toast uses new keyframe */
.toast {
  ...
  animation: slideInToast 0.18s var(--ease-out) both;
  transform-origin: center top;
}

/* css/theme.css:211 — modal keeps slideIn */
.modal-panel {
  ...
  animation: slideIn 0.22s var(--ease-out) both;
}
```

## Repo conventions to follow

- Easing token `var(--ease-out)` to be added in Plan 005.
- Toast root is positioned at `top: 1rem; left: 50%; transform: translateX(-50%)` (`theme.css:170-173`).
- Modal panel is centered via flexbox on backdrop (`theme.css:196-200`).

## Steps

1. Edit `css/theme.css:72-76` — replace `slideIn` keyframe with two keyframes (`slideInToast` and refined `slideIn`) per target.

2. Edit `css/theme.css:77` — add `.slide-in-toast` utility class with `transform-origin: center top`.

3. Edit `css/theme.css:188` — change `.toast` animation from `slideIn 0.2s ease-out both` to `slideInToast 0.18s var(--ease-out) both` and add `transform-origin: center top`.

4. Edit `css/theme.css:211` — change `.modal-panel` animation from `slideIn 0.22s ease-out both` to `slideIn 0.22s var(--ease-out) both` (use token).

## Boundaries

- Do NOT change toast/modal positioning (CSS layout).
- Do NOT change `js/ui.js` toast creation logic.
- Do NOT add new dependencies.
- If `var(--ease-out)` doesn't exist yet (Plan 005 not applied), use literal `cubic-bezier(0.23, 1, 0.32, 1)` as interim.

## Verification

- **Mechanical**: `npm run lint` → 0 errors.
- **Feel check**:
  - Trigger a toast (e.g., add member) — emerges from center-top with crisp scale(0.95→1) + fade, no vertical slide.
  - Open a modal (e.g., notifications) — slides up from bottom with fade, no scale.
  - In DevTools Animations panel at 10%: confirm toast uses `scale` + `translateX(-50%)`, modal uses `translateY` only.
  - Toggle `prefers-reduced-motion` — both animations disabled (per Plan 003), opacity transition remains.
- **Done when**: Toasts use scale-from-center entrance, modals use slide-up entrance, both use easing token, transform-origin set on toasts.