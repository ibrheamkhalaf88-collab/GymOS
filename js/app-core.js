// ============================================================
// Digital Pulse — App Core (Entry Point & Router)
// Shared helpers, router, init, guards
// ============================================================

import { store, PLANS, planPrices, savePlanPrices } from "./store.js";
import { clearJwt } from "./db.js";
import { license } from "./license.js";
import { i18n, currentLang } from "./i18n.js";
import { showToast, openModal, confirmDialog, fmt, initials, escapeHtml } from "./ui.js";
import { sanitizeName, sanitizeAmount, sanitizePhone, validatePassword } from "./validate.js";
import { appConfig } from "./config.js";
import { install as installAccess } from "./access.js";
import { DAY_MS, VALIDATION, TIER_LABEL, LICENSE_TIER, FILTER_EMOJI } from "./constants.js";
import "./sync-status-ui.js";

// Import screen modules
import { viewDashboard, drawCheckinsChart } from "./screens/dashboard.js";
import { viewRoster } from "./screens/roster.js";
import { viewHardware } from "./screens/hardware.js";
import { viewLedger } from "./screens/ledger.js";
import { viewReports } from "./screens/reports.js";
import { viewProfile } from "./screens/profile.js";

// Import component functions
import { syncExpiryNotifications, effStatus, effectiveLicense, currentIdentity, gymName, applyGymName, waDigits, waReminderLink, waWinbackLink, syncExpiryNotifications as syncExpiry } from "./components/notifications.js";
import { openMemberModal, openMemberDetail, openRenewModal, openTrainerForm, openTrainerDetails, openSalaryModal, openTxModal, openPlanPrices, openGymNameModal, printMemberCard, printMonthlyReport, exportCSVs, downloadCSV, tierLabel } from "./components/modals.js";
import { trainerStatus, trainerCard, memberAvatar, memberCard, openMemberModal as memberModal, openMemberDetail as memberDetail, openRenewModal as renewModal, openTrainerForm as trainerForm, openTrainerDetails as trainerDetails, openSalaryModal as salaryModal, openTxModal as txModal, openPlanPrices as planPricesModal, openGymNameModal as gymNameModal, printMemberCard as printCard, printMonthlyReport as printReport, exportCSVs as exportCSV, downloadCSV as downloadCSV } from "./components/modals.js";

// Re-export for backward compatibility
export { tierLabel, trainerStatus, trainerCard, memberAvatar, memberCard, memberModal, memberDetail, renewModal, trainerForm, trainerDetails, salaryModal, txModal, planPricesModal, gymNameModal, printCard, printReport, exportCSV, downloadCSV };

// Import chart functions
import { drawCheckinsChart, ensureChart, destroyCharts, trackChart, charts } from "./components/charts.js";

// ============================================================
// Constants & State
// ============================================================
const $ = (sel, root = document) => root.querySelector(sel);
const screen = document.getElementById("screen");
let currentTab = "dashboard";
let ledgerOffset = 0;
let rosterFilter = "active";
let rosterQuery = "";

// Use shared constants
const DAY = DAY_MS;
const nf = new Intl.NumberFormat("en-US");

// ============================================================
// Force Update Check (APK only)
// ============================================================
enforceUpdateIfNeeded().catch(() => {});

async function enforceUpdateIfNeeded() {
  const isNative = !!(window.Capacitor && window.Capacitor.isNative);
  if (!isNative) return;
  const lastCheck = Number(localStorage.getItem("dp_last_version_check") || 0);
  if (Date.now() - lastCheck < 6 * 3600 * 1000) return;
  if (!navigator.onLine) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch("https://api.github.com/repos/ibrheamkhalaf88-collab/GymOS/releases/latest", {
      headers: { "Accept": "application/vnd.github+json" },
      signal: ctrl.signal
    });
    clearTimeout(t);
    if (!res.ok) return;
    const data = await res.json();
    const latest = String(data.tag_name || "").replace(/^v/, "");
    if (!latest) return;
    if (cmpVersion(latest, appConfig.appVersion) > 0) {
      const apk = (data.assets || []).find((a) => /apk/i.test(a.name || ""));
      showUpdateOverlay(apk ? apk.browser_download_url : "https://github.com/ibrheamkhalaf88-collab/GymOS/releases/latest");
    }
    localStorage.setItem("dp_last_version_check", String(Date.now()));
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
}

function cmpVersion(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1; if (x < y) return -1;
  }
  return 0;
}

function sanitizeUrl(url) {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return url;
  } catch {}
  return "#";
}

function showUpdateOverlay(apkUrl) {
  const safeUrl = sanitizeUrl(apkUrl);
  document.body.innerHTML = '<div style="position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:#000;color:#fff;text-align:center;padding:32px;font-family:sans-serif">' +
    '<div style="font-size:72px;color:#ccff00">⬇</div>' +
    '<h1 style="font-size:24px;margin:0;font-weight:800">تحديث مطلوب</h1>' +
    '<p style="color:#bdbdbd;max-width:300px;margin:0;line-height:1.6;direction:rtl">يتوفر إصدار أحدث من التطبيق. يرجى التحديث للمتابعة.</p>' +
    '<a href="' + safeUrl + '" target="_blank" rel="noopener" style="margin-top:8px;padding:14px 28px;border-radius:14px;background:#ccff00;color:#000;font-weight:800;text-decoration:none">تحديث الآن</a>' +
    '<p style="font-size:11px;color:#777;margin:8px 0 0">Update / حدّث التطبيق</p>' +
    '</div>';
}

// ============================================================
// Auth & Sync Initialization
// ============================================================
import { supabase } from "./supabase-client.js";

(async function initAuth() {
  try {
    const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    if (session && session.user) {
      localStorage.setItem('dp_user_email', session.user.email || '');
      if (!license.get()) {
        try { const { linkCloudIdentity } = await import("./cloud-link.js"); await linkCloudIdentity(supabase); } catch {}
      }
    } else {
      const demoUser = localStorage.getItem('dp_current_user');
      if (demoUser) {
        try {
          const user = JSON.parse(demoUser);
          localStorage.setItem('dp_user_email', user.email || '');
        } catch {}
      }
    }
    const lic = JSON.parse(localStorage.getItem('dp_license') || 'null');
    if (lic && lic.data_enabled !== false && lic.sync_enabled !== false) store.startSync();
  } catch (e) {
    const demoUser = localStorage.getItem('dp_current_user');
    if (demoUser) {
      try {
        const user = JSON.parse(demoUser);
        localStorage.setItem('dp_user_email', user.email || '');
        if (user.subscription === 'trial' && Date.now() > user.subEnd) {
          localStorage.removeItem('dp_current_user');
          localStorage.removeItem('dp_user_email');
          window.location.href = 'login.html';
          return;
        }
      } catch {}
      try {
        const lic = JSON.parse(localStorage.getItem('dp_license') || 'null');
        if (lic && lic.data_enabled !== false && lic.sync_enabled !== false) store.startSync();
      } catch {}
      console.warn('[initAuth] skipped (no connection or auth error):', e?.message || e);
  }
})();

// ============================================================
// Helpers (shared across screens)
// ============================================================
function gymName() {
  return (localStorage.getItem("dp_gym_name") || "").trim() || "DIGITAL PULSE";
}
function applyGymName() {
  document.querySelectorAll("[data-gym-name]").forEach((el) => { el.textContent = gymName(); });
}

function waDigits(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}
function waReminderLink(m) {
  const days = Math.max(0, Math.ceil((m.expiresAt - Date.now()) / DAY));
  const txt = `مرحباً ${m.name} 👋 اشتراكك في ${gymName()} ${days === 0 ? "انتهى اليوم" : `ينتهي خلال ${days} أيام`}. يسعدنا تجديد اشتراكك 💪`;
  return `https://wa.me/${waDigits(m.phone)}?text=${encodeURIComponent(txt)}`;
}
function waWinbackLink(m) {
  const txt = `مرحباً ${m.name} 👋 وحشتنا في ${gymName()}! اشتراكك انتهى. جدد الآن وارجع لتمرينك 💪`;
  return `https://wa.me/${waDigits(m.phone)}?text=${encodeURIComponent(txt)}`;
}

// ============================================================
// Router
// ============================================================
export function show(tab, keepScroll = false) {
  if (!keepScroll) window.scrollTo({ top: 0 });
  const prevTab = currentTab;
  currentTab = tab;
  if (tab === "ledger" && prevTab !== "ledger") ledgerOffset = 0;
  destroyCharts();
  const titles = {
    dashboard: ["DASHBOARD", "الرئيسية"],
    roster: ["MEMBER ROSTER", "قائمة الأعضاء"],
    hardware: ["HARDWARE STATUS", "حالة الأجهزة"],
    ledger: ["LEDGER", "المالية"],
    reports: ["MONTHLY REPORTS", "التقارير الشهرية"],
    profile: ["PROFILE", "حسابي"],
  };
  $("#pageTitleEn").textContent = titles[tab][0];
  $("#pageTitleAr").textContent = titles[tab][1];

  // Bottom nav (mobile)
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("text-primary-fixed", active);
    btn.classList.toggle("bg-surface-container-highest", active);
    btn.classList.toggle("rounded-xl", active);
    btn.classList.toggle("px-3", active);
    btn.classList.toggle("py-1", active);
    btn.classList.toggle("drop-shadow-[0_0_8px_rgba(204,255,0,0.4)]", active);
    btn.classList.toggle("text-on-surface-variant", !active);
    const icon = btn.querySelector(".material-symbols-outlined");
    icon.style.fontVariationSettings = active ? "'FILL' 1" : "'FILL' 0";
  });

  // Desktop drawer
  document.querySelectorAll("#sideNav [data-tab]").forEach((a) => {
    const active = a.dataset.tab === tab;
    a.classList.toggle("bg-primary-fixed", active);
    a.classList.toggle("text-black", active);
    a.classList.toggle("font-bold", active);
    a.classList.toggle("text-on-surface-variant", !active);
    a.classList.toggle("hover:bg-surface-container-high", !active);
    const icon = a.querySelector(".material-symbols-outlined");
    if (icon) icon.style.fontVariationSettings = active ? "'FILL' 1" : "'FILL' 0";
  });

  if ($("#pageActions")) $("#pageActions").innerHTML = "";
  screen.innerHTML = "";
  ({ dashboard: viewDashboard, roster: viewRoster, hardware: viewHardware, ledger: viewLedger, reports: viewReports, profile: viewProfile }[tab] || viewDashboard)();
}

document.querySelectorAll(".nav-tab").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));

// Sidebar nav
(function buildSidebar() {
  const items = [
    ["dashboard", "dashboard", "Dashboard", "الرئيسية"],
    ["roster", "group", "Roster", "الأعضاء"],
    ["ledger", "account_balance_wallet", "Ledger", "المالية"],
    ["profile", "account_circle", "Profile", "حسابي"],
  ];
  $("#sideNav").innerHTML = items.map(([tab, icon, en, ar]) => `
    <a href="#/${tab}" data-tab="${tab}" class="flex items-center gap-3 px-4 py-3 rounded-full text-on-surface-variant hover:bg-surface-container-high transition-all active:scale-[0.98]">
      <span class="material-symbols-outlined text-[22px]">${icon}</span>
      <span class="flex flex-col leading-tight">
        <span class="font-headline uppercase tracking-tight text-sm">${en}</span>
        <span class="font-arabic text-[10px] opacity-60">${ar}</span>
      </span>
    </a>`).join("");
  document.querySelectorAll("#sideNav [data-tab]").forEach((a) =>
    a.addEventListener("click", (e) => { e.preventDefault(); show(a.dataset.tab); }));
})();

// ============================================================
// Notifications Dropdown
// ============================================================
$("#mNotifBtn").addEventListener("click", () => {
  const t = i18n.t;
  const list = store.all("notifications");
  const sevStyle = (sev) => sev === "alert" ? "#ff3366" : sev === "info" ? "#ccff00" : "#d1e5f3";
  openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-4">${t.systemFeed}</h3>
    <div class="flex flex-col gap-2">
      ${list.map((n) => `
        <div class="rounded-2xl bg-surface-container p-3 flex justify-between items-center gap-2"
             style="border-inline-start:2px solid ${sevStyle(n.severity)}">
          <div>
            <p class="font-headline font-bold text-sm">${escapeHtml(currentLang() === "ar" ? n.titleAr : n.titleEn)}</p>
            <p class="text-xs text-muted mt-0.5">${escapeHtml(currentLang() === "ar" ? n.subAr : n.subEn)}</p>
          </div>
          <span class="text-[10px] text-muted whitespace-nowrap font-mono">${fmt.timeAgo(n.time, currentLang())}</span>
        </div>`).join("")}
    </div>`);
});

if (store.all("notifications").length) $("#notifDot").classList.remove("hidden");

$("#mProfileBtn").addEventListener("click", () => show("profile"));
$("#logoutBtnSide").addEventListener("click", deactivateLicense);

async function deactivateLicense() {
  const ok = await confirmDialog({
    titleEn: "Log out?",
    titleAr: "تسجيل الخروج؟",
    confirmText: "Logout",
  });
  if (!ok) return;
  try { store.stopSync && store.stopSync(); } catch {}
  localStorage.removeItem('dp_current_user');
  localStorage.removeItem('dp_user_email');
  localStorage.removeItem('dp_user_id');
  localStorage.removeItem('dp_google_email');
  license.clear();
  try { clearJwt(); } catch {}
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('sb-') && (k.includes('auth-token') || k.includes('code-verifier'))) localStorage.removeItem(k);
  });
  sessionStorage.clear();
  window.location.href = 'login.html';
}

// FAB
document.getElementById("fab").addEventListener("click", () => {
  if (currentTab === "roster") openMemberModal();
  else if (currentTab === "ledger") openTxModal();
  else openMemberModal();
});

// Subscriptions
store.subscribe("members", () => { if (currentTab === "roster") viewRoster(); });
store.subscribe("devices", () => { if (currentTab === "hardware") viewHardware(); });
store.subscribe("ledger", () => { if (currentTab === "ledger") viewLedger(); });
document.addEventListener("langchange", () => show(currentTab, true));

// ============================================================
// Sync Status Bar (shared)
// ============================================================
export function updateSyncStatusBar() {
  const status = store.syncStatus();
  const bar = $("#syncStatusBar");
  if (!bar) return;
  const icon = $("#syncStatusIcon");
  const text = $("#syncStatusText");
  const detail = $("#syncStatusDetail");
  const pending = $("#syncPendingCount");
  const btn = $("#syncNowBtn");

  if (!icon || !text || !detail) return;

  const states = {
    ok: { icon: "cloud_done", text: "✅ Synced", detail: "All data up to date", color: "text-primary" },
    pending: { icon: "cloud_upload", text: "⏳ Syncing…", detail: "Pushing local changes", color: "text-frost" },
    error: { icon: "cloud_off", text: "❌ Sync Error", detail: "Will retry automatically", color: "text-alert" },
    off: { icon: "cloud_queue", text: "☁️ Offline", detail: "Cloud sync disabled", color: "text-muted" },
    syncing: { icon: "sync", text: "🔄 Syncing…", detail: "Merging with cloud", color: "text-frost" }
  };
  const s = states[status.state] || states.off;
  icon.textContent = s.icon;
  text.textContent = s.text;
  text.className = `font-headline text-sm font-bold uppercase tracking-wider ${s.color}`;
  detail.textContent = s.detail;
  if (pending) pending.classList.toggle("hidden", status.state !== "pending");
  if (btn) btn.style.display = status.state === "error" ? "flex" : "none";
}

// Listen for sync status changes
window.addEventListener("dp:syncstatus", updateSyncStatusBar);