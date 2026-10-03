// ============================================================
// Dashboard Screen
// ============================================================
import { store } from "../store.js";
import { license } from "../license.js";
import { i18n, currentLang } from "../i18n.js";
import { showToast, openModal, confirmDialog, fmt, initials, escapeHtml } from "../ui.js";
import { sanitizeName, sanitizeAmount, sanitizePhone, validatePassword } from "../validate.js";
import { appConfig } from "../config.js";
import { DAY_MS, TIER_LABEL, LICENSE_TIER, FILTER_EMOJI } from "../constants.js";
import { syncExpiryNotifications, effStatus, effectiveLicense, gymName, applyGymName, waDigits, waReminderLink, waWinbackLink } from "../components/notifications.js";
import { drawCheckinsChart } from "../components/charts.js";
import { openMemberModal, openMemberDetail, openRenewModal, openTrainerForm, openTrainerDetails, openSalaryModal, openTxModal, openPlanPrices, openGymNameModal, printMemberCard, printMonthlyReport, exportCSVs, downloadCSV, tierLabel } from "../components/modals.js";
import { nf } from "../app-core.js";

const DAY = DAY_MS;

export function viewDashboard() {
  const s = store.stats();
  const licInfo = effectiveLicense();
  const lic = licInfo.lic;

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

  // Members whose expiry lands within the next 7 days + those who lapsed in
  // the last 7 — the owner's daily follow-up list. Each row jumps straight
  // into a WhatsApp message. The full count feeds the stat card.
  const expiringAll = store.all("members")
    .filter((m) => { const left = m.expiresAt - Date.now(); return left > 0 && left <= 7 * DAY; })
    .sort((a, b) => a.expiresAt - b.expiresAt);
  const expiring = expiringAll.slice(0, 6);
  const winback = store.all("members")
    .filter((m) => { const left = m.expiresAt - Date.now(); return left <= 0 && left >= -7 * DAY; })
    .sort((a, b) => b.expiresAt - a.expiresAt)
    .slice(0, 6);
  syncExpiryNotifications();

  const screen = document.getElementById("screen");
  screen.innerHTML = `
  <!-- Sync Status Bar -->
  <div id="syncStatusBar" class="mb-4 p-3 bg-surface border border-outline-variant rounded-lg flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <span id="syncStatusIcon" class="material-symbols-outlined text-2xl">cloud_sync</span>
      <div>
        <p id="syncStatusText" class="font-headline text-sm font-bold uppercase tracking-wider">✅ Synced</p>
        <p id="syncStatusDetail" class="text-xs text-muted">All data up to date</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <span id="syncPendingCount" class="px-2 py-1 bg-primary/20 text-primary text-xs font-bold rounded-full hidden">0 pending</span>
      <button id="syncNowBtn" class="px-3 py-1.5 bg-primary text-black text-xs font-bold uppercase rounded-xl hover:bg-white active:scale-95 transition-all flex items-center gap-1" style="display:none;">
        <span class="material-symbols-outlined text-[16px]">sync</span> Sync
      </button>
    </div>
  </div>

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
    <!-- Expiring Soon counter -->
    <div class="stat-card cursor-pointer bg-surface border border-outline-variant p-4 h-[130px] flex flex-col justify-between relative overflow-hidden group hover:bg-surface-hover transition-colors" id="expiringSoonCard" onclick="document.getElementById('expiringSoon').scrollIntoView({behavior:'smooth'})">
      <div class="flex items-start justify-between">
        <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
          <span>⌛ Expiring ≤ 7D</span><span dir="rtl" class="font-arabic">أوشك على الانتهاء</span>
        </p>
        <span class="material-symbols-outlined text-frost opacity-60">hourglass_top</span>
      </div>
      <div class="flex items-end justify-between">
        <p class="font-display font-bold text-5xl tabular-nums text-frost mt-2">${expiringAll.length}</p>
        <span class="material-symbols-outlined text-frost opacity-20 text-4xl absolute -bottom-2 -right-2 group-hover:opacity-40 transition-opacity">notifications_active</span>
      </div>
    </div>
    <!-- Expired & not renewed — the ALL-TIME win-back pool (not just this week) -->
    <div class="stat-card cursor-pointer bg-alert/10 border border-alert/40 p-4 h-[130px] flex flex-col justify-between relative overflow-hidden group hover:bg-alert/15 transition-colors" id="expiredPoolCard" onclick="document.getElementById('expiringSoon').scrollIntoView({behavior:'smooth'})">
      <div class="flex items-start justify-between">
        <p class="font-body font-semibold text-xs text-alert uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
          <span>🔴 Expired Total</span><span dir="rtl" class="font-arabic">انتهى وما جددش</span>
        </p>
        <span class="material-symbols-outlined text-alert opacity-60">heart_broken</span>
      </div>
      <div class="flex items-end justify-between">
        <p class="font-display font-bold text-5xl tabular-nums text-alert mt-2">${nf.format(s.totalExpired)}</p>
        <span class="material-symbols-outlined text-alert opacity-20 text-4xl absolute -bottom-2 -right-2 group-hover:opacity-40 transition-opacity">person_off</span>
      </div>
    </div>
    <!-- Total Profit -->
    <div class="stat-card cursor-pointer bg-surface border border-outline-variant p-4 h-[100px] flex flex-col justify-between hover:bg-surface-hover transition-colors">
      <p class="font-body font-semibold text-xs text-muted uppercase tracking-[1px] leading-tight flex flex-col gap-0.5">
        <span>💰 Total Profit</span><span dir="rtl" class="font-arabic">اجمالي الارباح</span>
      </p>
      <p class="font-display font-bold text-3xl tabular-nums text-muted mt-1" dir="ltr">${fmt.money(Math.max(0, s.totalRevenue - s.totalExpenses))}</p>
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
        <p class="font-mono text-white text-sm tracking-wider" dir="ltr">CODE: ${escapeHtml(lic.code)} ${lic.tier ? `<span class="text-primary">· ${tierLabel(lic.tier)}</span>` : ""}</p>
        <p class="font-display font-bold text-xs text-white mt-1 uppercase">
          <span>${licInfo.left === Infinity ? "♾️ LIFETIME" : licInfo.left + " Days Left"}</span><span class="ml-1 opacity-70">${licInfo.left === Infinity ? "دائم" : "يوم متبقي"}</span>
        </p>
      </div>
      <span class="material-symbols-outlined text-white opacity-10 text-4xl absolute -bottom-2 -right-2 group-hover:opacity-20 transition-opacity">key</span>
    </div>
  </div>

  <!-- Renewals & follow-ups: expiring within 7 days + lapsed within 7 days -->
  <div class="mt-4" id="expiringSoon">
    <h2 class="font-display font-bold text-sm tracking-[-0.05em] uppercase text-muted mb-2 flex gap-1 items-center">
      <span>📞 Renewals</span><span>/</span><span>المتابعة والتجديد</span>
    </h2>
    ${expiring.length ? `
      <div class="flex flex-col gap-2">
        ${expiring.map((m) => {
          const days = Math.max(0, Math.ceil((m.expiresAt - Date.now()) / DAY));
          return `
          <div class="rounded-lg bg-surface border border-outline-variant p-3 flex items-center justify-between gap-3 fade-up">
            <div class="min-w-0">
              <p class="font-headline font-bold truncate">${escapeHtml(m.name)}</p>
              <p class="text-xs text-muted font-mono" dir="ltr">${escapeHtml(m.phone || "—")}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="badge ${days <= 2 ? "badge-alert" : "badge-frost"}">${days === 0 ? "ينتهي اليوم" : `${days} ${days <= 2 ? "يوم" : "أيام"}`}</span>
              ${waDigits(m.phone) ? `<a href="${waReminderLink(m)}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-lg bg-[#25D366] text-black font-headline font-bold uppercase text-[10px] tracking-widest active:scale-95 transition-transform" title="تذكير واتساب">💬 واتساب</a>` : ""}
            </div>
          </div>`;
        }).join("")}
      </div>` : ""}
    ${winback.length ? `
      <h3 class="font-display font-bold text-xs uppercase text-alert mt-3 mb-1 flex gap-1 items-center"><span>⛔ Lapsed this week</span><span>/</span><span>انتهى مؤخراً — رجّعهم</span></h3>
      <div class="flex flex-col gap-2">
        ${winback.map((m) => {
          const daysAgo = Math.max(1, Math.floor((Date.now() - m.expiresAt) / DAY));
          return `
          <div class="rounded-lg bg-alert/10 border border-alert/30 p-3 flex items-center justify-between gap-3 fade-up">
            <div class="min-w-0">
              <p class="font-headline font-bold truncate">${escapeHtml(m.name)}</p>
              <p class="text-xs text-muted font-mono" dir="ltr">${escapeHtml(m.phone || "—")}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="badge badge-alert">${daysAgo === 1 ? "انتهى أمس" : `منتهي منذ ${daysAgo} أيام`}</span>
              ${waDigits(m.phone) ? `<a href="${waWinbackLink(m)}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded-lg bg-[#25D366] text-black font-headline font-bold uppercase text-[10px] tracking-widest active:scale-95 transition-transform" title="رسالة استرجاع واتساب">💬 رجّعه</a>` : ""}
            </div>
          </div>`;
        }).join("")}
      </div>` : ""}
    ${!expiring.length && !winback.length ? `
      <p class="rounded-lg bg-surface border border-outline-variant p-3 text-muted text-xs font-headline">All memberships healthy — nothing expiring soon / كل الاشتراكات بخير ✅</p>` : ""}
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

const absTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });