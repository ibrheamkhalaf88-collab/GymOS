// ============================================================
// Ledger Screen (Finance)
// ============================================================
import { store } from "../store.js";
import { i18n, currentLang } from "../i18n.js";
import { showToast, openModal, confirmDialog, fmt, initials, escapeHtml } from "../ui.js";
import { sanitizeName, sanitizeAmount, sanitizePhone, validatePassword } from "../validate.js";
import { appConfig } from "../config.js";
import { DAY_MS } from "../constants.js";
import { syncExpiryNotifications, effStatus, effectiveLicense, gymName, applyGymName, waDigits, waReminderLink, waWinbackLink } from "../components/notifications.js";
import { openTxModal, trainerStatus, payTrainer, openTrainerDetails } from "../components/modals.js";
import { nf } from "../app-core.js";

const DAY = DAY_MS;

let ledgerOffset = 0;

export function viewLedger() {
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
        <p class="text-xs text-muted mt-1 truncate">${due.map((t) => `${escapeHtml(t.name)} ($${t.salary})`).join(" · ")} — الإجمالي: ${fmt.money(dueTotal)}</p>
      </div>
      <button id="payAllBtn" class="shrink-0 bg-primary text-black font-headline font-bold uppercase tracking-widest text-xs px-4 py-2.5 rounded-xl hover:bg-white active:scale-95 transition-all">🔁 Renew all / تجديد الكل</button>
    </div>` : "";

  const screen = document.getElementById("screen");
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

  document.getElementById("ledPrev").onclick = () => { ledgerOffset = (ledgerOffset || 0) - 1; viewLedger(); };
  document.getElementById("ledNext").onclick = () => { ledgerOffset = Math.min(0, (ledgerOffset || 0) + 1); viewLedger(); };
  document.getElementById("ledJump").onchange = (e) => { ledgerOffset = Number(e.target.value); viewLedger(); };
  document.getElementById("addTxBtn").onclick = openTxModal;
  document.getElementById("pricesBtn").onclick = () => openPlanPrices();
  document.getElementById("reportsBtn").onclick = () => { const { show } = await import("../app-core.js"); show("reports"); };
  document.getElementById("payAllBtn")?.addEventListener("click", () => {
    due.forEach((t) => payTrainer(t, { silent: true }));
    showToast(`✅ Paid ${due.length} salaries — ${fmt.money(dueTotal)} / تم دفع الرواتب`);
  });
}

// Trainer Status Helper
function trainerStatus(t) {
  if (t.contractEnd && Date.now() > t.contractEnd) return { active: false, ended: true, until: t.contractEnd };
  const base = t.lastPaidAt ?? t.startedAt ?? Date.now();
  const d = new Date(base); d.setMonth(d.getMonth() + 1);
  const until = d.getTime();
  return { active: Date.now() < until, ended: false, until };
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

function importData() { /* ... */ }
function exportData() { /* ... */ }