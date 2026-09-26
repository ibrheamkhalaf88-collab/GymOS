// ============================================================
// PWA bootstrap — service worker registration for EVERY page.
// ============================================================
// This used to live inline in app.html only. That made the install fragile:
// the manifest's start_url is onboarding.html, so a user who added the app to
// their home screen from there never had a service worker registered at all —
// no offline shell, and the install was not a real PWA. Registering here means
// whichever page they land on wires it up.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* file://, insecure origin, or a private-mode browser — not fatal */
    });
  });
}

// iOS has no beforeinstallprompt event and ignores the manifest's display mode
// for the home-screen icon, so hint the user once if they are on iOS/iPadOS and
// have not already dismissed it. Suppressed entirely once installed.
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;
if (isIOS && !isStandalone && !localStorage.getItem("dp_ios_hint_dismissed")) {
  window.addEventListener("load", () => setTimeout(showIOSInstallHint, 2500));
}

function showIOSInstallHint() {
  if (document.getElementById("dp-ios-hint")) return;
  const el = document.createElement("div");
  el.id = "dp-ios-hint";
  el.setAttribute("role", "status");
  el.style.cssText = [
    "position:fixed", "left:12px", "right:12px", "bottom:calc(12px + env(safe-area-inset-bottom))",
    "z-index:9998", "padding:14px 16px", "border-radius:16px",
    "background:#111", "color:#fff", "font:500 13px/1.5 system-ui,sans-serif",
    "box-shadow:0 8px 30px rgba(0,0,0,.5)", "border:1px solid #CCFF0044",
    "display:flex", "gap:12px", "align-items:flex-start",
  ].join(";");
  el.innerHTML =
    '<div style="flex:1">' +
    '<strong style="color:#CCFF00">Add to Home Screen</strong><br>' +
    'Tap <span style="font-size:15px">􀈂</span> Share &rarr; <em>Add to Home Screen</em> to run Digital Pulse full screen.' +
    '</div>';
  const close = document.createElement("button");
  close.textContent = "✕";
  close.setAttribute("aria-label", "Dismiss");
  close.style.cssText = "background:none;border:0;color:#888;font-size:18px;cursor:pointer;padding:0 2px";
  close.addEventListener("click", () => {
    try { localStorage.setItem("dp_ios_hint_dismissed", "1"); } catch {}
    el.remove();
  });
  el.appendChild(close);
  document.body.appendChild(el);
  setTimeout(() => { try { localStorage.setItem("dp_ios_hint_dismissed", "1"); } catch {} el.remove(); }, 15000);
}
