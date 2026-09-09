# 005 — Add easing/duration tokens (--ease-out, --ease-in-out) and migrate all UI entrances/exits

- **Status**: TODO
- **Commit**: 85e85e1
- **Severity**: HIGH
- **Category**: Easing & duration + Consistency
- **Estimated scope**: 2 files, ~40 lines

## Problem

No centralized easing/duration tokens. Every component hardcodes curves and durations:
- `theme.css:54-58` `pulse-fast`: `cubic-bezier(0.4, 0, 0.6, 1)` 1.5s
- `theme.css:60-64` `growUp`: `ease-out` 0.9s
- `theme.css:66-70` `fadeUp`: `ease-out` 0.35s
- `theme.css:72-76` `slideIn`: `ease-out` 0.2s
- `theme.css:78-83` `.pressable`: `ease` 0.12s/0.18s/0.18s
- `theme.css:84` `button:active, a:active`: implicit default
- `theme.css:85-86` `btnPulse`: `ease-out` 0.45s
- `theme.css:87-88` `shake`: `ease` 0.25s
- `theme.css:124` `.dp-field`: `ease` 0.15s
- `theme.css:188` `.toast`: `ease-out` 0.2s
- `theme.css:211` `.modal-panel`: `ease-out` 0.22s
- `app.html:44` `.feature-card`: `ease` 0.2s
- `app.html:91-93` CTA buttons: `duration-200`
- `app.js:132-143` bottom nav: `transition-colors` (no duration)
- `app.js:173` sidebar: `transition-all`
- `app.js:448` filter pills: `transition-transform`
- `app.js:563,633` cards: `transition-colors`
- `js/ui.js:21-23` toast exit: `opacity .3s` hardcoded inline style

Inconsistent curves, no shared vocabulary, impossible to tune globally.

## Target

Add tokens to `:root` (`css/theme.css:6-13`) and migrate every transition/animation to use them.

```css
/* css/theme.css:6-13 — add tokens to :root */
:root {
  --bg: #000000;
  --surface: #171717;
  --border: #333333;
  --volt: #ccff00;
  --alert: #ff3366;
  --frost: #9bafbc;

  /* Motion tokens */
  --duration-instant: 0ms;
  --duration-fast: 120ms;      /* press, hover */
  --duration-normal: 180ms;    /* toast, modal, panel */
  --duration-slow: 300ms;      /* page sections, charts */
  --duration-slower: 500ms;    /* complex sequences */

  --ease-linear: linear;
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* for playful moments */
}
```

Migration map (every occurrence):

| Location | Current | Target |
|---|---|---|
| `theme.css:58` `.animate-pulse-fast` | `cubic-bezier(0.4, 0, 0.6, 1) 1.5s` | `var(--ease-in-out) var(--duration-slower)` |
| `theme.css:64` `.bar-animate` | `ease-out 0.9s` | `var(--ease-out) var(--duration-slow)` |
| `theme.css:70` `.fade-up` | `ease-out 0.35s` | `var(--ease-out) var(--duration-normal)` |
| `theme.css:76` `.slide-in` | `ease-out 0.2s` | `var(--ease-out) var(--duration-normal)` |
| `theme.css:79` `.pressable` transitions | `ease 0.12s/0.18s/0.18s` | `var(--ease-out) var(--duration-fast)` |
| `theme.css:86` `.btn-pulse:active` | `ease-out 0.45s` | `var(--ease-spring) var(--duration-slow)` |
| `theme.css:88` `.shake` | `ease 0.25s` | `var(--ease-in-out) var(--duration-fast)` |
| `theme.css:124` `.dp-field` | `ease 0.15s` | `var(--ease-out) var(--duration-fast)` |
| `theme.css:188` `.toast` | `ease-out 0.2s` | `var(--ease-out) var(--duration-normal)` |
| `theme.css:211` `.modal-panel` | `ease-out 0.22s` | `var(--ease-out) var(--duration-normal)` |
| `app.html:44` `.feature-card` | `ease 0.2s` | `var(--ease-out) var(--duration-fast)` |
| `app.html:91,208` CTA buttons | `duration-200` (Tailwind) | `var(--ease-out) var(--duration-fast)` |
| `js/ui.js:22` toast exit inline | `opacity .3s` | `opacity var(--duration-normal) var(--ease-out)` via class |

## Repo conventions to follow

- Tokens live in `css/theme.css:6` `:root`.
- Tailwind config (`js/tailwind-config.js`) can reference CSS variables but we'll use raw CSS for motion.
- Exemplar: `theme.css:79` `.pressable` already uses discrete transitions — extend pattern.

## Steps

1. Edit `css/theme.css:6-13` — add motion tokens to `:root` block.

2. Edit `css/theme.css:58` — `.animate-pulse-fast { animation: pulse-fast var(--duration-slower) var(--ease-in-out) infinite; }`

3. Edit `css/theme.css:64` — `.bar-animate { animation: growUp var(--duration-slow) var(--ease-out) forwards; }`

4. Edit `css/theme.css:70` — `.fade-up { animation: fadeUp var(--duration-normal) var(--ease-out) both; }`

5. Edit `css/theme.css:76` — `.slide-in { animation: slideIn var(--duration-normal) var(--ease-out) both; }`

6. Edit `css/theme.css:79` — `.pressable { transition: transform var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out), filter var(--duration-fast) var(--ease-out); }`

7. Edit `css/theme.css:83` — `.pressable::after { transition: opacity var(--duration-normal) var(--ease-out); }`

8. Edit `css/theme.css:86` — `.btn-pulse:active { animation: btnPulse var(--duration-slow) var(--ease-spring); }`

9. Edit `css/theme.css:88` — `.shake { animation: shake var(--duration-fast) var(--ease-in-out); }`

10. Edit `css/theme.css:124` — `.dp-field { transition: all var(--duration-fast) var(--ease-out); }` (keep `all` for form fields — low frequency)

11. Edit `css/theme.css:188` — `.toast { animation: slideInToast var(--duration-normal) var(--ease-out) both; }` (uses Plan 004 keyframe)

12. Edit `css/theme.css:211` — `.modal-panel { animation: slideIn var(--duration-normal) var(--ease-out) both; }`

13. Edit `app.html:44` — `.feature-card { transition: transform var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out); }`

14. Edit `app.html:91,208` — CTA buttons: replace `duration-200` with inline style `style="transition: transform var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);"` or add utility class.

15. Edit `js/ui.js:21-23` — replace inline style with class-based exit:
    ```javascript
    // before
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    // after: add .toast-exit class in CSS
    el.classList.add("toast-exit");
    ```

16. Add to `css/theme.css` after `.toast`:
    ```css
    .toast-exit { opacity: 0; transition: opacity var(--duration-normal) var(--ease-out); }
    ```

## Boundaries

- Do NOT change Tailwind config for motion — use CSS variables directly.
- Do NOT change chart animation (`drawCheckinsChart`) — Chart.js handles its own.
- Do NOT add new dependencies.
- If a step doesn't match code at commit 85e85e1, STOP and report.

## Verification

- **Mechanical**: `npm run lint` → 0 errors.
- **Feel check**:
  - Press any button — 120ms ease-out scale.
  - Hover form field — 120ms ease-out border glow.
  - Toast appears — 180ms ease-out scale+fade; dismisses — 180ms ease-out fade.
  - Modal opens — 180ms ease-out slide+fade.
  - Feature cards hover — 120ms ease-out lift+glow.
  - In DevTools Animations panel at 10%: all UI entrances/exits use exactly two curves (ease-out for entrance, ease-in for exit) and three durations (120/180/300ms).
  - Change `--duration-normal` to `500ms` in DevTools — all toasts/modals/fade-ups slow down together.
- **Done when**: Every transition/animation in CSS uses a token from `:root`. Zero hardcoded `ease`, `ease-out`, `cubic-bezier`, or numeric durations remain in motion properties.