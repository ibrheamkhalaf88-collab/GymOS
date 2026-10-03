// ============================================================
// Roster Screen (Members + Trainers)
// ============================================================
import { store } from "../store.js";
import { i18n, currentLang } from "../i18n.js";
import { showToast, openModal, confirmDialog, fmt, initials, escapeHtml } from "../ui.js";
import { sanitizeName, sanitizeAmount, sanitizePhone, validatePassword } from "../validate.js";
import { appConfig } from "../config.js";
import { DAY_MS, TIER_LABEL, LICENSE_TIER, FILTER_EMOJI } from "../constants.js";
import { syncExpiryNotifications, effStatus, effectiveLicense, gymName, applyGymName, waDigits, waReminderLink, waWinbackLink } from "../components/notifications.js";
import { openMemberModal, openMemberDetail, openRenewModal, openTrainerForm, openTrainerDetails, openSalaryModal, openTxModal, openPlanPrices, openGymNameModal, printMemberCard, printMonthlyReport, exportCSVs, downloadCSV, tierLabel, trainerStatus, trainerCard, memberAvatar, memberCard } from "../components/modals.js";
import { nf } from "../app-core.js";

const DAY = DAY_MS;

let rosterFilter = "active";
let rosterQuery = "";

export function viewRoster() {
  const nowM = new Date(); nowM.setDate(1); nowM.setHours(0, 0, 0, 0);

  const screen = document.getElementById("screen");
  screen.innerHTML = `
    <!-- Search & Filters (all screens) -->
    <div class="flex flex-col gap-4">
      <div class="relative">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted">search</span>
        <input id="rosterSearch" placeholder="SEARCH ID OR NAME..." class="w-full bg-surface-container border border-outline-variant rounded-full pl-10 pr-4 py-3 text-sm font-label uppercase tracking-wider focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted/50"/>
      </div>
      <div class="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4">
        ${["active", "expired", "trainers", "trial", "frozen"].map((f) => `
          <button data-filter="${f}" class="roster-filter whitespace-nowrap px-5 py-3 rounded-full border font-label tracking-wider active:scale-95 transition-transform flex flex-col items-center gap-0.5 min-w-[92px]
            ${f === rosterFilter
              ? "border-primary bg-primary/10 text-primary shadow-neon"
              : "border-outline-variant bg-surface-container text-muted hover:text-white"}">
            <span class="font-arabic font-bold text-[15px]">${FILTER_EMOJI[f] || ""} ${i18n.t.statuses[f] || (f === "trainers" ? "مدربون" : f)}</span>
            <span class="text-[11px] uppercase opacity-70">${f.toUpperCase()}</span>
          </button>`).join("")}
      </div>
    </div>

    ${rosterFilter === "trainers" ? `
    <!-- Trainer actions live ONLY on the trainers tab -->
    <div class="flex flex-wrap gap-2">
      <button id="addSalaryBtn" class="flex-1 min-w-[150px] bg-surface-container-high border border-outline-variant text-on-surface font-headline font-bold uppercase tracking-widest text-xs px-4 py-2.5 rounded-xl hover:border-primary hover:text-primary active:scale-95 transition-all flex items-center justify-center gap-2">
        <span class="material-symbols-outlined text-[18px]">badge</span> 💪 SALARY / <span class="font-arabic normal-case">تسجيل راتب يدوي</span>
      </button>
      <button id="addTrainerBtn" class="flex-1 min-w-[150px] bg-primary text-black font-headline font-bold uppercase tracking-widest text-xs px-4 py-3 rounded-xl shadow-neon hover:bg-white active:scale-95 transition-all flex items-center justify-center gap-2">
        <span class="material-symbols-outlined text-[18px]" style="font-variation-settings:'FILL' 1;">person_add</span> ➕ ADD TRAINER / <span class="font-arabic normal-case">إضافة مدرب</span>
      </button>
    </div>` : ""}

    <!-- Roster List (members or trainers by filter) -->
    <div id="rosterGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>`;

  const renderList = () => {
    const grid = document.getElementById("rosterGrid");

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
    let members = store.sortMembers(store.all("members"));
    if (rosterFilter) members = members.filter((m) => effStatus(m) === rosterFilter);
    if (q) members = members.filter((m) => m.name.toLowerCase().includes(q) || String(m.phone).includes(q));

    grid.innerHTML = members.length ? members.map((m, i) => memberCard(m, i)).join("")
      : `<div class="empty-state col-span-full"><div class="icon material-symbols-outlined">group_off</div><h3>لا يوجد أعضاء</h3><p>ابدأ بإضافة أول عضو للنادي</p></div>`;

    grid.querySelectorAll("[data-member]").forEach((card) =>
      card.addEventListener("click", () => openMemberDetail(card.dataset.member)));
  };

  const searchEl = document.getElementById("rosterSearch");
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
  const pageActions = document.getElementById("pageActions");
  if (pageActions) {
    pageActions.innerHTML = `
      <button id="addMemberBtn" class="btn-primary flex items-center gap-2">
        <span class="material-symbols-outlined text-[20px]">person_add</span> ADD MEMBER
      </button>`;
    document.getElementById("addMemberBtn").onclick = openMemberModal;
    document.getElementById("addSalaryBtn")?.addEventListener("click", openSalaryModal);
    document.getElementById("addTrainerBtn")?.addEventListener("click", () => openTrainerForm());
    document.getElementById("newTrainerBtn")?.addEventListener("click", () => openTrainerForm());
  }
}