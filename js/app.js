// ============================================================
// Digital Pulse — main SPA logic (pixel-faithful to Stitch designs)
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

// ---------- Force update (native APK only) — non-blocking with timeout + cache ----------
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
    '<div style="font-size:72px;color:#ccff00">⬇</div>' +
    '<h1 style="font-size:24px;margin:0;font-weight:800">تحديث مطلوب</h1>' +
    '<p style="color:#bdbdbd;max-width:300px;margin:0;line-height:1.6;direction:rtl">يتوفر إصدار أحدث من التطبيق. يرجى التحديث للمتابعة.</p>' +
    '<a href="' + safeUrl + '" target="_blank" rel="noopener" style="margin-top:8px;padding:14px 28px;border-radius:14px;background:#ccff00;color:#000;font-weight:800;text-decoration:none">تحديث الآن</a>' +
    '<p style="font-size:11px;color:#777;margin:8px 0 0">Update / حدّث التطبيق</p>' +
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
    dashboard: ["DASHBOARD", "الرئيسية"],
    roster: ["MEMBER ROSTER", "قائمة الأعضاء"],
    hardware: ["HARDWARE STATUS", "حالة الأجهزة"],
    ledger: ["LEDGER", "المالية"],
    reports: ["MONTHLY REPORTS", "التقارير الشهرية"],
    profile: ["PROFILE", "حسابي"],
  };
  $("#pageTitleEn").textContent = titles[tab][0];
  $("#pageTitleAr").textContent = titles[tab][1];

  // Bottom nav (mobile) — active tab per design: filled pill + volt text
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

  // Desktop drawer — active item per roster design
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
  ({ dashboard: viewDashboard, roster: viewRoster, ledger: viewLedger, reports: viewReports, profile: viewProfile }[tab])();
}

document.querySelectorAll(".nav-tab").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));

// Sidebar nav built here (shared markup for all tabs)
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
    titleAr: "مسح جميع البيانات؟",
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
      en: `${d.code} Offline`, ar: `${d.name} متوقف`,
      subEn: d.issue || "Maintenance required", subAr: "يتطلب صيانة",
      time: d.updatedAt || Date.now() }));
  feed.push({ sev: "info", en: "Capacity Alert", ar: "تنبيه السعة",
    subEn: `Floor utilization at ${Math.min(95, 40 + s.activeMembers * 5)}%`,
    subAr: `استخدام الصالة بنسبة ٪${Math.min(95, 40 + s.activeMembers * 5)}`,
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
        <span>👥 Active Members</span><span dir="rtl" class="font-arabic">الأعضاء النشطين</span>
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
          <span>⏳ Ended Today</span><span dir="rtl" class="font-arabic">انتهت اليوم</span>
        </p>
        <div class="w-2 h-2 rounded-full bg-alert shadow-neon-alert animate-pulse-fast mt-1"></div>
      </div>
      <div class="flex items-end justify-between">
        <p class="font-display font-bold text-5xl tabular-nums text-alert mt-2">${s.endedToday}</p>
        <span class="material-symbols-outlined text-alert opacity-20 text-4xl absolute -bottom-2 -right-2 group-hover:opacity-40 transition-opacity">event_busy</span>
      </div>
    </div>
    <!-- Total Expired -->
    <div class="stat-card cursor-pointer bg-surface border border-outline-variant p-4 h-[100px] flex flex-col justify-between hover:bg-surface-hover transition-colors">
      <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
        <span>&nbsp;</span><span>اجمالي الارباح&nbsp;</span>
      </p>
      <p class="font-display font-bold text-3xl tabular-nums text-muted mt-1">${s.totalExpired}</p>
    </div>
    <!-- Maintenance Alert -->
    <div class="stat-card cursor-pointer bg-alert border border-alert p-4 h-[100px] flex flex-col justify-between shadow-neon-alert">
      <p class="font-body font-semibold text-xs text-black uppercase tracking-[1px] flex items-start gap-1 leading-tight">
        <span class="material-symbols-outlined text-[14px] mt-0.5">build</span>
        <span class="flex flex-col gap-0.5"><span>🔧 Maint. Alert</span><span>تنبيه صيانة</span></span>
      </p>
      <p class="font-display font-bold text-3xl tabular-nums text-black mt-1">${s.maintAlerts}</p>
    </div>
    <!-- License Status -->
    <div class="stat-card cursor-pointer bg-surface border border-outline-variant p-4 h-[100px] flex flex-col justify-between hover:bg-surface-hover transition-colors relative overflow-hidden group col-span-2" onclick="location.hash='#/profile'">
      <div class="flex flex-col gap-0.5">
        <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col">
          <span>🔑 License Status</span><span class="text-[10px] opacity-70">حالة الترخيص</span>
        </p>
      </div>
      <div class="flex flex-col">
        <p class="font-mono text-white text-sm tracking-wider" dir="ltr">CODE: ${escapeHtml(lic.code)} <span class="text-primary">· ${tierLabel(lic.tier)}</span></p>
        <p class="font-display font-bold text-xs text-white mt-1 uppercase">
          <span>${license.daysLeft() === Infinity ? "♾️ LIFETIME" : license.daysLeft() + " Days Left"}</span><span class="ml-1 opacity-70">${license.daysLeft() === Infinity ? "دائم" : "يوم متبقي"}</span>
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
        <span class="text-sm opacity-70">تسجيلات الدخول (٧ أيام)</span>
      </h2>
      <div class="flex gap-2" id="rangeBtns">
        <button data-range="7" class="chart-range rounded-2xl font-display font-bold text-[10px] uppercase px-2 py-1 bg-surface-hover border border-outline-variant text-white flex flex-col items-center">
          <span>7D</span><span>٧أ</span>
        </button>
        <button data-range="30" class="chart-range rounded-2xl font-display font-bold text-[10px] uppercase px-2 py-1 border border-outline-variant text-muted flex flex-col items-center">
          <span>30D</span><span>٣٠أ</span>
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
      <span>🗂️ System Feed</span><span>/</span><span>سجل النظام</span>
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
            <span class="text-[8px] opacity-70">${i18n.t.statuses[f] || (f === "trainers" ? "مدربون" : f)}</span>
          </button>`).join("")}
      </div>
    </div>

    ${rosterFilter === "trainers" ? `
    <div class="flex justify-end">
      <button id="newTrainerBtn" class="text-primary text-xs font-headline uppercase tracking-widest flex items-center gap-1 pressable">
        <span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' 1;">add_circle</span> NEW TRAINER / مدرب جديد
      </button>
    </div>` : `
    <!-- Trainers & salary actions -->
    <div class="flex flex-wrap gap-2">
      <button id="addSalaryBtn" class="flex-1 min-w-[150px] bg-surface-container-high border border-outline-variant text-on-surface font-headline font-bold uppercase tracking-widest text-xs px-4 py-2.5 rounded-xl hover:border-primary hover:text-primary active:scale-95 transition-all flex items-center justify-center gap-2">
        <span class="material-symbols-outlined text-[18px]">badge</span> 💪 SALARY / <span class="font-arabic normal-case">تسجيل راتب يدوي</span>
      </button>
      <button id="addTrainerBtn" class="flex-1 min-w-[150px] bg-primary text-black font-headline font-bold uppercase tracking-widest text-xs px-4 py-3 rounded-xl shadow-neon hover:bg-white active:scale-95 transition-all flex items-center justify-center gap-2">
        <span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1;">person_add</span> ➕ ADD TRAINER / <span class="font-arabic normal-case">إضافة مدرب</span>
      </button>
    </div>`}

    <!-- Roster List (members or trainers by filter) -->
    <div id="rosterGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>`;

  const renderList = () => {
    const grid = $("#rosterGrid");

    // ── TRAINERS view ──
    if (rosterFilter === "trainers") {
      const trainers = store.all("trainers");
      grid.innerHTML = trainers.length ? trainers.map(trainerCard).join("")
        : `<div class="col-span-full text-center text-muted py-12 text-sm">📭 ما في مدربين — ضيف من NEW فوق</div>`;
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
            titleAr: "حذف المدرب؟ سجلاته المالية ستبقى محفوظة في السجل",
            confirmText: "Delete",
            danger: true,
          });
          if (ok) { store.remove("trainers", t.id); showToast("Trainer deleted — finance kept / انحذف المدرب وحُفظت رواتبها بالسجل"); }
        }));
      return;
    }

    // ── MEMBERS view ──
    const q = rosterQuery.trim().toLowerCase();
    let members = store.all("members");
    if (rosterFilter) members = members.filter((m) => effStatus(m) === rosterFilter);
    if (q) members = members.filter((m) => m.name.toLowerCase().includes(q) || String(m.phone).includes(q));

    grid.innerHTML = members.length ? members.map(memberCard).join("")
      : `<div class="col-span-full text-center text-muted py-12 text-sm">😴 No members found / ما في أعضاء</div>`;

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

  // Desktop header actions (add only — search & filter are in the screen)
  $("#pageActions").innerHTML = `
    <button id="addMemberBtn" class="bg-primary text-black font-headline font-bold uppercase tracking-widest text-sm px-5 py-2.5 rounded-xl hover:bg-white transition-colors active:scale-95 flex items-center gap-2">
      <span class="material-symbols-outlined text-[20px]">person_add</span> ADD MEMBER
    </button>`;
  $("#addMemberBtn").onclick = openMemberModal;
  $("#addSalaryBtn")?.addEventListener("click", openSalaryModal);
  $("#addTrainerBtn")?.addEventListener("click", () => openTrainerForm());
  $("#newTrainerBtn")?.addEventListener("click", () => openTrainerForm());
}

// Trainer cards — same visual language as member cards
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
        <span class="font-label text-xs tracking-widest shrink-0 px-2 py-0.5 rounded border font-bold ${(paid && !contractOver) ? "bg-primary/10 text-primary border-primary/30" : "bg-alert/10 text-alert border-alert/30"}">${(paid && !contractOver) ? "🟢 فعّال ACTIVE" : contractOver ? "⚫ انتهى العقد ENDED" : "⏰ موعد الراتب DUE"}</span>
      </div>
      <p class="font-body text-xs mt-1 ${(paid && !contractOver) ? "text-primary" : "text-alert"}">
        ${contractOver
          ? `📄 انتهى العقد بتاريخ ${fmt.date(t.contractEnd, currentLang())}`
          : st.active
            ? `🟢 الاشتراك فعّال — التجديد القادم: ${fmt.date(st.until, currentLang())}`
            : `🔴 انتهت باقة الراتب${st.until ? ` بتاريخ ${fmt.date(st.until, currentLang())}` : ""} — يتطلب تجديد`}
      </p>
      <p class="font-body text-[11px] text-muted mt-0.5" dir="ltr">${fmt.money(t.salary)}/mo</p>
      <div class="flex gap-2 mt-2 flex-wrap">
        <span class="px-2 py-0.5 rounded bg-surface-container-highest text-muted text-[10px] font-label tracking-wider uppercase border border-outline-variant">📅 بدأ: ${t.startedAt ? fmt.date(t.startedAt, currentLang()) : "—"}</span>
        ${t.contractEnd ? `<span class="px-2 py-0.5 rounded bg-surface-container-highest ${contractOver ? "text-alert border-alert/30" : "text-muted"} text-[10px] font-label tracking-wider uppercase border border-outline-variant">⏳ ينتهي: ${fmt.date(t.contractEnd, currentLang())}</span>` : ""}
        ${t.phone ? `<span class="px-2 py-0.5 rounded bg-surface-container-highest text-muted text-[10px] font-label tracking-wider uppercase border border-outline-variant" dir="ltr">📞 ${escapeHtml(t.phone)}</span>` : ""}
      </div>
    </div>
    <div class="shrink-0 flex flex-col gap-1">
      <button data-info-btn title="File / الملف" class="text-muted hover:text-primary transition-colors"><span class="material-symbols-outlined text-lg">receipt_long</span></button>
      <button data-edit-t="${t.id}" title="Edit / تعديل" class="text-muted hover:text-primary transition-colors"><span class="material-symbols-outlined text-lg">edit</span></button>
      <button data-del-t="${t.id}" title="Delete / حذف" class="text-muted hover:text-alert transition-colors"><span class="material-symbols-outlined text-lg">delete</span></button>
      <button data-pay="${t.id}" title="Renew / تجديد" class="${paid ? "hidden" : ""} bg-primary text-black rounded-xl p-1.5 hover:bg-white active:scale-90 transition-all"><span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1;">autorenew</span></button>
    </div>
  </div>`;
}

const TIER_LABEL = { regular: "REGULAR TIER", pro: "PRO TIER", half: "HALF PASS",
  elite: "ELITE TIER", standard: "STANDARD TIER", trial: "GUEST" };
// License tier labels (activation-code packages)
const LICENSE_TIER = {
  monthly: ["📅", "MONTHLY", "شهرية"],
  yearly:  ["🗓️", "YEARLY", "سنوية"],
  lifetime:["♾️", "LIFETIME", "دائمة"],
  standard:["🔑", "STANDARD", "عادية"],
  vip:     ["💎", "VIP", "مميزة"],
  guest:   ["👤", "GUEST", "زائر"],
};
const tierLabel = (tier) => {
  const m = LICENSE_TIER[tier];
  return m ? `${m[0]} ${m[1]} / ${m[2]}` : `${tier}`;
};
const FILTER_EMOJI = { active: "✅", expired: "⛔", trial: "🎁", frozen: "❄️", trainers: "👥" };

function memberAvatar(m, st) {
  if (m.photo) {
    return `<img class="w-14 h-14 rounded-full object-cover border ${st === "expired" ? "border-error/50 grayscale" : st === "trial" ? "border-frost-fixed" : "border-primary/50"}" src="${m.photo}" alt=""/>`;
  }
  return `<div class="w-14 h-14 rounded-full bg-surface-container-high border ${st === "expired" ? "border-error/50 grayscale" : st === "trial" ? "border-frost-fixed" : "border-primary/50"} flex items-center justify-center font-headline text-lg ${st === "trial" ? "text-frost-fixed" : st === "expired" ? "text-error" : "text-primary"}">${initials(m.name)}</div>`;
}

function memberCard(m) {
  const st = effStatus(m);
  const daysLeft = Math.ceil((m.expiresAt - Date.now()) / DAY);

  let statusLine;
  if (st === "expired") statusLine = `<p class="font-body text-xs text-error mt-0.5">EXPIRED - ${Math.abs(daysLeft)} DAYS</p>`;
  else if (st === "trial") statusLine = `<p class="font-body text-xs text-frost-fixed mt-0.5">TRIAL PASS - DAY ${daysLeft}</p>`;
  else if (st === "frozen") statusLine = `<p class="font-body text-xs text-muted mt-0.5">FROZEN / مجمد</p>`;
  else statusLine = `<p class="font-body text-xs text-muted mt-0.5">${TIER_LABEL[m.plan] || "MEMBER"}</p>`;

  const idColor = st === "expired" ? "text-error opacity-90" : "text-muted opacity-70";

  return `
  <div data-member="${m.id}" class="bg-surface cyber-border ${st === "expired" ? "border-s-2 !border-s-error" : ""} rounded-lg p-4 flex items-center gap-4 hover:bg-surface-hover transition-colors cursor-pointer group active:scale-[0.98]">
    <div class="relative shrink-0">
      ${memberAvatar(m, st)}
      <div class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface ${st === "expired" ? "bg-error shadow-neon-alert" : st === "trial" ? "bg-frost-fixed" : "bg-primary shadow-neon"}"></div>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex justify-between items-start">
        <h3 class="font-headline font-bold text-on-surface uppercase truncate">${escapeHtml(m.name)}</h3>
        <span class="font-label text-xs tracking-widest ${idColor}">ID: ${m.id.slice(-4)}</span>
      </div>
      ${statusLine}
      <div class="flex gap-2 mt-2 flex-wrap">
        ${m.tag ? `<span class="px-2 py-0.5 rounded bg-surface-container-highest text-muted text-[10px] font-label tracking-wider uppercase border border-outline-variant">${escapeHtml(m.tag)}</span>` : ""}
      </div>
    </div>
    <span class="material-symbols-outlined text-muted group-hover:text-primary transition-colors ltr:block rtl:hidden">chevron_right</span>
    <span class="material-symbols-outlined text-muted group-hover:text-primary transition-colors hidden rtl:block">chevron_left</span>
  </div>`;
}

function openMemberModal(id = null) {
  const t = i18n.t;
  const m = id ? store.get("members", id) : null;
  const prices = planPrices();
  const planOptions = PLANS.map((p) =>
    `<option value="${p.key}" ${m?.plan === p.key ? "selected" : ""}>${p.en} / ${p.ar} — $${prices[p.key]}</option>`).join("");
  const legacyOpt = m && !PLANS.some((p) => p.key === m.plan)
    ? `<option value="${m.plan}" selected>${m.plan}</option>` : "";

  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${m ? "✏️ " + t.editMember : "➕ " + t.addMember}</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">${m ? "تعديل بيانات العضو" : "إضافة عضو جديد"}</p>
    <form id="memberForm" class="flex flex-col gap-3">
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.memberName}</label>
        <input name="name" required class="dp-field mt-1" value="${m ? escapeHtml(m.name) : ""}" /></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.phone}</label>
          <input name="phone" dir="ltr" class="dp-field mt-1" value="${m ? escapeHtml(m.phone || "") : ""}" /></div>
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Tag / وسم</label>
          <input name="tag" class="dp-field mt-1" value="${m ? escapeHtml(m.tag || "") : ""}" placeholder="PT Active..." /></div>
      </div>
      <div class="grid ${m ? "grid-cols-2" : "grid-cols-[1fr_auto]"} gap-3 items-end">
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline flex justify-between items-center">
            <span>${t.plan}</span>
            <button type="button" id="editPricesBtn" title="Edit plan prices / تعديل أسعار الباقات" class="text-primary hover:text-white transition-colors normal-case">
              <span class="material-symbols-outlined text-[16px]">settings_suggest</span>
            </button></label>
          <select name="plan" class="dp-field mt-1">${planOptions}${legacyOpt}</select></div>
        ${m ? "" : `<div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Days / الأيام</label>
          <input name="days" type="number" min="1" max="1095" value="30" class="dp-field mt-1 w-24" /></div>`}
      </div>
      ${m && effStatus(m) !== "expired" ? `
      <div class="flex items-center justify-between bg-surface-container rounded-xl p-3">
        <div>
          <p class="text-[10px] uppercase tracking-widest text-muted font-headline">Subscription / الاشتراك</p>
          <p class="font-headline text-sm uppercase mt-0.5 ${m.status === "frozen" ? "text-frost-fixed" : "text-primary"}">
            ${m.status === "frozen"
              ? `❄️ Frozen / مجمد${m.remainingDays != null ? ` <span class="normal-case text-xs text-muted">— ${m.remainingDays} يوم متوقف</span>` : ""}`
              : "✅ Active / فعال"}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button type="button" data-edit-prices title="Edit plan prices / تعديل أسعار الباقات" class="px-4 py-2 rounded-xl border border-primary text-primary hover:bg-primary hover:text-black text-xs font-headline font-bold uppercase tracking-widest transition-all active:scale-95">
            🏷️ ${prices[m?.plan] != null ? "$" + prices[m.plan] : "Prices"}
          </button>
          <button type="button" data-toggle-freeze class="px-4 py-2 rounded-xl border text-xs font-headline font-bold uppercase tracking-widest transition-all active:scale-95 ${m.status === "frozen" ? "border-primary text-primary hover:bg-primary hover:text-black" : "border-frost-fixed text-frost-fixed hover:bg-frost-fixed hover:text-black"}">
            ${m.status === "frozen" ? "▶ Resume / استئناف" : "❄️ Freeze / تجميد"}
          </button>
        </div>
      </div>` : ""}
      ${m ? "" : `<div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Start Date / تاريخ البداية</label>
        <input name="startDate" type="date" value="${new Date().toLocaleDateString("en-CA")}" max="${new Date().toLocaleDateString("en-CA")}" class="dp-field mt-1" /></div>`}
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.paidAmount} ($)</label>
        <input name="paidAmount" type="number" min="0" step="0.5" value="${m ? m.paidAmount ?? 0 : prices[PLANS[0].key]}" class="dp-field mt-1" /></div>
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm pressable">${t.cancel}</button>
        <button type="submit" class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm neon-shadow pressable">${t.save}</button>
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
  // Inline price editor (gear icon + 🏷️ button both use this)
  const refreshPlanOptions = () => {
    const sel = $('select[name="plan"]', mod.el);
    if (!sel) return;
    const current = sel.value;
    const fresh = planPrices();
    sel.innerHTML = PLANS.map((p) =>
      `<option value="${p.key}" ${p.key === current ? "selected" : ""}>${p.en} / ${p.ar} — $${fresh[p.key]}</option>`).join("");
    // also refresh the 🏷️ price chip next to Freeze
    const chip = mod.el.querySelector("[data-edit-prices]");
    if (chip && m) {
      const v = fresh[current];
      chip.innerHTML = `🏷️ ${v != null ? "$" + v : "Prices"}`;
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
      showToast(`▶ Resumed — ${rem} days restored / تم الاستئناف`);
    } else {
      const rem = Math.max(0, Math.ceil((cur.expiresAt - Date.now()) / DAY));
      store.update("members", id, { status: "frozen", frozenAt: Date.now(), remainingDays: rem });
      showToast(`❄️ Frozen — ${rem} days paused / تم التجميد وعدم احتساب الأيام`);
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
    showToast(m ? "Saved / تم الحفظ" : "Member added / تمت إضافة العضو");
  });
}

function openMemberDetail(id) {
  const m = store.get("members", id);
  const t = i18n.t;
  const st = effStatus(m);
  const mod = openModal(`
    <div class="flex items-center gap-4 mb-6">
      <div class="w-16 h-16 rounded-full bg-surface-container-high border border-primary/50 flex items-center justify-center font-headline text-xl text-primary">${initials(m.name)}</div>
      <div>
        <h3 class="font-headline font-bold uppercase text-lg">${escapeHtml(m.name)}</h3>
        <p class="text-sm ${st === "expired" ? "text-error" : st === "trial" ? "text-frost-fixed" : "text-primary"} font-headline uppercase tracking-wide">${t.statuses[st]}</p>
        <p class="text-xs text-muted mt-0.5" dir="ltr">${escapeHtml(m.phone || "")}</p>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3 text-sm mb-6">
      <div class="bg-surface-container rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">${t.joinDate}</p><p class="font-headline">${fmt.date(m.joinDate)}</p></div>
      <div class="bg-surface-container rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">${t.expiresOn}</p><p class="font-headline ${st === "expired" ? "text-error" : ""}">${fmt.date(m.expiresAt)}</p></div>
      <div class="bg-surface-container rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">${t.plan}</p><p class="font-headline uppercase">${t.plans[m.plan] || m.plan}</p></div>
      <div class="bg-surface-container rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">${t.checkins}</p><p class="font-headline">${m.checkins || 0}</p></div>
    </div>
    <div class="flex gap-3">
      <button data-del class="flex-1 py-3 rounded-xl border border-alert/40 text-alert font-bold uppercase text-sm pressable" aria-label="Delete member">${t.delete}</button>
      <button data-edit class="flex-1 py-3 rounded-xl border border-outline-variant font-bold uppercase text-sm pressable" aria-label="Edit member">${t.edit}</button>
      <button data-renew class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">${t.renew}</button>
    </div>`);

  mod.el.querySelector("[data-edit]").onclick = () => { mod.close(); openMemberModal(id); };
  mod.el.querySelector("[data-del]").onclick = async () => {
    mod.close();
    const ok = await confirmDialog({
      titleEn: "Delete this member?",
      titleAr: "حذف هذا العضو؟ ⚠️ حركاته المالية ستبقى محفوظة في السجل ولا تُحذف",
      confirmText: "Delete",
      danger: true,
    });
    if (ok) { store.remove("members", id); showToast("Member deleted — finance kept / انحذف العضو وحُفظت أمواله بالسجل"); }
  };
  mod.el.querySelector("[data-renew]").onclick = () => { mod.close(); openRenewModal(id); };
}

// ---------- Plan prices editor ----------
function openPlanPrices(onSaved) {
  const t = i18n.t;
  const prices = planPrices();
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">💲 Plan Prices / أسعار الباقات</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">حدّد السعر الافتراضي لكل باقة — يُستخدم تلقائياً عند إضافة عضو</p>
    <form id="pricesForm" class="flex flex-col gap-3">
      ${PLANS.map((p) => `
        <div class="grid grid-cols-[1fr_120px] gap-3 items-end">
          <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline block mb-1">${p.en} / ${p.ar}</label></div>
          <div><input name="${p.key}" type="number" min="0" step="0.5" value="${prices[p.key] ?? 0}" class="dp-field" dir="ltr" /></div>
        </div>`).join("")}
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm pressable">${t.cancel}</button>
        <button type="submit" class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">${t.save}</button>
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
    showToast("Prices saved / تم حفظ الأسعار");
    onSaved && onSaved();
  });
}

function openRenewModal(id) {  const m = store.get("members", id);
  const t = i18n.t;
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${t.renew} — ${escapeHtml(m.name)}</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">تجديد اشتراك العضو</p>
    <form id="renewForm" class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Days / أيام</label>
          <input name="days" type="number" min="1" max="1095" value="30" class="dp-field mt-1" /></div>
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.amount} ($)</label>
          <input name="amount" type="number" min="0" step="0.5" value="0" class="dp-field mt-1" /></div>
      </div>
      <p class="text-[11px] text-muted font-headline uppercase tracking-widest">${t.renew} — Basis / أساس التجديد</p>
      <div class="flex flex-col gap-2">
        <button type="button" data-base="expiry" class="py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">${t.renew} — من تاريخ الانتهاء (From expiry)</button>
        <button type="button" data-base="today" class="py-3 rounded-xl border border-primary-fixed text-primary-fixed font-headline font-bold uppercase text-sm pressable">${t.renew} — من اليوم (From today)</button>
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
    showToast("Renewed / تم التجديد");
  });
}

/* ============================================================
   HARDWARE — simple repair tracker (same theme)
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
        <p class="arabic-sub text-muted text-sm" dir="rtl">حالة الأجهزة والتصليح</p>
      </div>
    </div>

    <!-- slim counters -->
    <div class="grid grid-cols-3 gap-3">
      <div class="bg-surface cyber-border rounded-lg p-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-muted font-headline">🔧 In Repair</p>
        <p class="font-display font-bold text-3xl text-alert tabular-nums mt-1">${pending.length}</p>
        <p class="arabic-sub text-[10px]" dir="rtl">قيد التصليح</p>
      </div>
      <div class="bg-surface cyber-border rounded-lg p-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-muted font-headline">✅ Repaired</p>
        <p class="font-display font-bold text-3xl text-primary tabular-nums mt-1">${done.length}</p>
        <p class="arabic-sub text-[10px]" dir="rtl">تم التصليح</p>
      </div>
      <div class="bg-surface cyber-border rounded-lg p-4 text-center">
        <p class="text-[10px] uppercase tracking-widest text-muted font-headline">💵 Total Invoices</p>
        <p class="font-display font-bold text-3xl text-frost-fixed tabular-nums mt-1" dir="ltr">${fmt.money(invoiced)}</p>
      </div>
    </div>

    <!-- page stats -->
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-surface cyber-border rounded-lg p-4 fade-up">
        <div class="text-[10px] uppercase tracking-widest text-muted mb-1">الأعضاء النشطون</div>
        <h2 id="memberCount" class="font-headline font-bold"></h2>
      </div>
      <div class="bg-surface cyber-border rounded-lg p-4 fade-up">
        <div class="text-[10px] uppercase tracking-widest text-muted mb-1">إجمالي الإيرادات</div>
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

store.subscribe("members", () => rerender());

function openDeviceModal() {
  const t = i18n.t;
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${t.addDevice}</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">إضافة جهاز للتصليح</p>
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
        <p class="text-sm ${isDone ? "text-primary" : "text-alert"}">${isDone ? "Repaired / تم التصليح" : "Under repair / قيد التصليح"}</p>
      </div>
      <span class="material-symbols-outlined ${isDone ? "text-primary" : "text-alert"} text-3xl">${isDone ? "check_circle" : "build"}</span>
    </div>
    <div class="grid grid-cols-2 gap-3 text-sm mb-5">
      <div class="bg-surface-container rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">Repair price / سعر التصليح</p><p class="font-headline" dir="ltr">${fmt.money(d.cost)}</p></div>
      <div class="bg-surface-container rounded-xl p-3"><p class="text-[10px] uppercase tracking-widest text-muted mb-1">${isDone ? "Deducted / خُصمت من الأرباح" : "Waiting / بالانتظار"}</p><p class="font-headline">${isDone ? "✓ Ledger" : "—"}</p></div>
    </div>
    <div class="flex gap-3">
      <button data-del class="flex-1 py-3 rounded-xl border border-alert/40 text-alert font-bold uppercase text-sm pressable">${t.delete}</button>
      ${!isDone ? `<button data-fixed class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm neon-shadow pressable" aria-label="Mark as repaired">✅ DONE تم</button>`
                : `<button data-edit class="flex-1 py-3 rounded-xl border border-outline-variant font-bold uppercase text-sm pressable" aria-label="Edit device">${t.edit}</button>`}
    </div>`);
  const editBtn = mod.el.querySelector("[data-edit]");
  if (editBtn) editBtn.onclick = () => {
    mod.close();
    const m2 = openModal(`<h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-5">${t.edit} — ${escapeHtml(d.name)}</h3>${deviceFormHtml(d)}`);
    readDeviceForm(m2, d, id);
  };
  const fixedBtn = mod.el.querySelector("[data-fixed]");
  if (fixedBtn) fixedBtn.onclick = () => { mod.close(); markRepaired(d); };
  mod.el.querySelector("[data-del]").onclick = async () => {
    mod.close();
    const ok = await confirmDialog({ titleEn: t.confirmDelete, titleAr: "سيتم حذف الجهاز نهائياً", confirmText: "Delete", danger: true });
    if (ok) { store.remove("devices", id); showToast("Deleted / تم الحذف"); }
  };
}

/* ============================================================
   LEDGER  (docs/design/ledger_v2) — month-filtered finance
   ============================================================ */
let ledgerOffset = 0;

function viewLedger() {
  const AR_MONTHS = ["كانون الثاني","شباط","آذار","نيسان","أيار","حزيران","تموز","آب","أيلول","تشرين الأول","تشرين الثاني","كانون الأول"];
  const EN_MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const arDigits = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);

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
  const monthLabel = `${mNum} · ${EN_MONTHS[base.getMonth()]} ${base.getFullYear()}`;
  const monthLabelAr = `${AR_MONTHS[base.getMonth()]} ${arDigits(base.getFullYear())}`;

  // Quick-jump options: last 12 months (numbered)
  let jumpOptions = "";
  for (let o = 0; o >= -11; o--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + o);
    const sel = o === (ledgerOffset || 0) ? "selected" : "";
    jumpOptions += `<option value="${o}" ${sel}>${d.getMonth() + 1} · ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}</option>`;
  }

  // ---- Trainer salary reminders (current real month) ----
  const trainers = store.all("trainers");
  const nowM = new Date(); nowM.setDate(1); nowM.setHours(0, 0, 0, 0);
  const due = trainers.filter((t) => !trainerStatus(t).active && !trainerStatus(t).ended);
  const dueTotal = due.reduce((s, t) => s + Number(t.salary || 0), 0);
  const dueBanner = due.length ? `
    <div class="bg-alert/10 border border-alert/40 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="font-headline text-sm text-alert uppercase tracking-wide">⏰ Salaries due this month / رواتب مستحقة</p>
        <p class="text-xs text-muted mt-1 truncate">${due.map((t) => `${t.name} ($${t.salary})`).join(" · ")} — الإجمالي: ${fmt.money(dueTotal)}</p>
      </div>
      <button id="payAllBtn" class="shrink-0 bg-primary text-black font-headline font-bold uppercase tracking-widest text-xs px-4 py-2.5 rounded-xl hover:bg-white active:scale-95 transition-all">🔁 Renew all / تجديد الكل</button>
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
        <span>📈 Revenue</span><span dir="rtl" class="font-arabic">الإيرادات</span>
      </p>
      <p class="font-display font-bold text-3xl md:text-4xl tabular-nums text-primary mt-2" dir="ltr">${fmt.money(revenue)}</p>
    </div>
    <div class="bg-surface cyber-border rounded-lg p-4 md:p-5 relative overflow-hidden group hover:bg-surface-hover transition-colors">
      <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
        <span>💸 Expenses</span><span dir="rtl" class="font-arabic">المصروفات</span>
      </p>
      <p class="font-display font-bold text-3xl md:text-4xl tabular-nums text-alert mt-2" dir="ltr">${fmt.money(expenses)}</p>
    </div>
    <div class="bg-surface cyber-border rounded-lg p-4 md:p-5 relative overflow-hidden group hover:bg-surface-hover transition-colors">
      <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
        <span>🏆 Profit</span><span dir="rtl" class="font-arabic">صافي الربح</span>
      </p>
      <p class="font-display font-bold text-3xl md:text-4xl tabular-nums ${profit >= 0 ? "text-white" : "text-alert"} mt-2" dir="ltr">${fmt.money(profit)}</p>
    </div>
  </div>

  <!-- Quick actions -->
  <div class="flex flex-wrap gap-3">
    <button id="addTxBtn" class="flex-1 min-w-[140px] bg-primary text-black font-headline font-bold uppercase tracking-widest text-sm px-5 py-3 rounded-xl hover:bg-white active:scale-95 transition-all flex items-center justify-center gap-2">
      <span class="material-symbols-outlined text-[20px]" style="font-variation-settings:'FILL' 1;">add_card</span> ➕ NEW / <span class="font-arabic normal-case">حركة</span>
    </button>
    <button id="pricesBtn" title="Plan prices / أسعار الباقات" class="bg-surface-container-high border border-outline-variant text-muted hover:text-primary hover:border-primary px-4 rounded-xl transition-all active:scale-95">
      <span class="material-symbols-outlined">sell</span>
    </button>
    <button id="reportsBtn" title="Monthly reports" class="bg-surface-container-high border border-outline-variant text-muted hover:text-primary hover:border-primary px-4 rounded-xl transition-all active:scale-95">
      <span class="material-symbols-outlined">insights</span>
    </button>
  </div>

  <!-- Live Transaction Feed -->
  <section class="flex flex-col gap-2">
    <h3 class="font-headline font-bold uppercase tracking-tight text-sm px-1">🧾 Live Ledger <br/><span class="arabic-sub text-muted inline-block">حركات الشهر المحدد — كل داخلة وخارجة</span></h3>
    <div class="glass-card rounded-lg flex flex-col divide-y divide-outline-variant/50">
      ${ledger.length ? ledger.slice(0, 15).map(txRow).join("") : `<p class="text-center text-muted py-8 text-sm">📭 ما في حركات بهالشهر / No transactions this month</p>`}
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
    showToast(`✅ Paid ${due.length} salaries — ${fmt.money(dueTotal)} / تم دفع الرواتب`);
  });
}
// ---- Trainers: pay / CRUD / monthly reminders ----
function payTrainer(t, { silent = false } = {}) {
  if (t.contractEnd && Date.now() > t.contractEnd) {
    showToast("⛔ Contract ended — extend it first via Edit / انتهى عقده، عدّل تاريخ النهاية أولاً", "err");
    return;
  }
  const amount = Number(t.salary || 0);
  let ledgerId = null;
  if (amount > 0) {
    const tx = store.insert("ledger", {
      type: "expense",
      amount,
      description: `Salary: ${t.name} / راتب: ${t.name}`,
      category: "salary",
      trainerId: t.id,
      date: Date.now(),
    });
    ledgerId = tx.id;
  }
  store.update("trainers", t.id, { lastPaidAt: Date.now() });
  if (!silent) showToast(`🔁 Renewed ${t.name} — ${fmt.money(amount)} deducted to Ledger / تم تجديد الراتب وخصمه بالمالية`);
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
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg">👤 ${escapeHtml(t.name)}</h3>
      <span class="text-primary font-headline font-bold" dir="ltr">${fmt.money(t.salary)}/mo</span>
    </div>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">الملف الكامل وسجل الدفعات</p>

    <div class="grid grid-cols-2 gap-3 text-sm mb-6">
      <div class="bg-surface-container rounded-xl p-3">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Started / بدأ العمل</p>
        <p class="font-headline">${t.startedAt ? fmt.date(t.startedAt, currentLang()) : "—"}</p>
      </div>
      <div class="bg-surface-container rounded-xl p-3">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Last renewed / آخر تجديد</p>
        <p class="font-headline">${t.lastPaidAt ? fmt.date(t.lastPaidAt, currentLang()) : "لم يُجدد بعد"}</p>
      </div>
      ${t.contractEnd ? `
      <div class="bg-surface-container rounded-xl p-3 col-span-2">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Contract end / انتهاء العقد</p>
        <p class="font-headline ${(Date.now() > t.contractEnd) ? "text-alert" : ""}">${fmt.date(t.contractEnd, currentLang())}${(Date.now() > t.contractEnd) ? " — منتهي" : ""}</p>
      </div>` : ""}
      <div class="bg-surface-container rounded-xl p-3">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Total paid / إجمالي المدفوع</p>
        <p class="font-headline text-alert" dir="ltr">${fmt.money(totalPaid)}</p>
      </div>
    </div>

    <h4 class="font-headline font-bold uppercase tracking-tight text-sm mb-2">🧾 Payment history / سجل الدفعات</h4>
    <div class="glass-card rounded-lg flex flex-col divide-y divide-outline-variant/50 max-h-[240px] overflow-y-auto">
      ${payments.length ? payments.map((p) => `
        <div class="p-3 flex items-center justify-between text-sm">
          <div class="flex items-center gap-2 min-w-0">
            <span class="material-symbols-outlined text-alert text-[18px]">south</span>
            <div class="min-w-0">
              <p class="truncate">دفعة شهرية / Monthly salary</p>
              <p class="text-xs text-muted">${fmt.date(p.date, currentLang())}${p.trainerId ? "" : " (legacy)"}</p>
            </div>
          </div>
          <p class="font-headline font-bold text-alert tabular-nums" dir="ltr">-${fmt.money(p.amount)}</p>
        </div>`).join("") : `<p class="text-center text-muted py-5 text-sm">📭 لا توجد دفعات مسجلة بعد</p>`}
    </div>

    ${t.phone ? `<p class="text-xs text-muted mt-4" dir="ltr">📞 ${escapeHtml(t.phone)}</p>` : ""}`);
}

function openTrainerForm(id = null) {
  const t = i18n.t;
  const cur = id ? store.get("trainers", id) : null;
  const iso = (ts) => ts ? new Date(ts).toLocaleDateString("en-CA") : new Date().toLocaleDateString("en-CA");
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${cur ? "✏️ Edit Trainer / تعديل مدرب" : "➕ Add Trainer / إضافة مدرب"}</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">${cur ? "تحديث بيانات المدرب" : "رح يذكّرك النظام كل شهر بدفع راتبه"}</p>
    <form id="trainerForm" class="flex flex-col gap-3">
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Name / الاسم</label>
        <input name="name" required maxlength="40" value="${cur ? escapeHtml(cur.name) : ""}" class="dp-field mt-1" placeholder="Coach Ahmad..." /></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Monthly salary ($)</label>
          <input name="salary" type="number" min="0" step="10" value="${cur ? cur.salary : 300}" class="dp-field mt-1" dir="ltr"/></div>
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Started / بدأ العمل</label>
          <input name="startedAt" type="date" value="${iso(cur?.startedAt)}" max="${new Date().toLocaleDateString("en-CA")}" class="dp-field mt-1"/></div>
      </div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Contract end / تاريخ انتهاء العقد (شهر من اليوم — قابل للتعديل)</label>
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
    if (!name) { showToast("Invalid name / اسم غير صالح", "err"); return; }
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
      showToast("Saved / تم الحفظ");
    } else {
      store.insert("trainers", {
        ...data,
        startedAt: sd ? new Date(`${sd}T00:00:00`).getTime() : Date.now(),
        lastPaidAt: null,
      });
      mod.close();
      showToast("👥 Trainer added — monthly reminder active / انضاف المدرب والتذكير مفعّل");
    }
  });
}

// Trainer salary quick-expense
function openSalaryModal() {
  const t = i18n.t;
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">💼 Trainer Salary / راتب مدرب</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">تسجيل راتب كأحد المصروفات</p>
    <form id="salaryForm" class="flex flex-col gap-3">
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Trainer name / اسم المدرب</label>
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
      description: `Salary: ${name} / راتب: ${name}`,
      category: "salary",
      date: Date.now(),
    });
    mod.close();
    showToast("Salary logged / تم تسجيل الراتب");
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
        <p class="font-body text-xs text-muted">TXN-${String(l.id).slice(-4)} • ${fmt.timeAgo(l.date, currentLang())}</p>
      </div>
    </div>
    <p class="font-headline text-lg tabular-nums shrink-0 ${amountCls}" dir="ltr">${isIn ? "+" : "-"}$${nf.format(Math.abs(l.amount))}</p>
  </div>`;
}

function openTxModal() {
  const t = i18n.t;
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${t.addTransaction}</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">تسجيل إيراد أو مصروف</p>
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
    showToast("Saved / تم الحفظ");
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
  const PLAN_BI = { regular: ["Regular", "عادي"], pro: ["Pro", "اخترافي"], half: ["Half", "نص"] };
  const planCounts = {};
  members.forEach((m) => { if (effStatus(m) !== "expired") planCounts[m.plan] = (planCounts[m.plan] || 0) + 1; });
  const totalPlans = Object.values(planCounts).reduce((a, b) => a + b, 0) || 1;
  const planOrder = ["regular", "pro", "half"];
  const dist = planOrder.filter((p) => planCounts[p]).slice(0, 3)
    .map((p, i) => ({ p, pct: Math.round((planCounts[p] / totalPlans) * 100), cls: ["bg-primary", "bg-accent", "bg-muted"][i], txtCls: ["text-primary", "text-accent", "text-muted"][i] }));

  const MONTHS_EN = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const arDigits = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);

  screen.innerHTML = `
  <!-- Page Header -->
  <div class="space-y-1">
    <h2 class="font-headline text-2xl font-bold uppercase tracking-tight text-on-surface">📊 Monthly Reports</h2>
    <p class="font-arabic text-sm text-muted">التقارير الشهرية</p>
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
          <p class="font-label text-[10px] uppercase tracking-widest text-muted">💰 Total Revenue</p>
          <p class="font-arabic text-[10px] text-muted leading-none">إجمالي الإيرادات</p>
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
        <p class="font-label text-[10px] uppercase tracking-widest text-muted">📈 Net Growth</p>
        <p class="font-arabic text-[10px] text-muted leading-none">صافي النمو</p>
      </div>
      <div class="mt-4">
        <span class="font-display text-3xl font-bold text-accent tabular-nums neon-text-pink">${netGrowth >= 0 ? "+" : ""}${netGrowth}</span>
      </div>
      <div class="mt-1 text-xs text-muted font-headline">New Members</div>
    </div>
    <div class="bg-surface cyber-border rounded-lg p-4 relative overflow-hidden active:scale-[0.98] transition-transform">
      <div class="mb-2">
        <p class="font-label text-[10px] uppercase tracking-widest text-muted">🔁 Retention</p>
        <p class="font-arabic text-[10px] text-muted leading-none">معدل الاحتفاظ</p>
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
        <p class="font-label text-xs uppercase tracking-widest text-on-surface">📈 Revenue Trend</p>
        <p class="font-arabic text-[10px] text-muted">اتجاه الإيرادات</p>
      </div>
      <select class="bg-surface-container border-none text-xs text-muted rounded-md py-1 pl-2 pr-6 focus:ring-1 focus:ring-primary">
        <option>Daily / يومي</option><option>Weekly / أسبوعي</option>
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
      <p class="font-label text-xs uppercase tracking-widest text-on-surface">🥧 Plan Distribution</p>
      <p class="font-arabic text-[10px] text-muted">توزيع الخطط</p>
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
      <span>📄 Export PDF</span>
      <span class="font-arabic text-[10px] mt-0.5 opacity-80 normal-case">تصدير PDF</span>
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
        <span class="font-arabic text-muted text-xs mt-0.5">القائد - المناوبة ألفا</span>
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
            <h3 class="font-headline text-lg font-bold uppercase tracking-tight text-white">🔐 Account Security</h3>
            <p class="font-arabic text-muted text-sm">أمان الحساب</p>
          </div>
          <span class="material-symbols-outlined text-muted">security</span>
        </div>
        <div class="space-y-4">
          <div class="flex items-center justify-between group cursor-pointer" id="secChangePw">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Website Password / <span class="font-arabic normal-case">كلمة سر الموقع</span></p>
              <p class="text-muted text-xs mt-1 font-headline">Change your login password / تغيير كلمة سر الدخول</p>
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
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">☁️ Cloud Sync / <span class="font-arabic normal-case">مزامنة سحابية</span></p>
              <p class="text-muted text-xs mt-1 font-headline">Backup &amp; sync now / رفع نسخة الآن</p>
            </div>
            <button class="text-primary text-sm font-label uppercase tracking-widest group-hover:underline">Sync</button>
          </div>
          <div class="h-px bg-outline-variant w-full"></div>
          <div class="flex items-center justify-between group cursor-pointer" id="secExport">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Export Backup / <span class="font-arabic normal-case">تصدير نسخة</span></p>
              <p class="text-muted text-xs mt-1 font-headline">Download facility data JSON</p>
            </div>
            <button class="text-primary text-sm font-label uppercase tracking-widest group-hover:underline">Export</button>
          </div>
          <div class="h-px bg-outline-variant w-full"></div>
          <div class="flex items-center justify-between group cursor-pointer" id="secReset">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Reset Data</p>
              <p class="text-muted text-xs mt-1 font-headline">Restore demo dataset / بيانات تجريبية</p>
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
            <h3 class="font-headline text-lg font-bold uppercase tracking-tight text-white">🎛️ App Preferences</h3>
            <p class="font-arabic text-muted text-sm">تفضيلات التطبيق</p>
          </div>
          <span class="material-symbols-outlined text-muted">tune</span>
        </div>
        <div class="space-y-6">
          <div class="flex items-center justify-between group cursor-pointer" id="planPricesRow">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Plan Prices / <span class="font-arabic normal-case">أسعار الباقات</span></p>
              <p class="text-muted text-xs mt-1 font-headline">Default price per plan</p>
            </div>
            <button class="text-primary text-sm font-label uppercase tracking-widest group-hover:underline">Edit</button>
          </div>
          <div class="h-px bg-outline-variant w-full"></div>
          <div class="flex items-center justify-between">
            <div>
              <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Language / اللغة</p>
              <p class="text-muted text-xs mt-1 font-headline">English (Default)</p>
            </div>
            <div class="bg-surface-container-highest rounded-full p-1 flex">
              <button data-lang="en" class="lang-btn px-4 py-1.5 rounded-full font-label text-[10px] tracking-widest uppercase transition-colors">ENG</button>
              <button data-lang="ar" class="lang-btn px-4 py-1.5 rounded-full font-arabic text-sm hover:text-white transition-colors">عربي</button>
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
              <h3 class="font-headline text-lg font-bold uppercase tracking-tight text-white">📜 System License</h3>
              <p class="font-arabic text-muted text-sm">ترخيص النظام</p>
            </div>
            <span class="material-symbols-outlined text-muted">verified_user</span>
          </div>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">License Key</p>
                <p class="font-arabic text-muted text-[10px] mt-0.5">مفتاح الترخيص</p>
                <p class="text-muted font-headline text-xs mt-1" dir="ltr">DP-${escapeHtml(lic.code)}</p>
              </div>
              <button id="copyKey" class="text-primary text-sm font-label uppercase tracking-widest hover:underline">Copy</button>
            </div>
            <div class="h-px bg-outline-variant w-full"></div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Registered to / <span class="font-arabic normal-case">المسجّل باسم</span></p>
                <p class="text-primary font-headline text-sm mt-1">${escapeHtml(lic.owner || "—")}</p>
              </div>
              <span class="material-symbols-outlined text-primary text-lg">badge</span>
            </div>
            <div class="h-px bg-outline-variant w-full"></div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Tier / <span class="font-arabic normal-case">الباقة</span></p>
                <p class="text-primary font-headline text-sm mt-1">${tierLabel(lic.tier)}</p>
              </div>
              <span class="material-symbols-outlined text-primary text-lg">workspace_premium</span>
            </div>
            <div class="h-px bg-outline-variant w-full"></div>
            <div class="flex items-center justify-between">
              <div>
                <p class="font-body text-sm font-medium text-on-surface uppercase tracking-wider">Remaining Time</p>
                <p class="font-arabic text-muted text-[10px] mt-0.5">المدة المتبقية</p>
                <p class="text-primary text-xs mt-1 font-bold tracking-wider uppercase font-headline">${license.daysLeft() === Infinity ? "♾️ دائم / LIFETIME" : license.daysLeft() + " Days / يومًا"}</p>
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
                  <h3 class="font-headline text-sm font-bold uppercase tracking-tight text-primary">👨‍💻 Team Identity</h3>
                  <p class="font-arabic text-muted text-[10px]">هوية الفريق</p>
                </div>
                <span class="material-symbols-outlined text-primary text-sm">hub</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-surface-container-highest border border-primary/30 flex items-center justify-center neon-shadow">
                  <span class="material-symbols-outlined text-primary text-xs">terminal</span>
                </div>
                <div>
                  <p class="font-headline text-lg font-bold tracking-tighter text-on-surface uppercase">hitik</p>
                  <p class="text-muted text-[10px] font-body tracking-wider">Built by hitik / <span class="font-arabic">صُنع بواسطة hitik</span></p>
                </div>
              </div>
            </div>
            <div class="mb-4 pb-4 border-b border-outline-variant">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <h3 class="font-headline text-sm font-bold uppercase tracking-tight text-primary">📞 Team Contact</h3>
                  <p class="font-arabic text-muted text-[10px]">جهة اتصال الفريق</p>
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
                <h3 class="font-headline text-sm font-bold uppercase tracking-tight text-muted">🛠️ System Build</h3>
              </div>
              <span class="material-symbols-outlined text-primary text-sm">memory</span>
            </div>
            <p class="text-center text-[10px] text-muted tracking-widest uppercase font-headline mt-4">DIGITAL PULSE v1.0 · CYBER ATHLETIC EDITION</p>
          </div>

          <div class="flex flex-col gap-4 mt-4">
            <button id="exportBtn" class="w-full border border-primary text-primary font-headline uppercase font-bold tracking-widest text-lg py-4 rounded-lg flex flex-col items-center justify-center hover:bg-primary/10 transition-all active:scale-95">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined">download</span>
                <span>EXPORT DATA</span>
              </div>
              <span class="font-arabic text-xs mt-1 opacity-70 normal-case">تصدير البيانات</span>
            </button>
            <button id="logoutBtn" class="w-full bg-alert text-white font-headline uppercase font-bold tracking-widest text-lg py-4 rounded-lg flex flex-col items-center justify-center hover:bg-[#e62e5c] transition-all active:scale-95 alert-glow border border-alert">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined">logout</span>
                <span>LOGOUT</span>
              </div>
              <span class="font-arabic text-xs mt-1 opacity-90 normal-case">تسجيل الخروج</span>
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
    try { await navigator.clipboard.writeText(`DP-${lic.code}`); showToast("Copied / تم النسخ"); }
    catch { showToast("Copy failed / فشل النسخ", "err"); }
  };
  $("#hapticToggle")?.addEventListener("change", (e) =>
    localStorage.setItem("dp_haptic", e.target.checked ? "1" : "0"));
  $("#secChangePw").onclick = openChangePassword;
  $("#secRestore").onclick = () => $("#importFile").click();
  $("#secCloudSync").onclick = cloudSyncNow;
  $("#secExport").onclick = exportData;
  $("#importFile").addEventListener("change", importData);
  $("#secReset").onclick = async () => {
    const ok = await confirmDialog({ titleEn: "Reset EVERYTHING to factory?", titleAr: "إعادة تعيين كل شيء بالكامل للمصنع؟", confirmText: "Reset", danger: true });
    if (!ok) return;
    try { store.stopSync && store.stopSync(); } catch {}
    // Clear all app data - robust clearing
    Object.keys(localStorage).forEach(k => { if (k.startsWith("dp_")) localStorage.removeItem(k); });
    sessionStorage.clear();
    store.resetAll();
    // Force reload to login screen
    showToast("Full reset done / تمت إعادة كل شيء");
    setTimeout(() => { location.reload(); }, 300);
  };
  $("#exportBtn").onclick = exportData;
  $("#logoutBtn").onclick = deactivateLicense;
}

// ---------- Change website password ----------
function openChangePassword() {
  const lic = license.get();
  if (!lic || !lic.code) { showToast("No license found / لا يوجد ترخيص", "err"); return; }
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">🔑 Change Website Password</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">تغيير كلمة سر حسابك — أكتب الحالية ثم الجديدة</p>
    <form id="chpwForm" class="flex flex-col gap-3">
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Current / الحالية</label>
        <input name="cur" type="password" required class="dp-field mt-1" dir="ltr"/></div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">New / الجديدة (4+)</label>
        <input name="n1" type="password" required minlength="4" class="dp-field mt-1" dir="ltr"/></div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Repeat / تأكيد الجديدة</label>
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
    if (fd.get("n1") !== fd.get("n2")) { msgEl.textContent = "New passwords don't match / الجديدة غير متطابقتين"; return; }
    try {
      const res = await codesDbChange(lic.code, fd.get("cur"), fd.get("n1"));
      if (!res.ok) {
        const errors = {
          WRONG_PASSWORD: "Current password is wrong / الحالية خاطئة",
          WEAK_PASSWORD: "Weak password (min 4) / كلمة سر ضعيفة",
          NO_PASSWORD: "No password set yet / لا توجد كلمة سر بعد",
        };
        msgEl.textContent = errors[res.error] || "Failed / فشل";
        return;
      }
      mod.close();
      showToast("🔐 Password changed / تم تغيير كلمة السر");
    } catch (err) {
      msgEl.textContent = "Connection error / خطأ بالاتصال";
    }
  });
}

async function codesDbChange(code, cur, next) {
  const { codesDb } = await import("./db.js");
  return codesDb.changeClientPassword(code, cur, next);
}

async function cloudSyncNow() {
  const L = license.get();
  if (!L || !L.data_enabled) { showToast("Cloud sync disabled for this code / السحابة معطّلة لهذا الكود", "err"); return; }
  showToast("Syncing… / جارٍ المزامنة…");
  try { await store.syncNow(); showToast("☁️ Synced / تمت المزامنة"); }
  catch { showToast("Sync failed / فشلت المزامنة", "err"); }
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
  showToast("Backup downloaded / تم تنزيل النسخة الاحتياطية");
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      store.importAll(JSON.parse(ev.target.result));
      showToast("Imported successfully / تم الاستيراد بنجاح");
    } catch {
      showToast("Invalid backup file / ملف غير صالح", "err");
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
            <p class="font-bold text-primary truncate" style="max-width:200px;direction:ltr">${escapeHtml(c.code || "—")}</p>
            <p class="text-sm text-muted direction:rtl">${escapeHtml(c.owner || "—")}</p>
            <p class="text-xs text-muted">${c.used ? "Used" : "Available"}</p>
          </div>`).join("") : `<p class="text-center text-muted py-8">لا توجد أكواد بعد / No codes yet</p>`}
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
            <th class="p-4 font-label tracking-widest text-muted uppercase">كود / Code</th>
            <th class="p-4 font-label tracking-widest text-muted uppercase">الباقية / Tier</th>
            <th class="p-4 font-label tracking-widest text-muted uppercase">المالك / Owner</th>
            <th class="p-4 font-label tracking-widest text-muted uppercase">الحالة / Status</th>
          </tr>
        </thead>
        <tbody>
          ${codes.length ? codes.map(c => `
            <tr class="border-b border-outline-variant/50">
              <td class="p-4 font-bold truncate" style="max-width:200px;direction:ltr">${escapeHtml(c.code || "—")}</td>
              <td class="p-4">${escapeHtml(c.tier || "—")}</td>
              <td class="p-4">${escapeHtml(c.owner || "—")}</td>
              <td class="p-4 ${c.used ? "text-alert" : "text-primary"}">
                ${c.used ? "🟡 Used" : "🟢 Available"}
              </td>
            </tr>`).join("") : `<tr><td class="p-12 text-center text-muted">لا توجد أكواد</td></tr>`}
        </tbody>
      </table>
    </div>`;
  showModal(html);
}

function showModal(html) {
  const mod = openModal(`
    <div class="p-6">
      <button class="absolute top-2 right-2 text-muted hover:text-primary transition-colors" onclick="this.closest('.modal').remove()">✕</button>
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
      showToast("Code added / تم إضافة الكود");
      mod.close();
    } catch (err) {
      showToast(err.message || "Error", "err");
    }
  });
}

// ---------- Boot ----------
show("dashboard");
