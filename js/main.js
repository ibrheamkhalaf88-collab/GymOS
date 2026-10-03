// ============================================================
// Digital Pulse — Main Entry Point (Modular)
// ============================================================
import "./app-core.js";
import "./screens/dashboard.js";
import "./screens/roster.js";
import "./screens/hardware.js";
import "./screens/ledger.js";
import "./screens/reports.js";
import "./screens/profile.js";
import "./components/charts.js";
import "./components/notifications.js";
import "./components/modals.js";

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // App is initialized in app-core.js
  console.log("[Digital Pulse] App initialized (modular)");
});

// Export for debugging
window.DigitalPulse = {
  store: () => import("./store.js"),
  license: () => import("./license.js"),
  i18n: () => import("./i18n.js"),
};