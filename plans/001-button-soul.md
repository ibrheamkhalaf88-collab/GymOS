# 001 — Button press soul with ripple and pulse

- **Status**: DONE (implemented in d5f67b1)
- **Commit**: d5f67b1
- **Severity**: MEDIUM
- **Category**: Easing & duration + Physicality & origin + Performance
- **Estimated scope**: 1 file, ~11 lines

## Problem

Buttons lacked tactile soul; press felt flat. `css/theme.css:78` had minimal `transform 0.12s ease` with `scale(0.95)` only, no hover glow or ripple. `transition: all` risk and no `prefers-reduced-motion` handling. Quote:

```css
/* css/theme.css:78 — before */
.pressable { transition: transform 0.12s ease; }
.pressable:active { transform: scale(0.95); }
```

## Target

Exact end state per AUDIT.md (--ease-out, 100-160ms press):

```css
/* css/theme.css:78 — target */
.pressable { position:relative; overflow:hidden; transition: transform 0.12s ease, box-shadow 0.18s ease, filter 0.18s ease; }
.pressable:active { transform: scale(0.96); }
.pressable:hover { filter: brightness(1.08); }
.pressable::after { content:""; position:absolute; inset:0; background:radial-gradient(circle at var(--x,50%) var(--y,50%), rgba(204,255,0,0.18), transparent 55%); opacity:0; transition: opacity 0.25s; pointer-events:none; }
.pressable:active::after { opacity:1; }
button:active, a:active { transform: scale(0.97); }
@keyframes btnPulse { 0%{ box-shadow:0 0 0 0 rgba(204,255,0,0.4);} 70%{ box-shadow:0 0 0 10px rgba(204,255,0,0);} 100%{ box-shadow:0 0 0 0 rgba(204,255,0,0);} }
.btn-pulse:active { animation: btnPulse 0.45s ease-out; }
```

## Repo conventions to follow

- Tokens live in `css/theme.css:6` `:root { --volt:#ccff00 }`; no new JS deps.
- Exemplar: `.pressable` already used in `app.html` and `ibrheam.html` buttons with `active:scale-95`.

## Steps

1. Edit `css/theme.css:78` replace 2 lines with 11 lines above.

## Boundaries

- Do NOT touch markup in `app.html`/`ibrheam.html` beyond class.
- Do NOT add Framer Motion or new deps.

## Verification

- **Mechanical**: `npm run lint` → 0 errors.
- **Feel check**: Click any `.pressable` button → scales to 0.96 in 120ms ease-out, shows radial glow at cursor, hover brightens. Spam click never restarts from zero. In DevTools Animations at 10% confirm ease-out curve. Toggle `prefers-reduced-motion` → movement drops but opacity remains.
- **Done when**: Buttons feel tactile, no `transition: all` remains.

