// ============================================================
// Digital Pulse â€” main SPA logic (pixel-faithful to Stitch designs)
// Screens: dashboard / roster / hardware / ledger / reports / profile
// ============================================================

import { store, PLANS, planPrices, savePlanPrices } from "./store.js";
import { license } from "./license.js";
import { i18n, currentLang } from "./i18n.js";
import { showToast, openModal, confirmDialog, fmt, initials, escapeHtml } from "./ui.js";
import { sanitizeName, sanitizeAmount, sanitizePhone } from "./validate.js";
import { appConfig } from "./config.js";

const $ = (sel, root = document) => root.querySelector(sel);
const screen = document.getElementById("screen");
let currentTab = "dashboard";
let charts = [];

// ---------- Force update (native APK only) â€” non-blocking with timeout + cache ----------
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
    const res = await fetch("https://api.github.com/repos/ibrheamkhalaf88-collab/GymOS/releases/latest", { headers: { "Accept": "application/vnd.github+json" }, signal: ctrl.signal });
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
    '<div style="font-size:72px;color:#ccff00">â¬‡</div>' +
    '<h1 style="font-size:24px;margin:0;font-weight:800">طھط­ط¯ظٹط« ظ…ط·ظ„ظˆط¨</h1>' +
    '<p style="color:#bdbdbd;max-width:300px;margin:0;line-height:1.6;direction:rtl">ظٹطھظˆظپط± ط¥طµط¯ط§ط± ط£ط­ط¯ط« ظ…ظ† ط§ظ„طھط·ط¨ظٹظ‚. ظٹط±ط¬ظ‰ ط§ظ„طھط­ط¯ظٹط« ظ„ظ„ظ…طھط§ط¨ط¹ط©.</p>' +
    '<a href="' + safeUrl + '" target="_blank" rel="noopener" style="margin-top:8px;padding:14px 28px;border-radius:14px;background:#ccff00;color:#000;font-weight:800;text-decoration:none">طھط­ط¯ظٹط« ط§ظ„ط¢ظ†</a>' +
    '<p style="font-size:11px;color:#777;margin:8px 0 0">Update / ط­ط¯ظ‘ط« ط§ظ„طھط·ط¨ظٹظ‚</p>' +
    '</div>';
}

// ---------- Guards ----------
// License check removed - site is now free

// Start multi-device sync only when cloud data + sync are enabled
const _lic = license.get();
if (_lic && _lic.data_enabled && _lic.sync_enabled) store.startSync();

// ---------- Helpers ----------
const DAY = 86400000;
function effStatus(m) {
  if (Date.now() > m.expiresAt) return "expired";
  return m.status === "frozen" ? "frozen" : (m.status === "trial" && Date.now() <= m.expiresAt ? "trial" : "active");
}
const nf = new Intl.NumberFormat("en-US");

function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }
function trackChart(c) { charts.push(c); return c; }
let chartLoading = null;
function ensureChart() {
  if (window.Chart) return Promise.resolve();
  if (chartLoading) return chartLoading;
  chartLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/chart.umd.min.js";
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return chartLoading;
}
function rerender() { show(currentTab, true); }

store.subscribe("members", () => rerender());
store.subscribe("devices", () => rerender());
store.subscribe("ledger", () => rerender());
document.addEventListener("langchange", rerender);

// ---------- Router ----------
export function show(tab, keepScroll = false) {
  if (!keepScroll) window.scrollTo({ top: 0 });
  const prevTab = currentTab;
  currentTab = tab;
  // Finance always opens on the CURRENT month (today) unless you are
  // already browsing inside it
  if (tab === "ledger" && prevTab !== "ledger") ledgerOffset = 0;
  destroyCharts();
  const titles = {
    dashboard: ["DASHBOARD", "ط§ظ„ط±ط¦ظٹط³ظٹط©"],
    roster: ["MEMBER ROSTER", "ظ‚ط§ط¦ظ…ط© ط§ظ„ط£ط¹ط¶ط§ط،"],
    hardware: ["HARDWARE STATUS", "ط­ط§ظ„ط© ط§ظ„ط£ط¬ظ‡ط²ط©"],
    ledger: ["LEDGER", "ط§ظ„ظ…ط§ظ„ظٹط©"],
    reports: ["MONTHLY REPORTS", "ط§ظ„طھظ‚ط§ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹط©"],
    profile: ["PROFILE", "ط­ط³ط§ط¨ظٹ"],
  };
  $("#pageTitleEn").textContent = titles[tab][0];
  $("#pageTitleAr").textContent = titles[tab][1];

  // Bottom nav (mobile) â€” active tab per design: filled pill + volt text
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

  // Desktop drawer â€” active item per roster design
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

// Sidebar nav built here (shared markup for all tabs)
(function buildSidebar() {
  const items = [
    ["dashboard", "dashboard", "Dashboard", "ط§ظ„ط±ط¦ظٹط³ظٹط©"],
    ["roster", "group", "Roster", "ط§ظ„ط£ط¹ط¶ط§ط،"],
    ["ledger", "account_balance_wallet", "Ledger", "ط§ظ„ظ…ط§ظ„ظٹط©"],
    ["profile", "account_circle", "Profile", "ط­ط³ط§ط¨ظٹ"],
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

// ---------- Notifications dropdown ----------
$("#mNotifBtn").addEventListener("click", () => {
  const t = i18n.t;
  const list = store.all("notifications");
  openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight mb-4">${t.systemFeed}</h3>
    <div class="flex flex-col gap-2">
      ${list.map((n) => `
        <div class="rounded-2xl bg-surface-container p-3 flex justify-between items-center gap-2"
             style="border-inline-start:2px solid ${n.severity === "alert" ? "#ff3366" : n.severity === "info" ? "#ccff00" : "#d1e5f3"}">
          <div>
            <p class="font-headline font-bold text-sm">${currentLang() === "ar" ? n.titleAr : n.titleEn}</p>
            <p class="text-xs text-muted mt-0.5">${currentLang() === "ar" ? n.subAr : n.subEn}</p>
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
    titleEn: "Clear all data?",
    titleAr: "ظ…ط³ط­ ط¬ظ…ظٹط¹ ط§ظ„ط¨ظٹط§ظ†ط§طھطں",
    confirmText: "Clear",
    danger: true,
  });
  if (ok) {
    store.resetAll();
    location.reload();
  }
}

// ---------- FAB ----------
document.getElementById("fab").addEventListener("click", () => {
  if (currentTab === "roster") openMemberModal();
  else if (currentTab === "ledger") openTxModal();
  else openMemberModal();
});

/* ============================================================
   DASHBOARD  (docs/design/dashboard_unified)
   ============================================================ */
function viewDashboard() {
  const s = store.stats();
  const lic = license.get();

  // System feed derived from real data + notifications
  const feed = [];
  store.all("devices").filter((d) => d.maintenanceStatus === "in-repair").slice(0, 1).forEach((d) =>
    feed.push({ sev: "alert",
      en: `${d.code} Offline`, ar: `${d.name} ظ…طھظˆظ‚ظپ`,
      subEn: d.issue || "Maintenance required", subAr: "ظٹطھط·ظ„ط¨ طµظٹط§ظ†ط©",
      time: d.updatedAt || Date.now() }));
  feed.push({ sev: "info", en: "Capacity Alert", ar: "طھظ†ط¨ظٹظ‡ ط§ظ„ط³ط¹ط©",
    subEn: `Floor utilization at ${Math.min(95, 40 + s.activeMembers * 5)}%`,
    subAr: `ط§ط³طھط®ط¯ط§ظ… ط§ظ„طµط§ظ„ط© ط¨ظ†ط³ط¨ط© ظھ${Math.min(95, 40 + s.activeMembers * 5)}`,
    time: Date.now() - 3600000 });
  store.all("notifications").slice(0, 1).forEach((n) =>
    feed.push({ sev: n.severity, en: n.titleEn, ar: n.titleAr, subEn: n.subEn, subAr: n.subAr, time: n.time }));

  const absTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  screen.innerHTML = `
  <!-- Metrics Grid -->
  <div class="grid grid-cols-2 gap-4">
    <!-- Active Members -->
    <div class="stat-card cursor-pointer bg-surface border border-outline-variant p-4 h-[130px] flex flex-col justify-between relative overflow-hidden group hover:bg-surface-hover transition-colors">
      <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
        <span>ًں‘¥ Active Members</span><span dir="rtl" class="font-arabic">ط§ظ„ط£ط¹ط¶ط§ط، ط§ظ„ظ†ط´ط·ظٹظ†</span>
      </p>
      <div class="flex items-end justify-between">
        <p class="font-display font-bold text-5xl tabular-nums text-white mt-2">${nf.format(s.activeMembers)}</p>
        <span class="material-symbols-outlined text-white opacity-20 text-4xl absolute -bottom-2 -right-2 group-hover:opacity-40 transition-opacity">group</span>
      </div>
    </div>
    <!-- Ended Today -->
    <div class="stat-card cursor-pointer bg-surface border border-outline-variant p-4 h-[130px] flex flex-col justify-between relative overflow-hidden group hover:bg-surface-hover transition-colors">
      <div class="flex items-start justify-between">
        <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
          <span>âڈ³ Ended Today</span><span dir="rtl" class="font-arabic">ط§ظ†طھظ‡طھ ط§ظ„ظٹظˆظ…</span>
        </p>
        <div class="w-2 h-2 rounded-full bg-alert shadow-neon-alert animate-pulse-fast mt-1"></div>
      </div>
      <div class="flex items-end justify-between">
        <p class="font-display font-bold text-5xl tabular-nums text-alert mt-2">${s.endedToday}</p>
        <span class="material-symbols-outlined text-alert opacity-20 text-4xl absolute -bottom-2 -right-2 group-hover:opacity-40 transition-opacity">event_busy</span>
      </div>
    </div>
    <!-- Total Profit -->
    <div class="stat-card cursor-pointer bg-surface border border-outline-variant p-4 h-[100px] flex flex-col justify-between hover:bg-surface-hover transition-colors">
      <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
        <span>&nbsp;</span><span>ط§ط¬ظ…ط§ظ„ظٹ ط§ظ„ط§ط±ط¨ط§ط­&nbsp;</span>
      </p>
      <p class="font-display font-bold text-3xl tabular-nums text-muted mt-1" dir="ltr">${fmt.money(Math.max(0, s.totalRevenue - s.totalExpenses))}</p>
    </div>
    <!-- Maintenance Alert -->
    <div class="stat-card cursor-pointer bg-alert border border-alert p-4 h-[100px] flex flex-col justify-between shadow-neon-alert">
      <p class="font-body font-semibold text-xs text-black uppercase tracking-[1px] flex items-start gap-1 leading-tight">
        <span class="material-symbols-outlined text-[14px] mt-0.5">build</span>
        <span class="flex flex-col gap-0.5"><span>ًں”§ Maint. Alert</span><span>طھظ†ط¨ظٹظ‡ طµظٹط§ظ†ط©</span></span>
      </p>
      <p class="font-display font-bold text-3xl tabular-nums text-black mt-1">${s.maintAlerts}</p>
    </div>
    <!-- License Status -->
    <div class="stat-card cursor-pointer bg-surface border border-outline-variant p-4 h-[100px] flex flex-col justify-between hover:bg-surface-hover transition-colors relative overflow-hidden group col-span-2" onclick="location.hash='#/profile'">
      <div class="flex flex-col gap-0.5">
        <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col">
          <span>ًں”‘ License Status</span><span class="text-[10px] opacity-70">ط­ط§ظ„ط© ط§ظ„طھط±ط®ظٹطµ</span>
        </p>
      </div>
      <div class="flex flex-col">
        <p class="font-mono text-white text-sm tracking-wider" dir="ltr">CODE: ${escapeHtml(lic.code)} <span class="text-primary">آ· ${tierLabel(lic.tier)}</span></p>
        <p class="font-display font-bold text-xs text-white mt-1 uppercase">
          <span>${license.daysLeft() === Infinity ? "â™¾ï¸ڈ LIFETIME" : license.daysLeft() + " Days Left"}</span><span class="ml-1 opacity-70">${license.daysLeft() === Infinity ? "ط¯ط§ط¦ظ…" : "ظٹظˆظ… ظ…طھط¨ظ‚ظٹ"}</span>
        </p>
      </div>
      <span class="material-symbols-outlined text-white opacity-10 text-4xl absolute -bottom-2 -right-2 group-hover:opacity-20 transition-opacity">key</span>
    </div>
  </div>

  <!-- Growth Chart Section -->
  <div class="mt-4 flex-1 flex flex-col">
    <div class="flex items-start justify-between mb-2">
      <h2 class="font-display font-bold text-lg tracking-[-0.05em] uppercase leading-tight flex flex-col">
        <span>Check-ins (7D)</span>
        <span class="text-sm opacity-70">طھط³ط¬ظٹظ„ط§طھ ط§ظ„ط¯ط®ظˆظ„ (ظ§ ط£ظٹط§ظ…)</span>
      </h2>
      <div class="flex gap-2" id="rangeBtns">
        <button data-range="7" class="chart-range rounded-2xl font-display font-bold text-[10px] uppercase px-2 py-1 bg-surface-hover border border-outline-variant text-white flex flex-col items-center">
          <span>7D</span><span>ظ§ط£</span>
        </button>
        <button data-range="30" class="chart-range rounded-2xl font-display font-bold text-[10px] uppercase px-2 py-1 border border-outline-variant text-muted flex flex-col items-center">
          <span>30D</span><span>ظ£ظ ط£</span>
        </button>
      </div>
    </div>
    <div class="rounded-lg overflow-hidden bg-surface border border-outline-variant p-4 flex-1 min-h-[220px] relative">
      <canvas id="growthChart" class="absolute inset-0 p-4"></canvas>
      <div class="absolute inset-x-4 bottom-4 top-4 pointer-events-none flex items-end">
        <div class="w-full h-full bg-gradient-to-t from-[rgba(204,255,0,0.1)] to-transparent border-b border-primary relative">
          <div class="absolute inset-0 flex flex-col justify-between opacity-10">
            <div class="border-t border-white w-full"></div>
            <div class="border-t border-white w-full"></div>
            <div class="border-t border-white w-full"></div>
            <div class="border-t border-white w-full"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Recent Alerts Feed -->
  <div class="mt-4 flex flex-col gap-2">
    <h2 class="font-display font-bold text-sm tracking-[-0.05em] uppercase text-muted mb-1 flex gap-1 items-center">
      <span>ًں—‚ï¸ڈ System Feed</span><span>/</span><span>ط³ط¬ظ„ ط§ظ„ظ†ط¸ط§ظ…</span>
    </h2>
    ${feed.slice(0, 4).map((f) => `
      <div class="rounded-lg bg-surface p-3 flex justify-between items-center text-sm fade-up" style="border-inline-start:2px solid ${f.sev === "alert" ? "#ff3366" : f.sev === "info" ? "#ccff00" : "#d1e5f3"}">
        <div class="flex flex-col gap-1">
          <div class="flex flex-col leading-tight">
            <span class="font-display font-bold text-text-main">${escapeHtml(f.en)}</span>
            <span class="font-display font-bold text-text-main text-xs opacity-80">${escapeHtml(f.ar)}</span>
          </div>
          <div class="flex flex-col leading-tight mt-1">
            <span class="text-muted text-xs font-display">${escapeHtml(f.subEn)}</span>
            <span class="text-muted text-[10px] font-display">${escapeHtml(f.subAr)}</span>
          </div>
        </div>
        <span class="text-muted text-xs font-mono">${absTime(f.time)}</span>
      </div>`).join("")}
  </div>`;

  drawCheckinsChart(7);
  document.querySelectorAll(".chart-range").forEach((b) =>
    b.addEventListener("click", () => drawCheckinsChart(Number(b.dataset.range))));
}

async function drawCheckinsChart(days) {
  const canvas = $("#growthChart");
  if (!canvas) return;
  await ensureChart();
  if (!window.Chart) return;
  const data = days === 7 ? store.stats().checkins7 : store.stats().checkins30;

  document.querySelectorAll(".chart-range").forEach((b) => {
    const active = Number(b.dataset.range) === days;
    b.classList.toggle("bg-surface-hover", active);
    b.classList.toggle("border-outline-variant", !active);
    b.classList.toggle("text-white", active);
    b.classList.toggle("text-muted", !active);
  });

  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, "rgba(204, 255, 0, 0.4)");
  gradient.addColorStop(1, "rgba(204, 255, 0, 0.0)");

  trackChart(new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((_, i) => String(i + 1)),
      datasets: [{
        data,
        borderColor: "#CCFF00",
        backgroundColor: gradient,
        borderWidth: 2,
        pointBackgroundColor: "#0A0A0A",
        pointBorderColor: "#CCFF00",
        pointBorderWidth: 2,
        pointRadius: days === 7 ? 4 : 0,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#171717",
          titleFont: { family: "Space Grotesk", size: 14 },
          bodyFont: { family: "Space Grotesk", size: 16, weight: "bold" },
          padding: 10,
          borderColor: "#333333",
          borderWidth: 1,
          displayColors: false,
          callbacks: { label: (c) => c.parsed.y + " check-ins" },
        },
      },
      scales: {
        x: { display: false },
        y: { display: false, min: Math.max(0, Math.min(...data) - 20) },
      },
      interaction: { intersect: false, mode: "index" },
    },
  }));
}

/* ============================================================
   ROSTER  (docs/design/roster_v2)
   ============================================================ */
let rosterFilter = "active";
let rosterQuery = "";

function viewRoster() {
  const nowM = new Date(); nowM.setDate(1); nowM.setHours(0, 0, 0, 0);
  const dueTrainers = store.all("trainers").filter((t) => !trainerStatus(t).active && !trainerStatus(t).ended).length;

  screen.innerHTML = `
    <!-- Search & Filters (all screens) -->
    <div class="flex flex-col gap-4">
      <div class="relative">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted">search</span>
        <input id="rosterSearch" placeholder="SEARCH ID OR NAME..." class="w-full bg-surface-container border border-outline-variant rounded-full pl-10 pr-4 py-3 text-sm font-label uppercase tracking-wider focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted/50"/>
      </div>
      <div class="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4">
        ${["active", "expired", "trial", "frozen", "trainers"].map((f) => `
          <button data-filter="${f}" class="roster-filter whitespace-nowrap px-4 py-1.5 rounded-full border font-label uppercase tracking-widest text-[10px] active:scale-95 transition-transform flex flex-col items-center
            ${f === rosterFilter
              ? "border-primary bg-primary/10 text-primary"
              : "border-outline-variant bg-surface-container text-muted hover:text-white"}">
            <span>${FILTER_EMOJI[f] || ""} ${f.toUpperCase()}</span>
            <span class="text-[8px] opacity-70">${i18n.t.statuses[f] || (f === "trainers" ? "ظ…ط¯ط±ط¨ظˆظ†" : f)}</span>
          </button>`).join("")}
      </div>
    </div>

    ${rosterFilter === "trainers" ? `
    <div class="flex justify-end">
      <button id="newTrainerBtn" class="text-primary text-xs font-headline uppercase tracking-widest flex items-center gap-1 pressable">
        <span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' 1;">add_circle</span> NEW TRAINER / ظ…ط¯ط±ط¨ ط¬ط¯ظٹط¯
      </button>
    </div>` : `
    <!-- Trainers & salary actions -->
    <div class="flex flex-wrap gap-2">
      <button id="addSalaryBtn" class="flex-1 min-w-[150px] bg-surface-container-high border border-outline-variant text-on-surface font-headline font-bold uppercase tracking-widest text-xs px-4 py-2.5 rounded-xl hover:border-primary hover:text-primary active:scale-95 transition-all flex items-center justify-center gap-2">
        <span class="material-symbols-outlined text-[18px]">badge</span> ًں’ھ SALARY / <span class="font-arabic normal-case">طھط³ط¬ظٹظ„ ط±ط§طھط¨ ظٹط¯ظˆظٹ</span>
      </button>
      <button id="addTrainerBtn" class="flex-1 min-w-[150px] bg-primary text-black font-headline font-bold uppercase tracking-widest text-xs px-4 py-3 rounded-xl shadow-neon hover:bg-white active:scale-95 transition-all flex items-center justify-center gap-2">
        <span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1;">person_add</span> â‍• ADD TRAINER / <span class="font-arabic normal-case">ط¥ط¶ط§ظپط© ظ…ط¯ط±ط¨</span>
      </button>
    </div>`}

    <!-- Roster List (members or trainers by filter) -->
    <div id="rosterGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>`;

  const renderList = () => {
    const grid = $("#rosterGrid");

    // â”€â”€ TRAINERS view â”€â”€
    if (rosterFilter === "trainers") {
      const trainers = store.all("trainers");
      grid.innerHTML = trainers.length ? trainers.map(trainerCard).join("")
        : `<div class="col-span-full text-center text-muted py-12 text-sm">ًں“­ ظ…ط§ ظپظٹ ظ…ط¯ط±ط¨ظٹظ† â€” ط¶ظٹظپ ظ…ظ† NEW ظپظˆظ‚</div>`;
      grid.querySelectorAll("[data-trainer]").forEach((c) =>
        c.addEventListener("click", () => openTrainerDetails(c.dataset.trainer)));
      grid.querySelectorAll("[data-pay]").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          payTrainer(store.get("trainers", b.dataset.pay));
        }));
      grid.querySelectorAll("[data-edit-t]").forEach((b) =>
        b.addEventListener("click", (e) => { e.stopPropagation(); openTrainerForm(b.dataset.editT); }));
      grid.querySelectorAll("[data-del-t]").forEach((b) =>
        b.addEventListener("click", async (e) => {
          e.stopPropagation();
          const t = store.get("trainers", b.dataset.delT);
          if (!t) return;
          const ok = await confirmDialog({
            titleEn: `Delete ${t.name}?`,
            titleAr: "ط­ط°ظپ ط§ظ„ظ…ط¯ط±ط¨طں ط³ط¬ظ„ط§طھظ‡ ط§ظ„ظ…ط§ظ„ظٹط© ط³طھط¨ظ‚ظ‰ ظ…ط­ظپظˆط¸ط© ظپظٹ ط§ظ„ط³ط¬ظ„",
            confirmText: "Delete",
            danger: true,
          });
          if (ok) { store.remove("trainers", t.id); showToast("Trainer deleted â€” finance kept / ط§ظ†ط­ط°ظپ ط§ظ„ظ…ط¯ط±ط¨ ظˆط­ظڈظپط¸طھ ط±ظˆط§طھط¨ظ‡ط§ ط¨ط§ظ„ط³ط¬ظ„"); }
        }));
      return;
    }

    // â”€â”€ MEMBERS view â”€â”€
    const q = rosterQuery.trim().toLowerCase();
    let members = store.all("members");
    if (rosterFilter) members = members.filter((m) => effStatus(m) === rosterFilter);
    if (q) members = members.filter((m) => m.name.toLowerCase().includes(q) || String(m.phone).includes(q));

    grid.innerHTML = members.length ? members.map((m, i) => memberCard(m, i)).join("")
      : `<div class="empty-state col-span-full"><div class="icon material-symbols-outlined">group_off</div><h3>ظ„ط§ ظٹظˆط¬ط¯ ط£ط¹ط¶ط§ط،</h3><p>ط§ط¨ط¯ط£ ط¨ط¥ط¶ط§ظپط© ط£ظˆظ„ ط¹ط¶ظˆ ظ„ظ„ظ†ط§ط¯ظٹ</p></div>`;

    grid.querySelectorAll("[data-member]").forEach((card) =>
      card.addEventListener("click", () => openMemberDetail(card.dataset.member)));
  };

  const searchEl = $("#rosterSearch");
  if (searchEl) {
    searchEl.value = rosterQuery;
    searchEl.addEventListener("input", (e) => { rosterQuery = e.target.value; renderList(); });
  }
  document.querySelectorAll(".roster-filter").forEach((b) =>
    b.addEventListener("click", () => {
      rosterFilter = rosterFilter === b.dataset.filter ? "" : b.dataset.filter;
      viewRoster();
    }));

  renderList();

  // Desktop header actions (add only â€” search & filter are in the screen)
  $("#pageActions").innerHTML = `
    <button id="addMemberBtn" class="btn-primary flex items-center gap-2">
      <span class="material-symbols-outlined text-[20px]">person_add</span> ADD MEMBER
    </button>`;
  $("#addMemberBtn").onclick = openMemberModal;
  $("#addSalaryBtn")?.addEventListener("click", openSalaryModal);
  $("#addTrainerBtn")?.addEventListener("click", () => openTrainerForm());
  $("#newTrainerBtn")?.addEventListener("click", () => openTrainerForm());
}

// Trainer cards â€” same visual language as member cards
// Salary coverage: each renewal covers exactly one month.
// Never-paid trainers are covered from their START date (first month free-flow),
// so they stay green until the first salary due-date actually arrives.
function trainerStatus(t) {
  if (t.contractEnd && Date.now() > t.contractEnd) return { active: false, ended: true, until: t.contractEnd };
  const base = t.lastPaidAt ?? t.startedAt ?? Date.now();
  const d = new Date(base); d.setMonth(d.getMonth() + 1);
  const until = d.getTime();
  return { active: Date.now() < until, ended: false, until };
}
function trainerCard(t) {
  const st = trainerStatus(t);
  const paid = st.active;
  const contractOver = t.contractEnd && Date.now() > t.contractEnd;
  return `
  <div data-trainer="${t.id}" class="bg-surface cyber-border ${(!paid || contractOver) ? "border-s-2 !border-s-alert" : ""} rounded-lg p-4 flex items-center gap-4 hover:bg-surface-hover transition-colors cursor-pointer group active:scale-[0.98]">
    <div class="relative shrink-0">
      <div class="w-14 h-14 rounded-full bg-surface-container-high border ${(paid && !contractOver) ? "border-primary/50" : "border-alert/50"} flex items-center justify-center font-headline text-lg ${(paid && !contractOver) ? "text-primary" : "text-alert"}">${initials(t.name)}</div>
      <div class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface ${(paid && !contractOver) ? "bg-primary shadow-neon" : "bg-alert"}"></div>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex justify-between items-start gap-2">
        <h3 class="font-headline font-bold text-on-surface uppercase truncate">${escapeHtml(t.name)}</h3>
        <span class="font-label text-xs tracking-widest shrink-0 px-2 py-0.5 rounded border font-bold ${(paid && !contractOver) ? "bg-primary/10 text-primary border-primary/30" : "bg-alert/10 text-alert border-alert/30"}">${(paid && !contractOver) ? "ًںں¢ ظپط¹ظ‘ط§ظ„ ACTIVE" : contractOver ? "âڑ« ط§ظ†طھظ‡ظ‰ ط§ظ„ط¹ظ‚ط¯ ENDED" : "âڈ° ظ…ظˆط¹ط¯ ط§ظ„ط±ط§طھط¨ DUE"}</span>
      </div>
      <p class="font-body text-xs mt-1 ${(paid && !contractOver) ? "text-primary" : "text-alert"}">
        ${contractOver
          ? `ًں“„ ط§ظ†طھظ‡ظ‰ ط§ظ„ط¹ظ‚ط¯ ط¨طھط§ط±ظٹط® ${fmt.date(t.contractEnd, currentLang())}`
          : st.active
            ? `ًںں¢ ط§ظ„ط§ط´طھط±ط§ظƒ ظپط¹ظ‘ط§ظ„ â€” ط§ظ„طھط¬ط¯ظٹط¯ ط§ظ„ظ‚ط§ط¯ظ…: ${fmt.date(st.until, currentLang())}`
            : `ًں”´ ط§ظ†طھظ‡طھ ط¨ط§ظ‚ط© ط§ظ„ط±ط§طھط¨${st.until ? ` ط¨طھط§ط±ظٹط® ${fmt.date(st.until, currentLang())}` : ""} â€” ظٹطھط·ظ„ط¨ طھط¬ط¯ظٹط¯`}
      </p>
      <p class="font-body text-[11px] text-muted mt-0.5" dir="ltr">${fmt.money(t.salary)}/mo</p>
      <div class="flex gap-2 mt-2 flex-wrap">
        <span class="px-2 py-0.5 rounded bg-surface-container-highest text-muted text-[10px] font-label tracking-wider uppercase border border-outline-variant">ًں“… ط¨ط¯ط£: ${t.startedAt ? fmt.date(t.startedAt, currentLang()) : "â€”"}</span>
        ${t.contractEnd ? `<span class="px-2 py-0.5 rounded bg-surface-container-highest ${contractOver ? "text-alert border-alert/30" : "text-muted"} text-[10px] font-label tracking-wider uppercase border border-outline-variant">âڈ³ ظٹظ†طھظ‡ظٹ: ${fmt.date(t.contractEnd, currentLang())}</span>` : ""}
        ${t.phone ? `<span class="px-2 py-0.5 rounded bg-surface-container-highest text-muted text-[10px] font-label tracking-wider uppercase border border-outline-variant" dir="ltr">ًں“‍ ${escapeHtml(t.phone)}</span>` : ""}
      </div>
    </div>
    <div class="shrink-0 flex flex-col gap-1">
      <button data-info-btn title="File / ط§ظ„ظ…ظ„ظپ" class="text-muted hover:text-primary transition-colors"><span class="material-symbols-outlined text-lg">receipt_long</span></button>
      <button data-edit-t="${t.id}" title="Edit / طھط¹ط¯ظٹظ„" class="text-muted hover:text-primary transition-colors"><span class="material-symbols-outlined text-lg">edit</span></button>
      <button data-del-t="${t.id}" title="Delete / ط­ط°ظپ" class="text-muted hover:text-alert transition-colors"><span class="material-symbols-outlined text-lg">delete</span></button>
      <button data-pay="${t.id}" title="Renew / طھط¬ط¯ظٹط¯" class="${paid ? "hidden" : ""} bg-primary text-black rounded-xl p-1.5 hover:bg-white active:scale-90 transition-all"><span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1;">autorenew</span></button>
    </div>
  </div>`;
}

const TIER_LABEL = { regular: "REGULAR TIER", pro: "PRO TIER", half: "HALF PASS",
  elite: "ELITE TIER", standard: "STANDARD TIER", trial: "GUEST" };
// License tier labels (activation-code packages)
const LICENSE_TIER = {
  monthly: ["ًں“…", "MONTHLY", "ط´ظ‡ط±ظٹط©"],
  yearly:  ["ًں—“ï¸ڈ", "YEARLY", "ط³ظ†ظˆظٹط©"],
  lifetime:["â™¾ï¸ڈ", "LIFETIME", "ط¯ط§ط¦ظ…ط©"],
  standard:["ًں”‘", "STANDARD", "ط¹ط§ط¯ظٹط©"],
  vip:     ["ًں’ژ", "VIP", "ظ…ظ…ظٹط²ط©"],
  guest:   ["ًں‘¤", "GUEST", "ط²ط§ط¦ط±"],
};
const tierLabel = (tier) => {
  const m = LICENSE_TIER[tier];
  return m ? `${m[0]} ${m[1]} / ${m[2]}` : `${tier}`;
};
const FILTER_EMOJI = { active: "âœ…", expired: "â›”", trial: "ًںژپ", frozen: "â‌„ï¸ڈ", trainers: "ًں‘¥" };

function memberAvatar(m, st) {
  const borderClass = st === "expired" ? "avatar-alert" : st === "trial" ? "avatar-frost" : "avatar-volt";
  if (m.photo) {
    return `<img class="avatar ${borderClass}" src="${m.photo}" alt="${escapeHtml(m.name)}"/>`;
  }
  const textClass = st === "trial" ? "text-frost" : st === "expired" ? "text-alert" : "text-volt";
  return `<div class="avatar ${borderClass} ${textClass}">${initials(m.name)}</div>`;
}

function memberCard(m, index = 0) {
  const st = effStatus(m);
  const daysLeft = Math.ceil((m.expiresAt - Date.now()) / DAY);

  let statusBadge;
  if (st === "expired") statusBadge = `<span class="badge badge-alert">â›” ظ…ظ†طھظ‡ظٹ â€” ${Math.abs(daysLeft)} ظٹظˆظ…</span>`;
  else if (st === "trial") statusBadge = `<span class="badge badge-frost">ًںژپ طھط¬ط±ظٹط¨ظٹ â€” ظٹظˆظ… ${daysLeft}</span>`;
  else if (st === "frozen") statusBadge = `<span class="badge badge-muted">â‌„ï¸ڈ ظ…ط¬ظ…ط¯</span>`;
  else statusBadge = `<span class="badge badge-volt">âœ… ${TIER_LABEL[m.plan] || "ط¹ط¶ظˆ"}</span>`;

  const cardClass = `member-card stagger-in ${st === "expired" ? "expired" : st === "trial" ? "trial" : st === "frozen" ? "frozen" : ""}`;
  const style = `style="animation-delay: ${index * 50}ms"`;

  return `
  <div data-member="${m.id}" class="${cardClass}" ${style}>
    <div class="flex items-center gap-4">
      <div class="relative shrink-0">
        ${memberAvatar(m, st)}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <h3 class="font-headline font-bold uppercase truncate">${escapeHtml(m.name)}</span>
          <span class="font-label text-xs tracking-widest text-muted opacity-70 shrink-0">#${m.id.slice(-4)}</span>
        </div>
        <div class="flex items-center gap-2 mt-1 flex-wrap">
          ${statusBadge}
          ${m.tag ? `<span class="badge badge-muted">${escapeHtml(m.tag)}</span>` : ""}
        </div>
        <p class="text-xs text-muted mt-1 font-mono" dir="ltr">${m.phone || "â€”"}</p>
      </div>
      <span class="material-symbols-outlined text-muted ltr:block rtl:hidden">chevron_right</span>
      <span class="material-symbols-outlined text-muted hidden rtl:block">chevron_left</span>
    </div>
  </div>`;
}

function openMemberModal(id = null) {
  const t = i18n.t;
  const m = id ? store.get("members", id) : null;
  const prices = planPrices();
  const planOptions = PLANS.map((p) =>
    `<option value="${p.key}" ${m?.plan === p.key ? "selected" : ""}>${p.en} / ${p.ar} â€” $${prices[p.key]}</option>`).join("");
  const legacyOpt = m && !PLANS.some((p) => p.key === m.plan)
    ? `<option value="${m.plan}" selected>${m.plan}</option>` : "";

  const mod = openModal(`
    <div class="modal-header mb-6">
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${m ? "âœڈï¸ڈ " + t.editMember : "â‍• " + t.addMember}</h3>
      <p class="font-arabic text-muted text-sm" dir="rtl">${m ? "طھط¹ط¯ظٹظ„ ط¨ظٹط§ظ†ط§طھ ط§ظ„ط¹ط¶ظˆ" : "ط¥ط¶ط§ظپط© ط¹ط¶ظˆ ط¬ط¯ظٹط¯"}</p>
    </div>
    <form id="memberForm" class="flex flex-col gap-4">
      <div class="field-wrapper">
        <input name="name" required class="dp-field" value="${m ? escapeHtml(m.name) : ""}" placeholder=" " />
        <label>${t.memberName}</label>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="field-wrapper">
          <input name="phone" dir="ltr" class="dp-field" value="${m ? escapeHtml(m.phone || "") : ""}" placeholder=" " />
          <label>${t.phone}</label>
        </div>
        <div class="field-wrapper">
          <input name="tag" class="dp-field" value="${m ? escapeHtml(m.tag || "") : ""}" placeholder=" " />
          <label>Tag / ظˆط³ظ…</label>
        </div>
      </div>
      <div class="grid ${m ? "grid-cols-2" : "grid-cols-[1fr_auto]"} gap-4 items-end">
        <div class="field-wrapper">
          <label class="flex justify-between items-center">
            <span>${t.plan}</span>
            <button type="button" id="editPricesBtn" title="Edit plan prices / طھط¹ط¯ظٹظ„ ط£ط³ط¹ط§ط± ط§ظ„ط¨ط§ظ‚ط§طھ" class="btn-ghost text-xs px-2 py-1">
              <span class="material-symbols-outlined text-[16px]">settings_suggest</span>
            </button></label>
          <select name="plan" class="dp-field">${planOptions}${legacyOpt}</select>
        </div>
        ${m ? "" : `<div class="field-wrapper">
          <input name="days" type="number" min="1" max="1095" value="30" class="dp-field w-24" placeholder=" " />
          <label>Days / ط§ظ„ط£ظٹط§ظ…</label>
        </div>`}
      </div>
      ${m && effStatus(m) !== "expired" ? `
      <div class="card p-4 gradient-border">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-[10px] uppercase tracking-widest text-muted font-headline mb-1">Subscription / ط§ظ„ط§ط´طھط±ط§ظƒ</p>
            <p class="font-headline text-sm uppercase ${m.status === "frozen" ? "text-frost" : "text-volt"}">
              ${m.status === "frozen"
                ? `â‌„ï¸ڈ Frozen / ظ…ط¬ظ…ط¯${m.remainingDays != null ? ` <span class="normal-case text-xs text-muted">â€” ${m.remainingDays} ظٹظˆظ… ظ…طھظˆظ‚ظپ</span>` : ""}`
                : "âœ… Active / ظپط¹ط§ظ„"}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button type="button" data-edit-prices title="Edit plan prices / طھط¹ط¯ظٹظ„ ط£ط³ط¹ط§ط± ط§ظ„ط¨ط§ظ‚ط§طھ" class="btn-secondary text-xs px-3 py-2">
              ًںڈ·ï¸ڈ ${prices[m?.plan] != null ? "$" + prices[m.plan] : "Prices"}
            </button>
            <button type="button" data-toggle-freeze class="btn-frost text-xs px-3 py-2">
              ${m.status === "frozen" ? "â–¶ Resume / ط§ط³طھط¦ظ†ط§ظپ" : "â‌„ï¸ڈ Freeze / طھط¬ظ…ظٹط¯"}
            </button>
          </div>
        </div>
      </div>` : ""}
      ${m ? "" : `<div class="field-wrapper">
        <input name="startDate" type="date" value="${new Date().toLocaleDateString("en-CA")}" max="${new Date().toLocaleDateString("en-CA")}" class="dp-field" placeholder=" " />
        <label>Start Date / طھط§ط±ظٹط® ط§ظ„ط¨ط¯ط§ظٹط©</label>
      </div>`}
      <div class="field-wrapper">
        <input name="paidAmount" type="number" min="0" step="0.5" value="${m ? m.paidAmount ?? 0 : prices[PLANS[0].key]}" class="dp-field" placeholder=" " />
        <label>${t.paidAmount} ($)</label>
      </div>
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="btn-secondary flex-1">${t.cancel}</button>
        <button type="submit" class="btn-primary flex-1">${t.save}</button>
      </div>
    </form>`);

  mod.el.querySelector("[data-close]").onclick = mod.close;

  // Auto-fill paid amount from the selected plan price (add mode only)
  if (!m) {
    $('select[name="plan"]', mod.el).addEventListener("change", (e) => {
      const p = planPrices()[e.target.value];
      if (p != null) $('[name="paidAmount"]', mod.el).value = p;
    });
  }
  // Inline price editor (gear icon + ًںڈ·ï¸ڈ button both use this)
  const refreshPlanOptions = () => {
    const sel = $('select[name="plan"]', mod.el);
    if (!sel) return;
    const current = sel.value;
    const fresh = planPrices();
    sel.innerHTML = PLANS.map((p) =>
      `<option value="${p.key}" ${p.key === current ? "selected" : ""}>${p.en} / ${p.ar} â€” $${fresh[p.key]}</option>`).join("");
    // also refresh the ًںڈ·ï¸ڈ price chip next to Freeze
    const chip = mod.el.querySelector("[data-edit-prices]");
    if (chip && m) {
      const v = fresh[current];
      chip.innerHTML = `ًںڈ·ï¸ڈ ${v != null ? "$" + v : "Prices"}`;
    }
  };
  $("#editPricesBtn", mod.el).addEventListener("click", () => openPlanPrices(refreshPlanOptions));
  mod.el.querySelector("[data-edit-prices]")?.addEventListener("click", () => openPlanPrices(refreshPlanOptions));

  // Freeze / resume subscription (days pause while frozen)
  const freezeBtn = mod.el.querySelector("[data-toggle-freeze]");
  if (freezeBtn) freezeBtn.onclick = () => {
    const cur = store.get("members", id);
    if (cur.status === "frozen") {
      const rem = Number(cur.remainingDays || 0);
      store.update("members", id, {
        status: cur.plan === "trial" ? "trial" : "active",
        expiresAt: Date.now() + rem * DAY,
        remainingDays: null,
        frozenAt: null,
      });
      showToast(`â–¶ Resumed â€” ${rem} days restored / طھظ… ط§ظ„ط§ط³طھط¦ظ†ط§ظپ`);
    } else {
      const rem = Math.max(0, Math.ceil((cur.expiresAt - Date.now()) / DAY));
      store.update("members", id, { status: "frozen", frozenAt: Date.now(), remainingDays: rem });
      showToast(`â‌„ï¸ڈ Frozen â€” ${rem} days paused / طھظ… ط§ظ„طھط¬ظ…ظٹط¯ ظˆط¹ط¯ظ… ط§ط­طھط³ط§ط¨ ط§ظ„ط£ظٹط§ظ…`);
    }
    mod.close();
  };

  $("#memberForm", mod.el).addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const days = Number(fd.get("days")) || 30;
    const data = {
      name: fd.get("name").trim(),
      phone: fd.get("phone").trim(),
      tag: (fd.get("tag") || "").trim(),
      plan: fd.get("plan"),
      paidAmount: Number(fd.get("paidAmount")) || 0,
    };
    if (m) {
      const patch = { ...data };
      delete patch.paidAmount;
      store.update("members", id, patch);
    } else {
      const startVal = fd.get("startDate");
      const joinTs = startVal ? new Date(`${startVal}T00:00:00`).getTime() : Date.now();
      store.insert("members", {
        ...data,
        photo: "",
        status: data.plan === "trial" ? "trial" : "active",
        joinDate: joinTs,
        expiresAt: joinTs + days * DAY,
        checkins: 0,
      });
    }
    mod.close();
    showToast(m ? "Saved / طھظ… ط§ظ„ط­ظپط¸" : "Member added / طھظ…طھ ط¥ط¶ط§ظپط© ط§ظ„ط¹ط¶ظˆ");
  });
}

function openMemberDetail(id) {
  const m = store.get("members", id);
  const t = i18n.t;
  const st = effStatus(m);
  const avatarClass = st === "expired" ? "avatar-alert" : st === "trial" ? "avatar-frost" : "avatar-volt";
  const statusBadge = st === "expired" ? `<span class="badge badge-alert">â›” ظ…ظ†طھظ‡ظٹ</span>` : st === "trial" ? `<span class="badge badge-frost">ًںژپ طھط¬ط±ظٹط¨ظٹ</span>` : st === "frozen" ? `<span class="badge badge-muted">â‌„ï¸ڈ ظ…ط¬ظ…ط¯</span>` : `<span class="badge badge-volt">âœ… ظ†ط´ط·</span>`;
  
  const mod = openModal(`
    <div class="flex items-center gap-4 mb-6">
      <div class="avatar ${avatarClass} text-xl">${initials(m.name)}</div>
      <div class="flex-1 min-w-0">
        <h3 class="font-headline font-bold uppercase text-lg truncate">${escapeHtml(m.name)}</h3>
        <div class="flex items-center gap-2 mt-1">
          ${statusBadge}
          <span class="text-sm text-muted font-mono" dir="ltr">#${m.id.slice(-4)}</span>
        </div>
        <p class="text-xs text-muted mt-0.5" dir="ltr">${escapeHtml(m.phone || "â€”")}</p>
      </div>
    </div>
    <div class="card p-4 mb-6">
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="p-3 bg-bg rounded-xl"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">${t.joinDate}</p><p class="font-headline">${fmt.date(m.joinDate)}</p></div>
        <div class="p-3 bg-bg rounded-xl"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">${t.expiresOn}</p><p class="font-headline ${st === "expired" ? "text-alert" : ""}">${fmt.date(m.expiresAt)}</p></div>
        <div class="p-3 bg-bg rounded-xl"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">${t.plan}</p><p class="font-headline uppercase">${t.plans[m.plan] || m.plan}</p></div>
        <div class="p-3 bg-bg rounded-xl"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">${t.checkins}</p><p class="font-headline">${m.checkins || 0}</p></div>
      </div>
      ${m.tag ? `<div class="mt-3"><span class="badge badge-muted">${escapeHtml(m.tag)}</span></div>` : ""}
    </div>
    <div class="flex gap-3">
      <button data-del class="btn-alert flex-1">${t.delete}</button>
      <button data-edit class="btn-secondary flex-1">${t.edit}</button>
      <button data-renew class="btn-primary flex-1">${t.renew}</button>
    </div>`);

  mod.el.querySelector("[data-edit]").onclick = () => { mod.close(); openMemberModal(id); };
  mod.el.querySelector("[data-del]").onclick = async () => {
    mod.close();
    const ok = await confirmDialog({
      titleEn: "Delete this member?",
      titleAr: "ط­ط°ظپ ظ‡ط°ط§ ط§ظ„ط¹ط¶ظˆطں âڑ ï¸ڈ ط­ط±ظƒط§طھظ‡ ط§ظ„ظ…ط§ظ„ظٹط© ط³طھط¨ظ‚ظ‰ ظ…ط­ظپظˆط¸ط© ظپظٹ ط§ظ„ط³ط¬ظ„ ظˆظ„ط§ طھظڈط­ط°ظپ",
      confirmText: "Delete",
      danger: true,
    });
    if (ok) { store.remove("members", id); showToast("Member deleted â€” finance kept / ط§ظ†ط­ط°ظپ ط§ظ„ط¹ط¶ظˆ ظˆط­ظڈظپط¸طھ ط£ظ…ظˆط§ظ„ظ‡ ط¨ط§ظ„ط³ط¬ظ„"); }
  };
  mod.el.querySelector("[data-renew]").onclick = () => { mod.close(); openRenewModal(id); };
}

// ---------- Plan prices editor ----------
function openPlanPrices(onSaved) {
  const t = i18n.t;
  const prices = planPrices();
  const mod = openModal(`
    <div class="modal-header mb-6">
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">ًں’² Plan Prices / ط£ط³ط¹ط§ط± ط§ظ„ط¨ط§ظ‚ط§طھ</h3>
      <p class="font-arabic text-muted text-sm" dir="rtl">ط­ط¯ظ‘ط¯ ط§ظ„ط³ط¹ط± ط§ظ„ط§ظپطھط±ط§ط¶ظٹ ظ„ظƒظ„ ط¨ط§ظ‚ط© â€” ظٹظڈط³طھط®ط¯ظ… طھظ„ظ‚ط§ط¦ظٹط§ظ‹ ط¹ظ†ط¯ ط¥ط¶ط§ظپط© ط¹ط¶ظˆ</p>
    </div>
    <form id="pricesForm" class="flex flex-col gap-4">
      ${PLANS.map((p) => `
        <div class="field-wrapper">
          <label>${p.en} / ${p.ar}</label>
          <input name="${p.key}" type="number" min="0" step="0.5" value="${prices[p.key] ?? 0}" class="dp-field" dir="ltr" placeholder=" " />
        </div>`).join("")}
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="btn-secondary flex-1">${t.cancel}</button>
        <button type="submit" class="btn-primary flex-1">${t.save}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  $("#pricesForm", mod.el).addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = {};
    PLANS.forEach((p) => { next[p.key] = Number(fd.get(p.key)) || 0; });
    savePlanPrices(next);
    mod.close();
    showToast("Prices saved / طھظ… ط­ظپط¸ ط§ظ„ط£ط³ط¹ط§ط±");
    onSaved && onSaved();
  });
}

function openRenewModal(id) {  const m = store.get("members", id);
  const t = i18n.t;
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${t.renew} â€” ${escapeHtml(m.name)}</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">طھط¬ط¯ظٹط¯ ط§ط´طھط±ط§ظƒ ط§ظ„ط¹ط¶ظˆ</p>
    <form id="renewForm" class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Days / ط£ظٹط§ظ…</label>
          <input name="days" type="number" min="1" max="1095" value="30" class="dp-field mt-1" /></div>
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.amount} ($)</label>
          <input name="amount" type="number" min="0" step="0.5" value="0" class="dp-field mt-1" /></div>
      </div>
      <p class="text-[11px] text-muted font-headline uppercase tracking-widest">${t.renew} â€” Basis / ط£ط³ط§ط³ ط§ظ„طھط¬ط¯ظٹط¯</p>
      <div class="flex flex-col gap-2">
        <button type="button" data-base="expiry" class="py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">${t.renew} â€” ظ…ظ† طھط§ط±ظٹط® ط§ظ„ط§ظ†طھظ‡ط§ط، (From expiry)</button>
        <button type="button" data-base="today" class="py-3 rounded-xl border border-primary-fixed text-primary-fixed font-headline font-bold uppercase text-sm pressable">${t.renew} â€” ظ…ظ† ط§ظ„ظٹظˆظ… (From today)</button>
      </div>
      <div class="flex gap-3 pt-1">
        <button type="button" data-close class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm pressable">${t.cancel}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  $("#renewForm", mod.el).addEventListener("click", (e) => {
    const btn = e.target.closest("[data-base]");
    if (!btn) return;
    e.preventDefault();
    const fd = new FormData($("#renewForm", mod.el));
    const days = Number(fd.get("days")) || 30;
    const amount = Number(fd.get("amount")) || 0;
    const base = btn.dataset.base === "today" ? Date.now() : m.expiresAt;
    store.update("members", id, { expiresAt: base + days * DAY, status: m.plan === "trial" ? "trial" : "active" });
    if (amount > 0) {
      store.insert("ledger", { type: "revenue", amount, description: `Renewal: ${m.name}`, category: "subscriptions", date: Date.now() });
    }
    mod.close();
    showToast("Renewed / طھظ… ط§ظ„طھط¬ط¯ظٹط¯");
  });
}

/* ============================================================
   HARDWARE â€” simple repair tracker (same theme)
   Flow: add device + repair price -> when fixed press DONE ->
   invoice is auto-deducted and moved to the Ledger.
   ============================================================ */
function viewHardware() {
  const devices = store.all("devices");
  const pending = devices.filter((d) => d.maintenanceStatus !== "completed");
  const done = devices.filter((d) => d.maintenanceStatus === "completed");
  const invoiced = done.reduce((s, d) => s + Number(d.cost || 0), 0);

  screen.innerHTML = `
    <div class="flex items-start justify-between">
      <div>
        <h1 class="font-headline text-3xl tracking-tighter text-on-surface uppercase mb-1">Hardware Status</h1>
        <p class="arabic-sub text-muted text-sm" dir="rtl">ط­ط§ظ„ط© ط§ظ„ط£ط¬ظ‡ط²ط© ظˆط§ظ„طھطµظ„ظٹط­</p>
      </div>
    </div>

    <!-- slim counters -->
    <div class="grid grid-cols-3 gap-3">
      <div class="bg-surface cyber-border rounded-lg p-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-muted font-headline">ًں”§ In Repair</p>
        <p class="font-display font-bold text-3xl text-alert tabular-nums mt-1">${pending.length}</p>
        <p class="arabic-sub text-[10px]" dir="rtl">ظ‚ظٹط¯ ط§ظ„طھطµظ„ظٹط­</p>
      </div>
      <div class="bg-surface cyber-border rounded-lg p-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-muted font-headline">âœ… Repaired</p>
        <p class="font-display font-bold text-3xl text-primary tabular-nums mt-1">${done.length}</p>
        <p class="arabic-sub text-[10px]" dir="rtl">طھظ… ط§ظ„طھطµظ„ظٹط­</p>
      </div>
      <div class="bg-surface cyber-border rounded-lg p-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-muted font-headline">ًں’µ Total Invoices</p>
        <p class="font-display font-bold text-3xl text-frost-fixed tabular-nums mt-1" dir="ltr">${fmt.money(invoiced)}</p>
      </div>
    </div>

    <!-- page stats -->
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-surface cyber-border rounded-lg p-4 fade-up">
        <div class="text-[10px] uppercase tracking-widest text-muted mb-1">ط§ظ„ط£ط¹ط¶ط§ط، ط§ظ„ظ†ط´ط·ظˆظ†</div>
        <h2 id="memberCount" class="font-headline font-bold"></h2>
      </div>
      <div class="bg-surface cyber-border rounded-lg p-4 fade-up">
        <div class="text-[10px] uppercase tracking-widest text-muted mb-1">ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط¥ظٹط±ط§ط¯ط§طھ</div>
        <h2 id="revenueThisMonth" class="font-headline font-bold"></h2>
      </div>
    </div>
    <button id="importBtn" class="bg-primary text-black font-headline font-bold uppercase tracking-widest text-sm px-5 py-2.5 rounded-xl hover:bg-white active:scale-95 transition-all flex items-center gap-2">
      <span class="material-symbols-outlined text-[20px]">import_export</span> IMPORT
    </button>
    <button id="exportBtn" class="bg-primary text-black font-headline font-bold uppercase tracking-widest text-sm px-5 py-2.5 rounded-xl hover:bg-white active:scale-95 transition-all flex items-center gap-2">
      <span class="material-symbols-outlined text-[20px]">download</span> EXPORT
    </button>`;
  $("#importBtn").onclick = importData;
  $("#exportBtn").onclick = exportData;

// Completes a repair: marks device + pushes its invoice to the Ledger as an expense
function markRepaired(d) {
  const cost = Number(d.cost || 0);
  let ledgerId = d.ledgerId || null;
  if (cost > 0 && !ledgerId) {
    const tx = store.insert("ledger", {
      type: "expense",
      amount: cost,
      description: `Repair: ${d.name}`,
      category: "maintenance",
      date: Date.now(),
    });
    ledgerId = tx.id;
  }
  store.update("devices", d.id, {
    maintenanceStatus: "completed",
    repairedAt: Date.now(),
    ...(ledgerId ? { ledgerId } : {}),
  });
  showToast("âœ… Repaired â€” invoice added to Ledger / طھظ… ط§ظ„طھطµظ„ظٹط­ ظˆط£ظڈط¶ظٹظپطھ ط§ظ„ظپط§طھظˆط±ط© ظ„ظ„ظ…ط§ظ„ظٹط©");
}

function openDeviceModal() {
  const t = i18n.t;
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${t.addDevice}</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">ط¥ط¶ط§ظپط© ط¬ظ‡ط§ط² ظ„ظ„طھطµظ„ظٹط­</p>
    ${deviceFormHtml(null)}`);
  readDeviceForm(mod, null, null);
}

function openDeviceDetail(id) {
  const t = i18n.t;
  const d = store.get("devices", id);
  const isDone = d.maintenanceStatus === "completed";
  const mod = openModal(`
    <div class="flex justify-between items-start mb-5">
      <div>
        <h3 class="font-headline font-bold uppercase text-lg">${escapeHtml(d.name)}</h3>
        <p class="text-sm ${isDone ? "text-primary" : "text-alert"}">${isDone ? "Repaired / طھظ… ط§ظ„طھطµظ„ظٹط­" : "Under repair / ظ‚ظٹط¯ ط§ظ„طھطµظ„ظٹط­"}</p>
      </div>
      <span class="material-symbols-outlined ${isDone ? "text-primary" : "text-alert"} text-3xl">${isDone ? "check_circle" : "build"}</span>
    </div>
    <div class="grid grid-cols-2 gap-3 text-sm mb-5">
      <div class="bg-surface-container rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Repair price / ط³ط¹ط± ط§ظ„طھطµظ„ظٹط­</p><p class="font-headline" dir="ltr">${fmt.money(d.cost)}</p></div>
      <div class="bg-surface-container rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">${isDone ? "Deducted / ط®ظڈطµظ…طھ ظ…ظ† ط§ظ„ط£ط±ط¨ط§ط­" : "Waiting / ط¨ط§ظ„ط§ظ†طھط¸ط§ط±"}</p><p class="font-headline">${isDone ? "âœ“ Ledger" : "â€”"}</p></div>
    </div>
    <div class="flex gap-3">
      <button data-del class="flex-1 py-3 rounded-xl border border-alert/40 text-alert font-bold uppercase text-sm pressable">${t.delete}</button>
      ${!isDone ? `<button data-fixed class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm neon-shadow pressable" aria-label="Mark as repaired">âœ… DONE طھظ…</button>`
                : `<button data-edit class="flex-1 py-3 rounded-xl border border-outline-variant font-bold uppercase text-sm pressable" aria-label="Edit device">${t.edit}</button>`}
    </div>`);
  const editBtn = mod.el.querySelector("[data-edit]");
  if (editBtn) editBtn.onclick = () => {
    mod.close();
    const m2 = openModal(`<h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-5">${t.edit} â€” ${escapeHtml(d.name)}</h3>${deviceFormHtml(d)}`);
    readDeviceForm(m2, d, id);
  };
  const fixedBtn = mod.el.querySelector("[data-fixed]");
  if (fixedBtn) fixedBtn.onclick = () => { mod.close(); markRepaired(d); };
  mod.el.querySelector("[data-del]").onclick = async () => {
    mod.close();
    const ok = await confirmDialog({ titleEn: t.confirmDelete, titleAr: "ط³ظٹطھظ… ط­ط°ظپ ط§ظ„ط¬ظ‡ط§ط² ظ†ظ‡ط§ط¦ظٹط§ظ‹", confirmText: "Delete", danger: true });
    if (ok) { store.remove("devices", id); showToast("Deleted / طھظ… ط§ظ„ط­ط°ظپ"); }
  };
}

/* ============================================================
   LEDGER  (docs/design/ledger_v2) â€” month-filtered finance
   ============================================================ */
let ledgerOffset = 0;

function viewLedger() {
  const AR_MONTHS = ["ظƒط§ظ†ظˆظ† ط§ظ„ط«ط§ظ†ظٹ","ط´ط¨ط§ط·","ط¢ط°ط§ط±","ظ†ظٹط³ط§ظ†","ط£ظٹط§ط±","ط­ط²ظٹط±ط§ظ†","طھظ…ظˆط²","ط¢ط¨","ط£ظٹظ„ظˆظ„","طھط´ط±ظٹظ† ط§ظ„ط£ظˆظ„","طھط´ط±ظٹظ† ط§ظ„ط«ط§ظ†ظٹ","ظƒط§ظ†ظˆظ† ط§ظ„ط£ظˆظ„"];
  const EN_MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const arDigits = (n) => String(n).replace(/\d/g, (d) => "ظ ظ،ظ¢ظ£ظ¤ظ¥ظ¦ظ§ظ¨ظ©"[d]);

  // Selected month (offset from current month)
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + (ledgerOffset || 0));
  const mStart = base.getTime();
  const nxt = new Date(base); nxt.setMonth(base.getMonth() + 1);
  const mEnd = nxt.getTime();
  const inMonth = (l) => l.date >= mStart && l.date < mEnd;

  const ledgerAll = store.all("ledger");
  const revenue = ledgerAll.filter((l) => l.type === "revenue" && inMonth(l)).reduce((s, l) => s + Number(l.amount || 0), 0);
  const expenses = ledgerAll.filter((l) => l.type === "expense" && inMonth(l)).reduce((s, l) => s + Number(l.amount || 0), 0);
  const profit = revenue - expenses;
  const ledger = ledgerAll.filter(inMonth);

  const mNum = String(base.getMonth() + 1).padStart(2, "0");
  const monthLabel = `${mNum} آ· ${EN_MONTHS[base.getMonth()]} ${base.getFullYear()}`;
  const monthLabelAr = `${AR_MONTHS[base.getMonth()]} ${arDigits(base.getFullYear())}`;

  // Quick-jump options: last 12 months (numbered)
  let jumpOptions = "";
  for (let o = 0; o >= -11; o--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + o);
    const sel = o === (ledgerOffset || 0) ? "selected" : "";
    jumpOptions += `<option value="${o}" ${sel}>${d.getMonth() + 1} آ· ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}</option>`;
  }

  // ---- Trainer salary reminders (current real month) ----
  const trainers = store.all("trainers");
  const nowM = new Date(); nowM.setDate(1); nowM.setHours(0, 0, 0, 0);
  const due = trainers.filter((t) => !trainerStatus(t).active && !trainerStatus(t).ended);
  const dueTotal = due.reduce((s, t) => s + Number(t.salary || 0), 0);
  const dueBanner = due.length ? `
    <div class="bg-alert/10 border border-alert/40 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="font-headline text-sm text-alert uppercase tracking-wide">âڈ° Salaries due this month / ط±ظˆط§طھط¨ ظ…ط³طھط­ظ‚ط©</p>
        <p class="text-xs text-muted mt-1 truncate">${due.map((t) => `${t.name} ($${t.salary})`).join(" آ· ")} â€” ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ: ${fmt.money(dueTotal)}</p>
      </div>
      <button id="payAllBtn" class="shrink-0 bg-primary text-black font-headline font-bold uppercase tracking-widest text-xs px-4 py-2.5 rounded-xl hover:bg-white active:scale-95 transition-all">ًں”پ Renew all / طھط¬ط¯ظٹط¯ ط§ظ„ظƒظ„</button>
    </div>` : "";

  screen.innerHTML = `
  ${dueBanner}

  <!-- Month selector -->
  <div class="bg-surface-container cyber-border rounded-lg p-3 flex justify-between items-center gap-2 relative overflow-hidden">
    <div class="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none"></div>
    <button id="ledPrev" class="p-2 text-muted hover:text-primary transition-colors active:scale-95 relative z-10"><span class="material-symbols-outlined">chevron_left</span></button>
    <div class="flex items-center gap-2 relative z-10 min-w-0">
      <span class="material-symbols-outlined text-primary">calendar_month</span>
      <select id="ledJump" class="bg-transparent border-none text-center font-headline font-bold tracking-widest focus:outline-none cursor-pointer max-w-[240px]">
        ${jumpOptions}
      </select>
      <span class="hidden sm:flex flex-col leading-none">
        <span class="text-primary text-xs font-bold">${monthLabel}</span>
        <span class="font-arabic text-muted text-[10px] mt-0.5">${monthLabelAr}</span>
      </span>
    </div>
    <button id="ledNext" class="p-2 text-muted hover:text-primary transition-colors active:scale-95 relative z-10 ${(ledgerOffset || 0) >= 0 ? "invisible" : ""}"><span class="material-symbols-outlined">chevron_right</span></button>
  </div>

  <!-- The three big boxes -->
  <div class="grid grid-cols-3 gap-3">
    <div class="bg-surface cyber-border rounded-lg p-4 md:p-5 relative overflow-hidden group hover:bg-surface-hover transition-colors">
      <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
        <span>ًں“ˆ Revenue</span><span dir="rtl" class="font-arabic">ط§ظ„ط¥ظٹط±ط§ط¯ط§طھ</span>
      </p>
      <p class="font-display font-bold text-3xl md:text-4xl tabular-nums text-primary mt-2" dir="ltr">${fmt.money(revenue)}</p>
    </div>
    <div class="bg-surface cyber-border rounded-lg p-4 md:p-5 relative overflow-hidden group hover:bg-surface-hover transition-colors">
      <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
        <span>ًں’¸ Expenses</span><span dir="rtl" class="font-arabic">ط§ظ„ظ…طµط±ظˆظپط§طھ</span>
      </p>
      <p class="font-display font-bold text-3xl md:text-4xl tabular-nums text-alert mt-2" dir="ltr">${fmt.money(expenses)}</p>
    </div>
    <div class="bg-surface cyber-border rounded-lg p-4 md:p-5 relative overflow-hidden group hover:bg-surface-hover transition-colors">
      <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
        <span>ًںڈ† Profit</span><span dir="rtl" class="font-arabic">طµط§ظپظٹ ط§ظ„ط±ط¨ط­</span>
      </p>
      <p class="font-display font-bold text-3xl md:text-4xl tabular-nums ${profit >= 0 ? "text-white" : "text-alert"} mt-2" dir="ltr">${fmt.money(profit)}</p>
    </div>
  </div>

  <!-- Quick actions -->
  <div class="flex flex-wrap gap-3">
    <button id="addTxBtn" class="flex-1 min-w-[140px] bg-primary text-black font-headline font-bold uppercase tracking-widest text-sm px-5 py-3 rounded-xl hover:bg-white active:scale-95 transition-all flex items-center justify-center gap-2">
      <span class="material-symbols-outlined text-[20px]" style="font-variation-settings:'FILL' 1;">add_card</span> â‍• NEW / <span class="font-arabic normal-case">ط­ط±ظƒط©</span>
    </button>
    <button id="pricesBtn" title="Plan prices / ط£ط³ط¹ط§ط± ط§ظ„ط¨ط§ظ‚ط§طھ" class="bg-surface-container-high border border-outline-variant text-muted hover:text-primary hover:border-primary px-4 rounded-xl transition-all active:scale-95">
      <span class="material-symbols-outlined">sell</span>
    </button>
    <button id="reportsBtn" title="Monthly reports" class="bg-surface-container-high border border-outline-variant text-muted hover:text-primary hover:border-primary px-4 rounded-xl transition-all active:scale-95">
      <span class="material-symbols-outlined">insights</span>
    </button>
  </div>

  <!-- Live Transaction Feed -->
  <section class="flex flex-col gap-2">
    <h3 class="font-headline font-bold uppercase tracking-tight text-sm px-1">ًں§¾ Live Ledger <br/><span class="arabic-sub text-muted inline-block">ط­ط±ظƒط§طھ ط§ظ„ط´ظ‡ط± ط§ظ„ظ…ط­ط¯ط¯ â€” ظƒظ„ ط¯ط§ط®ظ„ط© ظˆط®ط§ط±ط¬ط©</span></h3>
    <div class="glass-card rounded-lg flex flex-col divide-y divide-outline-variant/50">
      ${ledger.length ? ledger.slice(0, 15).map(txRow).join("") : `<p class="text-center text-muted py-8 text-sm">ًں“­ ظ…ط§ ظپظٹ ط­ط±ظƒط§طھ ط¨ظ‡ط§ظ„ط´ظ‡ط± / No transactions this month</p>`}
    </div>
  </section>`;

  $("#ledPrev").onclick = () => { ledgerOffset = (ledgerOffset || 0) - 1; viewLedger(); };
  $("#ledNext").onclick = () => { ledgerOffset = Math.min(0, (ledgerOffset || 0) + 1); viewLedger(); };
  $("#ledJump").onchange = (e) => { ledgerOffset = Number(e.target.value); viewLedger(); };
  $("#addTxBtn").onclick = openTxModal;
  $("#pricesBtn").onclick = () => openPlanPrices();
  $("#reportsBtn").onclick = () => show("reports");
  $("#payAllBtn")?.addEventListener("click", () => {
    due.forEach((t) => payTrainer(t, { silent: true }));
    showToast(`âœ… Paid ${due.length} salaries â€” ${fmt.money(dueTotal)} / طھظ… ط¯ظپط¹ ط§ظ„ط±ظˆط§طھط¨`);
  });
}
// ---- Trainers: pay / CRUD / monthly reminders ----
function payTrainer(t, { silent = false } = {}) {
  if (t.contractEnd && Date.now() > t.contractEnd) {
    showToast("â›” Contract ended â€” extend it first via Edit / ط§ظ†طھظ‡ظ‰ ط¹ظ‚ط¯ظ‡طŒ ط¹ط¯ظ‘ظ„ طھط§ط±ظٹط® ط§ظ„ظ†ظ‡ط§ظٹط© ط£ظˆظ„ط§ظ‹", "err");
    return;
  }
  const amount = Number(t.salary || 0);
  let ledgerId = null;
  if (amount > 0) {
    const tx = store.insert("ledger", {
      type: "expense",
      amount,
      description: `Salary: ${t.name} / ط±ط§طھط¨: ${t.name}`,
      category: "salary",
      trainerId: t.id,
      date: Date.now(),
    });
    ledgerId = tx.id;
  }
  store.update("trainers", t.id, { lastPaidAt: Date.now() });
  if (!silent) showToast(`ًں”پ Renewed ${t.name} â€” ${fmt.money(amount)} deducted to Ledger / طھظ… طھط¬ط¯ظٹط¯ ط§ظ„ط±ط§طھط¨ ظˆط®طµظ…ظ‡ ط¨ط§ظ„ظ…ط§ظ„ظٹط©`);
}


// Full trainer file: work dates + dedicated payment history
function openTrainerDetails(id) {
  const t = store.get("trainers", id);
  if (!t) return;
  const ledger = store.all("ledger");
  const payments = ledger
    .filter((l) => l.category === "salary" && (l.trainerId === id || (!l.trainerId && l.description.includes(t.name))))
    .sort((a, b) => b.date - a.date);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  openModal(`
    <div class="flex items-center justify-between mb-1">
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg">ًں‘¤ ${escapeHtml(t.name)}</h3>
      <span class="text-primary font-headline font-bold" dir="ltr">${fmt.money(t.salary)}/mo</span>
    </div>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">ط§ظ„ظ…ظ„ظپ ط§ظ„ظƒط§ظ…ظ„ ظˆط³ط¬ظ„ ط§ظ„ط¯ظپط¹ط§طھ</p>

    <div class="grid grid-cols-2 gap-3 text-sm mb-6">
      <div class="bg-surface-container rounded-xl p-3">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Started / ط¨ط¯ط£ ط§ظ„ط¹ظ…ظ„</p>
        <p class="font-headline">${t.startedAt ? fmt.date(t.startedAt, currentLang()) : "â€”"}</p>
      </div>
      <div class="bg-surface-container rounded-xl p-3">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Last renewed / ط¢ط®ط± طھط¬ط¯ظٹط¯</p>
        <p class="font-headline">${t.lastPaidAt ? fmt.date(t.lastPaidAt, currentLang()) : "ظ„ظ… ظٹظڈط¬ط¯ط¯ ط¨ط¹ط¯"}</p>
      </div>
      ${t.contractEnd ? `
      <div class="bg-surface-container rounded-xl p-3 col-span-2">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Contract end / ط§ظ†طھظ‡ط§ط، ط§ظ„ط¹ظ‚ط¯</p>
        <p class="font-headline ${(Date.now() > t.contractEnd) ? "text-alert" : ""}">${fmt.date(t.contractEnd, currentLang())}${(Date.now() > t.contractEnd) ? " â€” ظ…ظ†طھظ‡ظٹ" : ""}</p>
      </div>` : ""}
      <div class="bg-surface-container rounded-xl p-3">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Total paid / ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ…ط¯ظپظˆط¹</p>
        <p class="font-headline text-alert" dir="ltr">${fmt.money(totalPaid)}</p>
      </div>
    </div>

    <h4 class="font-headline font-bold uppercase tracking-tight text-sm mb-2">ًں§¾ Payment history / ط³ط¬ظ„ ط§ظ„ط¯ظپط¹ط§طھ</h4>
    <div class="glass-card rounded-lg flex flex-col divide-y divide-outline-variant/50 max-h-[240px] overflow-y-auto">
      ${payments.length ? payments.map((p) => `
        <div class="p-3 flex items-center justify-between text-sm">
          <div class="flex items-center gap-2 min-w-0">
            <span class="material-symbols-outlined text-alert text-[18px]">south</span>
            <div class="min-w-0">
              <p class="truncate">ط¯ظپط¹ط© ط´ظ‡ط±ظٹط© / Monthly salary</p>
              <p class="text-xs text-muted">${fmt.date(p.date, currentLang())}${p.trainerId ? "" : " (legacy)"}</p>
            </div>
          </div>
          <p class="font-headline font-bold text-alert tabular-nums" dir="ltr">-${fmt.money(p.amount)}</p>
        </div>`).join("") : `<p class="text-center text-muted py-5 text-sm">ًں“­ ظ„ط§ طھظˆط¬ط¯ ط¯ظپط¹ط§طھ ظ…ط³ط¬ظ„ط© ط¨ط¹ط¯</p>`}
    </div>

    ${t.phone ? `<p class="text-xs text-muted mt-4" dir="ltr">ًں“‍ ${escapeHtml(t.phone)}</p>` : ""}`);
}

function openTrainerForm(id = null) {
  const t = i18n.t;
  const cur = id ? store.get("trainers", id) : null;
  const iso = (ts) => ts ? new Date(ts).toLocaleDateString("en-CA") : new Date().toLocaleDateString("en-CA");
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${cur ? "âœڈï¸ڈ Edit Trainer / طھط¹ط¯ظٹظ„ ظ…ط¯ط±ط¨" : "â‍• Add Trainer / ط¥ط¶ط§ظپط© ظ…ط¯ط±ط¨"}</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">${cur ? "طھط­ط¯ظٹط« ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط¯ط±ط¨" : "ط±ط­ ظٹط°ظƒظ‘ط±ظƒ ط§ظ„ظ†ط¸ط§ظ… ظƒظ„ ط´ظ‡ط± ط¨ط¯ظپط¹ ط±ط§طھط¨ظ‡"}</p>
    <form id="trainerForm" class="flex flex-col gap-3">
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Name / ط§ظ„ط§ط³ظ…</label>
        <input name="name" required maxlength="40" value="${cur ? escapeHtml(cur.name) : ""}" class="dp-field mt-1" placeholder="Coach Ahmad..." /></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Monthly salary ($)</label>
          <input name="salary" type="number" min="0" step="10" value="${cur ? cur.salary : 300}" class="dp-field mt-1" dir="ltr"/></div>
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Started / ط¨ط¯ط£ ط§ظ„ط¹ظ…ظ„</label>
          <input name="startedAt" type="date" value="${iso(cur?.startedAt)}" max="${new Date().toLocaleDateString("en-CA")}" class="dp-field mt-1"/></div>
      </div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Contract end / طھط§ط±ظٹط® ط§ظ†طھظ‡ط§ط، ط§ظ„ط¹ظ‚ط¯ (ط´ظ‡ط± ظ…ظ† ط§ظ„ظٹظˆظ… â€” ظ‚ط§ط¨ظ„ ظ„ظ„طھط¹ط¯ظٹظ„)</label>
        <input name="contractEnd" type="date" value="${cur?.contractEnd ? iso(cur.contractEnd) : iso(Date.now() + 30 * 86400000)}" class="dp-field mt-1"/></div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Phone (optional)</label>
        <input name="phone" dir="ltr" value="${cur ? escapeHtml(cur.phone || "") : ""}" class="dp-field mt-1" /></div>
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm pressable">${t.cancel}</button>
        <button type="submit" class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">${t.save}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  $("#trainerForm", mod.el).addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = sanitizeName(fd.get("name"));
    if (!name) { showToast("Invalid name / ط§ط³ظ… ط؛ظٹط± طµط§ظ„ط­", "err"); return; }
    const data = {
      name,
      salary: sanitizeAmount(fd.get("salary")),
      phone: sanitizePhone(fd.get("phone")),
    };
    const sd = fd.get("startedAt");
    if (sd) data.startedAt = new Date(`${sd}T00:00:00`).getTime();
    const ce = fd.get("contractEnd");
    data.contractEnd = ce ? new Date(`${ce}T23:59:59`).getTime() : null;
    if (cur) {
      store.update("trainers", id, data);
      mod.close();
      showToast("Saved / طھظ… ط§ظ„ط­ظپط¸");
    } else {
      store.insert("trainers", {
        ...data,
        startedAt: sd ? new Date(`${sd}T00:00:00`).getTime() : Date.now(),
        lastPaidAt: null,
      });
      mod.close();
      showToast("ًں‘¥ Trainer added â€” monthly reminder active / ط§ظ†ط¶ط§ظپ ط§ظ„ظ…ط¯ط±ط¨ ظˆط§ظ„طھط°ظƒظٹط± ظ…ظپط¹ظ‘ظ„");
    }
  });
}

// Trainer salary quick-expense
function openSalaryModal() {
  const t = i18n.t;
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">ًں’¼ Trainer Salary / ط±ط§طھط¨ ظ…ط¯ط±ط¨</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">طھط³ط¬ظٹظ„ ط±ط§طھط¨ ظƒط£ط­ط¯ ط§ظ„ظ…طµط±ظˆظپط§طھ</p>
    <form id="salaryForm" class="flex flex-col gap-3">
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Trainer name / ط§ط³ظ… ط§ظ„ظ…ط¯ط±ط¨</label>
        <input name="trainer" required class="dp-field mt-1" placeholder="Coach Ahmad..." /></div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.amount} ($)</label>
        <input name="amount" type="number" min="0.5" step="0.5" required class="dp-field mt-1" dir="ltr" /></div>
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm pressable">${t.cancel}</button>
        <button type="submit" class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">${t.save}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  $("#salaryForm", mod.el).addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get("trainer").trim();
    store.insert("ledger", {
      type: "expense",
      amount: Number(fd.get("amount")),
      description: `Salary: ${name} / ط±ط§طھط¨: ${name}`,
      category: "salary",
      date: Date.now(),
    });
    mod.close();
    showToast("Salary logged / طھظ… طھط³ط¬ظٹظ„ ط§ظ„ط±ط§طھط¨");
  });
}
function txRow(l) {
  const isIn = l.type === "revenue";
  const isPOS = isIn && (l.category === "pos" || l.category === "other-income");
  const failed = !isIn && l.category === "failed";

  let circle, amountCls, rowBorder = "";
  if (isPOS) {
    circle = `bg-white/10 text-frost-fixed-dim border border-outline`;
    amountCls = "text-white";
  } else if (isIn) {
    circle = `bg-primary/20 text-primary border border-primary/30`;
    amountCls = "text-primary";
  } else {
    circle = `bg-error/20 text-error border border-error/30`;
    amountCls = "text-error";
    if (failed) rowBorder = "border-l-2 !border-l-error";
  }
  const icon = isIn ? (isPOS ? "storefront" : "check_circle") : "credit_card_off";

  return `
  <div class="p-4 flex items-center justify-between hover:bg-surface-container-high transition-colors active:scale-[0.98] ${rowBorder}">
    <div class="flex items-center gap-3 min-w-0">
      <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${circle}">
        <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;">${icon}</span>
      </div>
      <div class="min-w-0">
        <p class="font-headline text-sm text-on-surface uppercase tracking-wide truncate">${escapeHtml(l.description)}</p>
        <p class="font-body text-xs text-muted">TXN-${String(l.id).slice(-4)} â€¢ ${fmt.timeAgo(l.date, currentLang())}</p>
      </div>
    </div>
    <p class="font-headline text-lg tabular-nums shrink-0 ${amountCls}" dir="ltr">${isIn ? "+" : "-"}$${nf.format(Math.abs(l.amount))}</p>
  </div>`;
}

function openTxModal() {
  const t = i18n.t;
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${t.addTransaction}</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">طھط³ط¬ظٹظ„ ط¥ظٹط±ط§ط¯ ط£ظˆ ظ…طµط±ظˆظپ</p>
    <form id="txForm" class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.type}</label>
          <select name="type" class="dp-field mt-1">
            <option value="revenue">${t.revenue}</option>
            <option value="expense">${t.expense}</option>
          </select></div>
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.amount} ($)</label>
          <input name="amount" type="number" min="0.5" step="0.5" required class="dp-field mt-1" /></div>
      </div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.description}</label>
        <input name="description" required class="dp-field mt-1" placeholder="Supplements POS..." /></div>
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm pressable">${t.cancel}</button>
        <button type="submit" class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">${t.save}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  $("#txForm", mod.el).addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    store.insert("ledger", {
      type: fd.get("type"),
      amount: Number(fd.get("amount")),
      description: fd.get("description").trim(),
      category: fd.get("type") === "revenue" ? "other-income" : "other-expense",
      date: Date.now(),
    });
    mod.close();
    showToast("Saved / طھظ… ط§ظ„ط­ظپط¸");
  });
}

/* ============================================================
   REPORTS  (docs/design/reports_unified)
   ============================================================ */
let reportOffset = 0;

function reportMonth(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d;
}

function viewReports() {
  const base = reportMonth(reportOffset);
  const mStart = base.getTime();
  const next = new Date(base); next.setMonth(base.getMonth() + 1);
  const mEnd = next.getTime();
  const prevStart = (() => { const p = new Date(base); p.setMonth(base.getMonth() - 1); return p.getTime(); })();

  const ledger = store.all("ledger");
  const members = store.all("members");
  const inRange = (l) => l.date >= mStart && l.date < mEnd;

  const rev = ledger.filter((l) => l.type === "revenue" && inRange(l)).reduce((s, l) => s + Number(l.amount || 0), 0);
  const prevRev = ledger.filter((l) => l.type === "revenue" && l.date >= prevStart && l.date < mStart).reduce((s, l) => s + Number(l.amount || 0), 0);
  const growth = prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : (rev > 0 ? 12.4 : 0);
  const netGrowth = members.filter((m) => m.joinDate >= mStart && m.joinDate < mEnd).length;
  const expiredInMonth = members.filter((m) => m.status === "expired" && m.expiresAt >= mStart && m.expiresAt < mEnd).length;
  const activeNow = members.filter((m) => effStatus(m) !== "expired").length;
  const retention = activeNow + expiredInMonth > 0 ? Math.round((activeNow / (activeNow + expiredInMonth)) * 100) : 92;

  // Weekly revenue trend within the month (7 bars like the design)
  const daysInMonth = Math.round((mEnd - mStart) / DAY);
  const weekCount = 7;
  const per = Math.ceil(daysInMonth / weekCount);
  const weekly = [];
  for (let i = 0; i < weekCount; i++) {
    const ws = mStart + i * per * DAY;
    const we = Math.min(ws + per * DAY, mEnd);
    weekly.push(ledger.filter((l) => l.type === "revenue" && l.date >= ws && l.date < we).reduce((s, l) => s + Number(l.amount || 0), 0));
  }
  const wkMax = Math.max(...weekly, 1);
  const hotIdx = weekly.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, i]) => i);

  // Plan distribution
  const PLAN_BI = { regular: ["Regular", "ط¹ط§ط¯ظٹ"], pro: ["Pro", "ط§ط®طھط±ط§ظپظٹ"], half: ["Half", "ظ†طµ"] };
  const planCounts = {};
  members.forEach((m) => { if (effStatus(m) !== "expired") planCounts[m.plan] = (planCounts[m.plan] || 0) + 1; });
  const totalPlans = Object.values(planCounts).reduce((a, b) => a + b, 0) || 1;
  const planOrder = ["regular", "pro", "half"];
  const dist = planOrder.filter((p) => planCounts[p]).slice(0, 3)
    .map((p, i) => ({ p, pct: Math.round((planCounts[p] / totalPlans) * 100), cls: ["bg-primary", "bg-accent", "bg-muted"][i], txtCls: ["text-primary", "text-accent", "text-muted"][i] }));

  const MONTHS_EN = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const MONTHS_AR = ["ظٹظ†ط§ظٹط±","ظپط¨ط±ط§ظٹط±","ظ…ط§ط±ط³","ط£ط¨ط±ظٹظ„","ظ…ط§ظٹظˆ","ظٹظˆظ†ظٹظˆ","ظٹظˆظ„ظٹظˆ","ط£ط؛ط³ط·ط³","ط³ط¨طھظ…ط¨ط±","ط£ظƒطھظˆط¨ط±","ظ†ظˆظپظ…ط¨ط±","ط¯ظٹط³ظ…ط¨ط±"];
  const arDigits = (n) => String(n).replace(/\d/g, (d) => "ظ ظ،ظ¢ظ£ظ¤ظ¥ظ¦ظ§ظ¨ظ©"[d]);

  screen.innerHTML = `
  <!-- Page Header -->
  <div class="space-y-1">
    <h2 class="font-headline text-2xl font-bold uppercase tracking-tight text-on-surface">ًں“ٹ Monthly Reports</h2>
    <p class="font-arabic text-sm text-muted">ط§ظ„طھظ‚ط§ط±ظٹط± ط§ظ„ط´ظ‡ط±ظٹط©</p>
  </div>

  <!-- Date Selector -->
  <div class="bg-surface-container cyber-border rounded-lg p-3 flex justify-between items-center relative overflow-hidden">
    <div class="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none"></div>
    <button id="repPrev" class="p-2 text-muted hover:text-primary transition-colors relative z-10"><span class="material-symbols-outlined">chevron_left</span></button>
    <div class="text-center relative z-10">
      <div class="font-headline font-bold text-primary tracking-widest neon-text">${MONTHS_EN[base.getMonth()]} ${base.getFullYear()}</div>
      <div class="font-arabic text-xs text-muted mt-0.5">${MONTHS_AR[base.getMonth()]} ${arDigits(base.getFullYear())}</div>
    </div>
    <button id="repNext" class="p-2 text-muted hover:text-primary transition-colors relative z-10 ${reportOffset >= 0 ? "invisible" : ""}"><span class="material-symbols-outlined">chevron_right</span></button>
  </div>

  <!-- Key Metrics Grid -->
  <div class="grid grid-cols-2 gap-4">
    <div class="col-span-2 bg-surface cyber-border rounded-lg p-5 relative overflow-hidden active:scale-[0.98] transition-transform">
      <div class="absolute bottom-[-10px] right-[-10px] opacity-10 text-primary">
        <span class="material-symbols-outlined text-[100px]" style="font-variation-settings:'FILL' 1;">account_balance_wallet</span>
      </div>
      <div class="flex justify-between items-start mb-2">
        <div>
          <p class="font-label text-[10px] uppercase tracking-widest text-muted">ًں’° Total Revenue</p>
          <p class="font-arabic text-[10px] text-muted leading-none">ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط¥ظٹط±ط§ط¯ط§طھ</p>
        </div>
        <span class="material-symbols-outlined text-accent">trending_up</span>
      </div>
      <div class="mt-4 flex items-baseline gap-2">
        <span class="font-display text-4xl font-bold text-on-surface tabular-nums">${nf.format(Math.round(rev))}</span>
        <span class="font-headline text-sm text-primary font-bold">ILS</span>
      </div>
      <div class="mt-2 flex items-center gap-1 text-xs text-accent">
        <span class="material-symbols-outlined text-[14px]">${growth >= 0 ? "arrow_upward" : "arrow_downward"}</span>
        <span>${Math.abs(growth).toFixed(1)}% vs last month</span>
      </div>
    </div>
    <div class="bg-surface cyber-border rounded-lg p-4 relative overflow-hidden active:scale-[0.98] transition-transform">
      <div class="mb-2">
        <p class="font-label text-[10px] uppercase tracking-widest text-muted">ًں“ˆ Net Growth</p>
        <p class="font-arabic text-[10px] text-muted leading-none">طµط§ظپظٹ ط§ظ„ظ†ظ…ظˆ</p>
      </div>
      <div class="mt-4">
        <span class="font-display text-3xl font-bold text-accent tabular-nums neon-text-pink">${netGrowth >= 0 ? "+" : ""}${netGrowth}</span>
      </div>
      <div class="mt-1 text-xs text-muted font-headline">New Members</div>
    </div>
    <div class="bg-surface cyber-border rounded-lg p-4 relative overflow-hidden active:scale-[0.98] transition-transform">
      <div class="mb-2">
        <p class="font-label text-[10px] uppercase tracking-widest text-muted">ًں”پ Retention</p>
        <p class="font-arabic text-[10px] text-muted leading-none">ظ…ط¹ط¯ظ„ ط§ظ„ط§ط­طھظپط§ط¸</p>
      </div>
      <div class="mt-4">
        <span class="font-display text-3xl font-bold text-on-surface tabular-nums">${retention}<span class="text-lg">%</span></span>
      </div>
      <div class="w-full bg-surface-container-highest h-1.5 rounded-full mt-2 overflow-hidden">
        <div class="bg-frost-fixed h-full rounded-full" style="width:${retention}%"></div>
      </div>
    </div>
  </div>

  <!-- Financial Chart -->
  <div class="bg-surface cyber-border rounded-lg p-5">
    <div class="flex justify-between items-center mb-6">
      <div>
        <p class="font-label text-xs uppercase tracking-widest text-on-surface">ًں“ˆ Revenue Trend</p>
        <p class="font-arabic text-[10px] text-muted">ط§طھط¬ط§ظ‡ ط§ظ„ط¥ظٹط±ط§ط¯ط§طھ</p>
      </div>
      <select class="bg-surface-container border-none text-xs text-muted rounded-md py-1 pl-2 pr-6 focus:ring-1 focus:ring-primary">
        <option>Daily / ظٹظˆظ…ظٹ</option><option>Weekly / ط£ط³ط¨ظˆط¹ظٹ</option>
      </select>
    </div>
    <div class="h-32 flex items-end justify-between gap-1 w-full mt-4">
      ${weekly.map((v, i) => `
        <div class="w-full ${hotIdx.includes(i) ? "bar-chart-fill-pink" : "bar-chart-fill"} rounded-t-sm transition-all duration-500"
             style="height:${Math.max(6, Math.round((v / wkMax) * 100))}%"></div>`).join("")}
    </div>
    <div class="flex justify-between mt-2 text-[10px] text-muted font-headline">
      <span>W1</span><span>W2</span><span>W3</span><span>W4</span>
    </div>
  </div>

  <!-- Subscriber Breakdown -->
  <div class="bg-surface cyber-border rounded-lg p-5">
    <div class="mb-4">
      <p class="font-label text-xs uppercase tracking-widest text-on-surface">ًں¥§ Plan Distribution</p>
      <p class="font-arabic text-[10px] text-muted">طھظˆط²ظٹط¹ ط§ظ„ط®ط·ط·</p>
    </div>
    <div class="space-y-4">
      ${dist.map(({ p, pct, cls, txtCls }) => `
        <div>
          <div class="flex justify-between text-sm mb-1">
            <span class="font-headline font-bold text-on-surface">${PLAN_BI[p][0]} / ${PLAN_BI[p][1]}</span>
            <span class="${txtCls} font-headline font-bold tabular-nums">${pct}%</span>
          </div>
          <div class="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
            <div class="${cls} h-full rounded-full" style="width:${pct}%"></div>
          </div>
        </div>`).join("")}
    </div>
  </div>

  <!-- Export Action -->
  <button id="repExport" class="w-full bg-primary text-black font-headline font-bold py-4 rounded-lg flex items-center justify-center gap-2 uppercase tracking-wide hover:bg-white transition-colors active:scale-[0.98] neon-shadow mt-4">
    <span class="material-symbols-outlined">download</span>
    <div class="flex flex-col items-start leading-none text-left">
      <span>ًں“„ Export PDF</span>
      <span class="font-arabic text-[10px] mt-0.5 opacity-80 normal-case">طھطµط¯ظٹط± PDF</span>
    </div>
  </button>`;

  $("#repPrev").onclick = () => { reportOffset--; viewReports(); };
  $("#repNext").onclick = () => { reportOffset++; viewReports(); };
  $("#repExport").onclick = exportData;
}

/* ============================================================
   PROFILE  (docs/design/profile_unified)
   ============================================================ */
function viewProfile() {
  const lic = license.get();
  const isOnline = codesDbMode();

  screen.innerHTML = `
  <div class="grid-bg -mx-4 -my-5 md:-mx-8 md:-my-8 px-4 py-6 md:px-8 md:py-8 space-y-6 md:space-y-8">

    <!-- Mobile Header Profile -->
    <div class="md:hidden flex flex-col items-center justify-center mb-8 cyber-card p-6 rounded-lg">
      <div class="w-24 h-24 rounded-full overflow-hidden neon-border neon-shadow mb-4 relative group cursor-pointer transition-transform active:scale-95">
        <img class="w-full h-full object-cover" src="assets/img/commander.jpg" alt="Commander"/>
        <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span class="material-symbols-outlined text-primary">edit</span>
        </div>
      </div>
      <h2 class="text-white font-headline text-2xl font-bold tracking-tighter uppercase">COMMANDER</h2>
      <div class="flex flex-col items-center mt-1">
        <span class="text-muted font-body text-sm">Shift Alpha</span>
        <span class="font-arabic text-muted text-xs mt-0.5">ط§ظ„ظ‚ط§ط¦ط¯ - ط§ظ„ظ…ظ†ط§ظˆط¨ط© ط£ظ„ظپط§</span>
      </div>
      <div class="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border ${isOnline ? "bg-primary/10 border-primary/30" : "bg-alert/10 border-alert/30"}">
        <span class="w-2 h-2 rounded-full ${isOnline ? "bg-primary animate-pulse" : "bg-alert"}"></span>
        <span class="text-[10px] font-label tracking-widest uppercase ${isOnline ? "text-primary" : "text-alert"}">${isOnline ? "SYSTEM ACTIVE" : "DEMO MODE"}</span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Account Security -->
      <section class="cyber-card p-6 hover:bg-[#1a1a1a] transition-colors duration-300 rounded-lg">
        <div class="flex items-center justify-between mb-6 border-b border-outline-variant pb-4">
          <div>
            <h3 class="font-headline text-lg font-bold uppercase tracking-tight text-white">ًں”گ Account Security</h3>
            <p class="font-arabic text-muted text-sm">ط£ظ…ط§ظ† ط§ظ„ط­ط³ط§ط¨</p>
          </div>
          <span class="material-symbols-outlined text-muted">security</span>
        </div>
        <div class="space-y-4">
          <div class="flex items-center justify-between group cursor-pointer" id="secChangePw">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Website Password / <span class="font-arabic normal-case">ظƒظ„ظ…ط© ط³ط± ط§ظ„ظ…ظˆظ‚ط¹</span></p>
              <p class="text-muted text-xs mt-1 font-headline">Change your login password / طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط³ط± ط§ظ„ط¯ط®ظˆظ„</p>
            </div>
            <button class="text-primary text-sm font-label uppercase tracking-widest group-hover:underline">Edit</button>
          </div>
          <div class="h-px bg-outline-variant w-full"></div>
          <div class="flex items-center justify-between group cursor-pointer" id="secRestore">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Restore Backup</p>
              <p class="text-muted text-xs mt-1 font-headline">Import facility data JSON</p>
            </div>
            <button class="text-primary text-sm font-label uppercase tracking-widest group-hover:underline">Import</button>
          </div>
          <div class="h-px bg-outline-variant w-full"></div>
          <div class="flex items-center justify-between group cursor-pointer" id="secCloudSync">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">âکپï¸ڈ Cloud Sync / <span class="font-arabic normal-case">ظ…ط²ط§ظ…ظ†ط© ط³ط­ط§ط¨ظٹط©</span></p>
              <p class="text-muted text-xs mt-1 font-headline">Backup &amp; sync now / ط±ظپط¹ ظ†ط³ط®ط© ط§ظ„ط¢ظ†</p>
            </div>
            <button class="text-primary text-sm font-label uppercase tracking-widest group-hover:underline">Sync</button>
          </div>
          <div class="h-px bg-outline-variant w-full"></div>
          <div class="flex items-center justify-between group cursor-pointer" id="secExport">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Export Backup / <span class="font-arabic normal-case">طھطµط¯ظٹط± ظ†ط³ط®ط©</span></p>
              <p class="text-muted text-xs mt-1 font-headline">Download facility data JSON</p>
            </div>
            <button class="text-primary text-sm font-label uppercase tracking-widest group-hover:underline">Export</button>
          </div>
          <div class="h-px bg-outline-variant w-full"></div>
          <div class="flex items-center justify-between group cursor-pointer" id="secReset">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Reset Data</p>
              <p class="text-muted text-xs mt-1 font-headline">Restore demo dataset / ط¨ظٹط§ظ†ط§طھ طھط¬ط±ظٹط¨ظٹط©</p>
            </div>
            <button class="text-primary text-sm font-label uppercase tracking-widest group-hover:underline">Reset</button>
          </div>
          <input type="file" id="importFile" accept=".json" class="hidden" />
        </div>
      </section>

      <!-- App Preferences -->
      <section class="cyber-card p-6 hover:bg-[#1a1a1a] transition-colors duration-300 rounded-lg">
        <div class="flex items-center justify-between mb-6 border-b border-outline-variant pb-4">
          <div>
            <h3 class="font-headline text-lg font-bold uppercase tracking-tight text-white">ًںژ›ï¸ڈ App Preferences</h3>
            <p class="font-arabic text-muted text-sm">طھظپط¶ظٹظ„ط§طھ ط§ظ„طھط·ط¨ظٹظ‚</p>
          </div>
          <span class="material-symbols-outlined text-muted">tune</span>
        </div>
        <div class="space-y-6">
          <div class="flex items-center justify-between group cursor-pointer" id="planPricesRow">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Plan Prices / <span class="font-arabic normal-case">ط£ط³ط¹ط§ط± ط§ظ„ط¨ط§ظ‚ط§طھ</span></p>
              <p class="text-muted text-xs mt-1 font-headline">Default price per plan</p>
            </div>
            <button class="text-primary text-sm font-label uppercase tracking-widest group-hover:underline">Edit</button>
          </div>
          <div class="h-px bg-outline-variant w-full"></div>
          <div class="flex items-center justify-between">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Language / ط§ظ„ظ„ط؛ط©</p>
              <p class="text-muted text-xs mt-1 font-headline">English (Default)</p>
            </div>
            <div class="bg-surface-container-highest rounded-full p-1 flex">
              <button data-lang="en" class="lang-btn px-4 py-1.5 rounded-full font-label text-[10px] tracking-widest uppercase transition-colors">ENG</button>
              <button data-lang="ar" class="lang-btn px-4 py-1.5 rounded-full font-arabic text-sm hover:text-white transition-colors">ط¹ط±ط¨ظٹ</button>
            </div>
          </div>
          <div class="h-px bg-outline-variant w-full"></div>
          <div class="flex items-center justify-between">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Theme Mode</p>
              <p class="text-muted text-xs mt-1 font-headline">Dark Mode (Forced)</p>
            </div>
            <label class="relative inline-flex items-center cursor-not-allowed">
              <input checked class="sr-only peer" disabled type="checkbox"/>
              <div class="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white peer-checked:bg-primary opacity-70"></div>
            </label>
          </div>
          <div class="h-px bg-outline-variant w-full"></div>
          <div class="flex items-center justify-between">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Haptic Feedback</p>
              <p class="text-muted text-xs mt-1 font-headline">Tactile responses</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input id="hapticToggle" class="sr-only peer" type="checkbox" ${localStorage.getItem("dp_haptic") !== "0" ? "checked" : ""}/>
              <div class="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </section>

      <!-- System Info & Logout -->
      <section class="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
        <section class="cyber-card p-6 hover:bg-[#1a1a1a] transition-colors duration-300 rounded-lg">
          <div class="flex items-center justify-between mb-6 border-b border-outline-variant pb-4">
            <div>
              <h3 class="font-headline text-lg font-bold uppercase tracking-tight text-white">ًں“œ System License</h3>
              <p class="font-arabic text-muted text-sm">طھط±ط®ظٹطµ ط§ظ„ظ†ط¸ط§ظ…</p>
            </div>
            <span class="material-symbols-outlined text-muted">verified_user</span>
          </div>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">License Key</p>
                <p class="font-arabic text-muted text-[10px] mt-0.5">ظ…ظپطھط§ط­ ط§ظ„طھط±ط®ظٹطµ</p>
                <p class="text-muted font-headline text-xs mt-1" dir="ltr">DP-${escapeHtml(lic.code)}</p>
              </div>
              <button id="copyKey" class="text-primary text-sm font-label uppercase tracking-widest hover:underline">Copy</button>
            </div>
            <div class="h-px bg-outline-variant w-full"></div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Registered to / <span class="font-arabic normal-case">ط§ظ„ظ…ط³ط¬ظ‘ظ„ ط¨ط§ط³ظ…</span></p>
                <p class="text-primary font-headline text-sm mt-1">${escapeHtml(lic.owner || "â€”")}</p>
              </div>
              <span class="material-symbols-outlined text-primary text-lg">badge</span>
            </div>
            <div class="h-px bg-outline-variant w-full"></div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Tier / <span class="font-arabic normal-case">ط§ظ„ط¨ط§ظ‚ط©</span></p>
                <p class="text-primary font-headline text-sm mt-1">${tierLabel(lic.tier)}</p>
              </div>
              <span class="material-symbols-outlined text-primary text-lg">workspace_premium</span>
            </div>
            <div class="h-px bg-outline-variant w-full"></div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Remaining Time</p>
                <p class="font-arabic text-muted text-[10px] mt-0.5">ط§ظ„ظ…ط¯ط© ط§ظ„ظ…طھط¨ظ‚ظٹط©</p>
                <p class="text-primary text-xs mt-1 font-bold tracking-wider uppercase font-headline">${license.daysLeft() === Infinity ? "â™¾ï¸ڈ ط¯ط§ط¦ظ… / LIFETIME" : license.daysLeft() + " Days / ظٹظˆظ…ظ‹ط§"}</p>
              </div>
              <div class="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            </div>
          </div>
        </section>

        <section class="cyber-card p-6 flex flex-col justify-between rounded-lg">
          <div>
            <div class="mb-4 pb-4 border-b border-outline-variant">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <h3 class="font-headline text-sm font-bold uppercase tracking-tight text-primary">ًں‘¨â€چًں’» Team Identity</h3>
                  <p class="font-arabic text-muted text-[10px]">ظ‡ظˆظٹط© ط§ظ„ظپط±ظٹظ‚</p>
                </div>
                <span class="material-symbols-outlined text-primary text-sm">hub</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-surface-container-highest border border-primary/30 flex items-center justify-center neon-shadow">
                  <span class="material-symbols-outlined text-primary text-xs">terminal</span>
                </div>
                <div>
                  <p class="font-headline text-lg font-bold tracking-tighter text-on-surface uppercase">hitik</p>
                  <p class="text-muted text-[10px] font-body tracking-wider">Built by hitik / <span class="font-arabic">طµظڈظ†ط¹ ط¨ظˆط§ط³ط·ط© hitik</span></p>
                </div>
              </div>
            </div>
            <div class="mb-4 pb-4 border-b border-outline-variant">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <h3 class="font-headline text-sm font-bold uppercase tracking-tight text-primary">ًں“‍ Team Contact</h3>
                  <p class="font-arabic text-muted text-[10px]">ط¬ظ‡ط© ط§طھطµط§ظ„ ط§ظ„ظپط±ظٹظ‚</p>
                </div>
                <span class="material-symbols-outlined text-primary text-sm">contact_support</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-surface-container-highest border border-primary/30 flex items-center justify-center neon-shadow">
                  <span class="material-symbols-outlined text-primary text-xs">call</span>
                </div>
                <div>
                  <p class="font-headline text-lg font-bold tracking-tighter text-on-surface" dir="ltr">+972568802803</p>
                  <p class="text-muted text-[10px] font-body tracking-wider uppercase">WhatsApp / Signal</p>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between border-b border-outline-variant pb-2">
              <div>
                <h3 class="font-headline text-sm font-bold uppercase tracking-tight text-muted">ًں› ï¸ڈ System Build</h3>
              </div>
              <span class="material-symbols-outlined text-primary text-sm">memory</span>
            </div>
            <p class="text-center text-[10px] text-muted tracking-widest uppercase font-headline mt-4">DIGITAL PULSE v1.0 آ· CYBER ATHLETIC EDITION</p>
          </div>

          <div class="flex flex-col gap-4 mt-4">
            <button id="exportBtn" class="w-full border border-primary text-primary font-headline uppercase font-bold tracking-widest text-lg py-4 rounded-lg flex flex-col items-center justify-center hover:bg-primary/10 transition-all active:scale-95">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined">download</span>
                <span>EXPORT DATA</span>
              </div>
              <span class="font-arabic text-xs mt-1 opacity-70 normal-case">طھطµط¯ظٹط± ط§ظ„ط¨ظٹط§ظ†ط§طھ</span>
            </button>
            <button id="logoutBtn" class="w-full bg-alert text-white font-headline uppercase font-bold tracking-widest text-lg py-4 rounded-lg flex flex-col items-center justify-center hover:bg-[#e62e5c] transition-all active:scale-95 alert-glow border border-alert">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined">logout</span>
                <span>LOGOUT</span>
              </div>
              <span class="font-arabic text-xs mt-1 opacity-90 normal-case">طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬</span>
            </button>
          </div>
        </section>
      </section>
    </div>
  </div>`;

  // language pill state
  const paintLang = () => {
    document.querySelectorAll(".lang-btn").forEach((b) => {
      const active = b.dataset.lang === currentLang();
      b.classList.toggle("bg-primary", active);
      b.classList.toggle("text-black", active);
      b.classList.toggle("text-muted", !active);
    });
  };
  paintLang();
  document.querySelectorAll(".lang-btn").forEach((b) =>
    b.addEventListener("click", () => { i18n.setLang(b.dataset.lang); paintLang(); }));

  $("#planPricesRow").onclick = () => openPlanPrices();
  $("#copyKey").onclick = async () => {
    try { await navigator.clipboard.writeText(`DP-${lic.code}`); showToast("Copied / طھظ… ط§ظ„ظ†ط³ط®"); }
    catch { showToast("Copy failed / ظپط´ظ„ ط§ظ„ظ†ط³ط®", "err"); }
  };
  $("#hapticToggle")?.addEventListener("change", (e) =>
    localStorage.setItem("dp_haptic", e.target.checked ? "1" : "0"));
  $("#secChangePw").onclick = openChangePassword;
  $("#secRestore").onclick = () => $("#importFile").click();
  $("#secCloudSync").onclick = cloudSyncNow;
  $("#secExport").onclick = exportData;
  $("#importFile").addEventListener("change", importData);
  $("#secReset").onclick = async () => {
    const ok = await confirmDialog({ titleEn: "Reset EVERYTHING to factory?", titleAr: "ط¥ط¹ط§ط¯ط© طھط¹ظٹظٹظ† ظƒظ„ ط´ظٹط، ط¨ط§ظ„ظƒط§ظ…ظ„ ظ„ظ„ظ…طµظ†ط¹طں", confirmText: "Reset", danger: true });
    if (!ok) return;
    try { store.stopSync && store.stopSync(); } catch {}
    // Clear all app data - robust clearing
    Object.keys(localStorage).forEach(k => { if (k.startsWith("dp_")) localStorage.removeItem(k); });
    sessionStorage.clear();
    store.resetAll();
    // Force reload to login screen
    showToast("Full reset done / طھظ…طھ ط¥ط¹ط§ط¯ط© ظƒظ„ ط´ظٹط،");
    setTimeout(() => { location.reload(); }, 300);
  };
  $("#exportBtn").onclick = exportData;
  $("#logoutBtn").onclick = deactivateLicense;
}

// ---------- Change website password ----------
function openChangePassword() {
  const lic = license.get();
  if (!lic || !lic.code) { showToast("No license found / ظ„ط§ ظٹظˆط¬ط¯ طھط±ط®ظٹطµ", "err"); return; }
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">ًں”‘ Change Website Password</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط³ط± ط­ط³ط§ط¨ظƒ â€” ط£ظƒطھط¨ ط§ظ„ط­ط§ظ„ظٹط© ط«ظ… ط§ظ„ط¬ط¯ظٹط¯ط©</p>
    <form id="chpwForm" class="flex flex-col gap-3">
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Current / ط§ظ„ط­ط§ظ„ظٹط©</label>
        <input name="cur" type="password" required class="dp-field mt-1" dir="ltr"/></div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">New / ط§ظ„ط¬ط¯ظٹط¯ط© (4+)</label>
        <input name="n1" type="password" required minlength="4" class="dp-field mt-1" dir="ltr"/></div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Repeat / طھط£ظƒظٹط¯ ط§ظ„ط¬ط¯ظٹط¯ط©</label>
        <input name="n2" type="password" required minlength="4" class="dp-field mt-1" dir="ltr"/></div>
      <p id="chpwMsg" class="text-xs min-h-[1rem]" style="color:#ff3366"></p>
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm pressable">${i18n.t.cancel}</button>
        <button type="submit" class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">${i18n.t.save}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  $("#chpwForm", mod.el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msgEl = document.getElementById("chpwMsg");
    if (fd.get("n1") !== fd.get("n2")) { msgEl.textContent = "New passwords don't match / ط§ظ„ط¬ط¯ظٹط¯ط© ط؛ظٹط± ظ…طھط·ط§ط¨ظ‚طھظٹظ†"; return; }
    try {
      const res = await codesDbChange(lic.code, fd.get("cur"), fd.get("n1"));
      if (!res.ok) {
        const errors = {
          WRONG_PASSWORD: "Current password is wrong / ط§ظ„ط­ط§ظ„ظٹط© ط®ط§ط·ط¦ط©",
          WEAK_PASSWORD: "Weak password (min 4) / ظƒظ„ظ…ط© ط³ط± ط¶ط¹ظٹظپط©",
          NO_PASSWORD: "No password set yet / ظ„ط§ طھظˆط¬ط¯ ظƒظ„ظ…ط© ط³ط± ط¨ط¹ط¯",
        };
        msgEl.textContent = errors[res.error] || "Failed / ظپط´ظ„";
        return;
      }
      mod.close();
      showToast("ًں”گ Password changed / طھظ… طھط؛ظٹظٹط± ظƒظ„ظ…ط© ط§ظ„ط³ط±");
    } catch (err) {
      msgEl.textContent = "Connection error / ط®ط·ط£ ط¨ط§ظ„ط§طھطµط§ظ„";
    }
  });
}

async function codesDbChange(code, cur, next) {
  const { codesDb } = await import("./db.js");
  return codesDb.changeClientPassword(code, cur, next);
}

async function cloudSyncNow() {
  const L = license.get();
  if (!L || !L.data_enabled) { showToast("Cloud sync disabled for this code / ط§ظ„ط³ط­ط§ط¨ط© ظ…ط¹ط·ظ‘ظ„ط© ظ„ظ‡ط°ط§ ط§ظ„ظƒظˆط¯", "err"); return; }
  showToast("Syncingâ€¦ / ط¬ط§ط±ظچ ط§ظ„ظ…ط²ط§ظ…ظ†ط©â€¦");
  try { await store.syncNow(); showToast("âکپï¸ڈ Synced / طھظ…طھ ط§ظ„ظ…ط²ط§ظ…ظ†ط©"); }
  catch { showToast("Sync failed / ظپط´ظ„طھ ط§ظ„ظ…ط²ط§ظ…ظ†ط©", "err"); }
}

function exportData() {
  const dump = store.exportAll();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `digital-pulse-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Backup downloaded / طھظ… طھظ†ط²ظٹظ„ ط§ظ„ظ†ط³ط®ط© ط§ظ„ط§ط­طھظٹط§ط·ظٹط©");
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      store.importAll(JSON.parse(ev.target.result));
      showToast("Imported successfully / طھظ… ط§ظ„ط§ط³طھظٹط±ط§ط¯ ط¨ظ†ط¬ط§ط­");
    } catch {
      showToast("Invalid backup file / ظ…ظ„ظپ ط؛ظٹط± طµط§ظ„ط­", "err");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function codesDbMode() {
  return localStorage.getItem("dp_license_mode") === "online";
}

async function listCodes() {
  const t = i18n.t;
  const codes = await codesDb.list();
  const html = `
    <div class="bg-surface-container rounded-lg p-4 mb-6">
      <h3 class="font-headline text-lg font-bold uppercase tracking-tight mb-4">${t.codesManagement}</h3>
      <div class="grid grid-cols-2 gap-4">
        ${codes.length ? codes.map(c => `
          <div class="bg-surface p-3 rounded-lg border border-outline-variant hover:border-primary transition-colors">
            <p class="font-bold text-primary truncate" style="max-width:200px;direction:ltr">${escapeHtml(c.code || "â€”")}</p>
            <p class="text-sm text-muted direction:rtl">${escapeHtml(c.owner || "â€”")}</p>
            <p class="text-xs text-muted">${c.used ? "Used" : "Available"}</p>
          </div>`).join("") : `<p class="text-center text-muted py-8">ظ„ط§ طھظˆط¬ط¯ ط£ظƒظˆط§ط¯ ط¨ط¹ط¯ / No codes yet</p>`}
      </div>
    </div>`;
  showModal(html || "");
}

async function showCodesTable() {
  const codes = await codesDb.list();
  const html = `
    <div class="overflow-x-auto">
      <table class="w-full text-left whitespace-nowrap">
        <thead class="bg-surface border-b border-outline-variant">
          <tr>
            <th class="p-4 font-label tracking-widest text-muted uppercase">ظƒظˆط¯ / Code</th>
            <th class="p-4 font-label tracking-widest text-muted uppercase">ط§ظ„ط¨ط§ظ‚ظٹط© / Tier</th>
            <th class="p-4 font-label tracking-widest text-muted uppercase">ط§ظ„ظ…ط§ظ„ظƒ / Owner</th>
            <th class="p-4 font-label tracking-widest text-muted uppercase">ط§ظ„ط­ط§ظ„ط© / Status</th>
          </tr>
        </thead>
        <tbody>
          ${codes.length ? codes.map(c => `
            <tr class="border-b border-outline-variant/50">
              <td class="p-4 font-bold truncate" style="max-width:200px;direction:ltr">${escapeHtml(c.code || "â€”")}</td>
              <td class="p-4">${escapeHtml(c.tier || "â€”")}</td>
              <td class="p-4">${escapeHtml(c.owner || "â€”")}</td>
              <td class="p-4 ${c.used ? "text-alert" : "text-primary"}">
                ${c.used ? "ًںں، Used" : "ًںں¢ Available"}
              </td>
            </tr>`).join("") : `<tr><td class="p-12 text-center text-muted">ظ„ط§ طھظˆط¬ط¯ ط£ظƒظˆط§ط¯</td></tr>`}
        </tbody>
      </table>
    </div>`;
  showModal(html);
}

function showModal(html) {
  const mod = openModal(`
    <div class="p-6">
      <button class="absolute top-2 right-2 text-muted hover:text-primary transition-colors" onclick="this.closest('.modal').remove()">âœ•</button>
      ${html}
    </div>`);
  setTimeout(() => mod.el.querySelectorAll('.material-symbols-outlined').forEach(icon => {
    icon.style.fontVariationSettings = "'FILL' 1";
  }), 100);
}

function addCode() {
  const t = i18n.t;
  const mod = openModal(`
    <div class="p-6">
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-4">${t.addCode || "Add Code"}</h3>
      <form id="codeForm" class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[10px] uppercase tracking-widest text-muted font-headline">Tier</label>
            <select name="tier" class="dp-field mt-1">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] uppercase tracking-widest text-muted font-headline">Days</label>
            <input name="days" type="number" min="1" step="1" value="30" class="dp-field mt-1" />
          </div>
        </div>
        <div>
          <label class="text-[10px] uppercase tracking-widest text-muted font-headline">Owner</label>
          <input name="owner" type="text" class="dp-field mt-1" placeholder="Pulse Gym" />
        </div>
        <div class="flex gap-3 pt-2">
          <button type="button" class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm cancel-code pressable">${t.cancel}</button>
          <button type="submit" class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase tracking-widest text-sm neon-shadow hover:bg-white active:scale-95 transition-all flex items-center justify-center gap-2 save-code">
            <span class="material-symbols-outlined">save</span> ${t.save}
          </button>
        </div>
      </form>
    </div>`);
  mod.el.querySelector(".cancel-code").onclick = mod.close;
  $("#codeForm", mod.el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await codesDb.create({
        tier: fd.get("tier") || "monthly",
        days: Number(fd.get("days")) || 30,
        owner: fd.get("owner").trim() || ""
      });
      showToast("Code added / طھظ… ط¥ط¶ط§ظپط© ط§ظ„ظƒظˆط¯");
      mod.close();
    } catch (err) {
      showToast(err.message || "Error", "err");
    }
  });
}

// ---------- Boot ----------
show("dashboard");

