# 002 — Remove animations from high-frequency UI (bottom nav, FAB, filter pills, list cards)

- **Status**: TODO
- **Commit**: 85e85e1
- **Severity**: HIGH
- **Category**: Performance + Motion budget
- **Estimated scope**: 3 files, ~30 lines

## Problem

High-frequency UI elements animate on every interaction, violating the 200ms motion budget and creating jank on low-end devices.

**Bottom nav** (`app.html:70-91`):
```html
<button data-tab="dashboard" class="nav-tab flex flex-col items-center justify-center text-on-surface-variant hover:text-primary-fixed transition-colors active:scale-90 w-16">
```
Uses `transition-colors` + `active:scale-90` (transform on every tap).

**FAB** (`app.html:94-96`):
```html
<button id="fab" class="fixed z-40 bottom-[100px] right-4 md:right-auto md:left-[calc(100%-4.5rem)] md:hidden w-14 h-14 rounded-full bg-primary text-black shadow-neon-lg flex items-center justify-center active:scale-90 transition-transform">
```
Uses `active:scale-90 transition-transform` on every press.

**Filter pills** (`app.js:447-454`):
```javascript
<button data-filter="${f}" class="roster-filter whitespace-nowrap px-4 py-1.5 rounded-full border font-label uppercase tracking-widest text-[10px] active:scale-95 transition-transform flex flex-col items-center
  ${f === rosterFilter
    ? "border-primary bg-primary/10 text-primary"
    : "border-outline-variant bg-surface-container text-muted hover:text-white"}">
```
Uses `active:scale-95 transition-transform` on every filter tap.

**List cards** — trainer cards (`app.js:563`) and member cards (`app.js:633`):
```html
<div data-trainer="${t.id}" class="bg-surface cyber-border ... hover:bg-surface-hover transition-colors cursor-pointer group active:scale-[0.98]">
<div data-member="${m.id}" class="bg-surface cyber-border ... rounded-lg p-4 flex items-center gap-4 hover:bg-surface-hover transition-colors cursor-pointer group active:scale-[0.98]">
```
Uses `transition-colors` + `active:scale-[0.98]` on every card tap.

**Sidebar links** (`app.html:173`):
```html
<a href="#/${tab}" data-tab="${tab}" class="flex items-center gap-3 px-4 py-3 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-all active:scale-[0.98]">
```
Uses `transition-all` (anti-pattern) + `active:scale-[0.98]`.

## Target

Remove all transform animations (scale) from high-frequency interactive elements. Keep only color/opacity transitions (cheap, GPU-friendly). No `transition-all`.

```css
/* css/theme.css — add utility classes */
.no-scale-active:active { transform: none !important; }
.no-scale-hover:hover { transform: none !important; }
.transition-colors-only { transition: color 0.15s var(--ease-out), background-color 0.15s var(--ease-out), border-color 0.15s var(--ease-out); }
```

```html
<!-- app.html:71 — bottom nav buttons -->
<button data-tab="dashboard" class="nav-tab flex flex-col items-center justify-center text-on-surface-variant hover:text-primary-fixed transition-colors-only w-16 no-scale-active">

<!-- app.html:94 — FAB -->
<button id="fab" class="fixed z-40 bottom-[100px] right-4 md:right-auto md:left-[calc(100%-4.5rem)] md:hidden w-14 h-14 rounded-full bg-primary text-black shadow-neon-lg flex items-center justify-center no-scale-active transition-colors-only">

<!-- app.html:173 — sidebar links -->
<a href="#/${tab}" data-tab="${tab}" class="flex items-center gap-3 px-4 py-3 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors-only no-scale-active">
```

```javascript
// app.js:448 — filter pills
<button data-filter="${f}" class="roster-filter whitespace-nowrap px-4 py-1.5 rounded-full border font-label uppercase tracking-widest text-[10px] no-scale-active transition-colors-only flex flex-col items-center ...">

// app.js:563 — trainer cards
<div data-trainer="${t.id}" class="bg-surface cyber-border ... hover:bg-surface-hover transition-colors-only cursor-pointer group no-scale-active">

// app.js:633 — member cards
<div data-member="${m.id}" class="bg-surface cyber-border ... rounded-lg p-4 flex items-center gap-4 hover:bg-surface-hover transition-colors-only cursor-pointer group no-scale-active">
```

## Repo conventions to follow

- Easing tokens in `css/theme.css:6` `:root` (to be added in Plan 004).
- Exemplar: `theme.css:79` `.pressable` already uses discrete transitions (`transform`, `box-shadow`, `filter`) not `transition: all`.
- Utility classes live in `css/theme.css`.

## Steps

1. Add utility classes to `css/theme.css` after `.pressable` block (~line 88):
   ```css
   .no-scale-active:active { transform: none !important; }
   .no-scale-hover:hover { transform: none !important; }
   .transition-colors-only { transition: color 150ms var(--ease-out), background-color 150ms var(--ease-out), border-color 150ms var(--ease-out); }
   ```

2. Edit `app.html:71,75,79,83,87` — add `transition-colors-only no-scale-active` to all 5 `.nav-tab` buttons, remove `active:scale-90`.

3. Edit `app.html:94` — replace `active:scale-90 transition-transform` with `no-scale-active transition-colors-only` on `#fab`.

4. Edit `app.html:173` — replace `transition-all active:scale-[0.98]` with `transition-colors-only no-scale-active` on sidebar links.

5. Edit `app.js:448` — replace `active:scale-95 transition-transform` with `no-scale-active transition-colors-only` in filter pills template.

6. Edit `app.js:563` — replace `hover:bg-surface-hover transition-colors cursor-pointer group active:scale-[0.98]` with `hover:bg-surface-hover transition-colors-only cursor-pointer group no-scale-active` in `trainerCard()`.

7. Edit `app.js:633` — replace `hover:bg-surface-hover transition-colors cursor-pointer group active:scale-[0.98]` with `hover:bg-surface-hover transition-colors-only cursor-pointer group no-scale-active` in `memberCard()`.

## Boundaries

- Do NOT touch markup structure — only class lists.
- Do NOT change `hover:bg-surface-hover` (color transition is fine).
- Do NOT add new dependencies.
- If a step doesn't match the code at commit 85e85e1, STOP and report.

## Verification

- **Mechanical**: `npm run lint` → 0 errors.
- **Feel check**: 
  - Tap bottom nav 5x rapidly — no scale flash, only color swap.
  - Tap FAB 5x — no scale, instant color response.
  - Tap filter pills — no scale, instant active-state color.
  - Tap member/trainer cards — no scale, instant hover color.
  - In DevTools Animations panel at 10% playback: confirm no transform keyframes fire on these elements.
  - Toggle `prefers-reduced-motion` — color transitions remain, no movement.
- **Done when**: Zero transform animations on bottom nav, FAB, filter pills, list cards, sidebar links. Only color/opacity transitions remain.