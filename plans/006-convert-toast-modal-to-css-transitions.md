# 006 — Convert toast/modal entrance to CSS transitions (interruptible) using @starting-style

- **Status**: TODO
- **Commit**: 85e85e1
- **Severity**: HIGH
- **Category**: Physicality & origin + Performance + Accessibility
- **Estimated scope**: 2 files, ~25 lines

## Problem

Toasts and modals use `@keyframes` animations (`slideInToast`, `slideIn`) which are **not interruptible** — if user triggers rapid toasts or opens/closes modal quickly, animations queue or restart from zero, causing visual glitches.

Current:
- Toast (`theme.css:179-190`): `.toast { animation: slideInToast 0.18s var(--ease-out) both; transform-origin: center top; }`
- Modal (`theme.css:205-215`): `.modal-panel { animation: slideIn 0.22s var(--ease-out) both; }`

`js/ui.js:12-25` creates toasts imperatively, `js/ui.js:27-35` creates modals imperatively.

## Target

Use CSS transitions with `@starting-style` for entrance. This makes them interruptible — if state changes mid-transition, browser smoothly transitions to new state.

```css
/* css/theme.css — replace .toast and .modal-panel animation with transitions */

/* Toast: transition-based entrance + exit */
.toast {
  display: flex; align-items: center; gap: 0.65rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-inline-start: 3px solid var(--volt);
  border-radius: 0.9rem;
  padding: 0.75rem 1rem;
  font-size: 0.85rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  pointer-events: auto;
  /* Entrance transition */
  opacity: 1;
  transform: translateX(-50%) scale(1);
  transition: opacity var(--duration-normal) var(--ease-out),
              transform var(--duration-normal) var(--ease-out);
  transform-origin: center top;
}

/* Starting style for entrance (applied before first paint) */
@starting-style {
  .toast {
    opacity: 0;
    transform: translateX(-50%) scale(0.95);
  }
}

/* Exit class — applied by JS before removal */
.toast-exit {
  opacity: 0;
  transform: translateX(-50%) scale(0.95);
}

/* Modal: transition-based entrance + exit */
.modal-panel {
  width: 100%; max-width: 480px;
  max-height: 90vh; overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 2rem 2rem 0 0;
  /* Entrance transition */
  opacity: 1;
  transform: translateY(0);
  transition: opacity var(--duration-normal) var(--ease-out),
              transform var(--duration-normal) var(--ease-out);
}

@media (min-width: 640px) {
  .modal-panel { border-radius: 2rem; }
}

@starting-style {
  .modal-panel {
    opacity: 0;
    transform: translateY(12px);
  }
}

/* Exit class for modal */
.modal-panel-exit {
  opacity: 0;
  transform: translateY(12px);
}
```

```javascript
// js/ui.js:12-25 — showToast: add class, use transitionend for removal
export function showToast(message, type = "ok", ms = 2600) {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  const el = document.createElement("div");
  el.className = `toast ${type === "err" ? "err" : "ok"}`;
  const icon = type === "err" ? "error" : "check_circle";
  const prefix = type === "err" ? "⚠️ " : "✅ ";
  el.innerHTML = `
    <span class="material-symbols-outlined text-[18px]">${icon}</span>
    <span>${prefix}${escapeHtml(message)}</span>`;
  root.appendChild(el);

  // Entrance is automatic via @starting-style
  // Schedule exit
  setTimeout(() => {
    el.classList.add("toast-exit");
    // Remove after transition ends
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }, ms);
}

// js/ui.js:27-35 — openModal: add class, use transitionend for removal
export function openModal(html, { onClose } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const panel = document.createElement("div");
  panel.className = "modal-panel p-6";
  panel.innerHTML = html;
  backdrop.appendChild(panel);

  const close = () => {
    panel.classList.add("modal-panel-exit");
    panel.addEventListener("transitionend", () => {
      backdrop.remove();
      onClose && onClose();
    }, { once: true });
  };

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  return { close, el: backdrop };
}
```

## Repo conventions to follow

- `@starting-style` requires Chrome 117+, Firefox 120+, Safari 17.5+ — acceptable for this PWA.
- Motion tokens from Plan 005 (`--duration-normal`, `--ease-out`).
- `js/ui.js` is the single source for toast/modal creation.

## Steps

1. Edit `css/theme.css:179-190` — replace `.toast` animation block with transition-based version + `@starting-style` + `.toast-exit` class.

2. Edit `css/theme.css:205-215` — replace `.modal-panel` animation block with transition-based version + `@starting-style` + `.modal-panel-exit` class.

3. Edit `js/ui.js:12-25` — rewrite `showToast` to use `.toast-exit` class and `transitionend` for removal (remove inline style manipulation).

4. Edit `js/ui.js:27-35` — rewrite `openModal` to use `.modal-panel-exit` class and `transitionend` for removal.

## Boundaries

- Do NOT change toast/modal HTML structure or positioning.
- Do NOT add polyfills for `@starting-style` — graceful degradation: if unsupported, entrance is instant (no animation), exit still works.
- Do NOT change `confirmDialog` (uses `openModal` internally — will inherit fix).
- If browser doesn't support `@starting-style`, entrance is instant — acceptable per progressive enhancement.

## Verification

- **Mechanical**: `npm run lint` → 0 errors.
- **Feel check**:
  - Rapidly trigger 5 toasts (e.g., spam "Add Member") — each enters smoothly, no queue buildup, no restart-from-zero.
  - Open/close modal rapidly (click notifications bell 5x) — each opens/closes smoothly, no jank.
  - In DevTools Animations panel: confirm transitions (not keyframes) fire for entrance/exit.
  - Toggle `prefers-reduced-motion` — entrance/exit instant (0.01ms per Plan 003), opacity transition remains.
  - Test in Firefox/Safari — entrance instant (no @starting-style), exit animated.
- **Done when**: Toasts and modals use interruptible CSS transitions with `@starting-style` for entrance. No `@keyframes` for these components. Rapid interactions never cause visual glitches.