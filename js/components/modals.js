// ============================================================
// Modals Component - All Modal Functions
// ============================================================
import { store } from "../store.js";
import { license } from "../license.js";
import { i18n, currentLang } from "../i18n.js";
import { showToast, openModal, confirmDialog, fmt, initials, escapeHtml } from "../ui.js";
import { sanitizeName, sanitizeAmount, sanitizePhone, validatePassword } from "../validate.js";
import { appConfig } from "../config.js";
import { DAY_MS, TIER_LABEL, LICENSE_TIER, FILTER_EMOJI, PLAN_DEFAULTS, PLAN_KEYS, PLAN_PRICES_KEY } from "../constants.js";
import { syncExpiryNotifications, effStatus, effectiveLicense, gymName, applyGymName, waDigits, waReminderLink, waWinbackLink } from "./notifications.js";
import { printMemberCard, printMonthlyReport, exportCSVs, downloadCSV } from "./notifications.js";
import { nf } from "../app-core.js";
import { planPrices, savePlanPrices } from "../store.js";

const DAY = DAY_MS;

const TIER_LABEL_MAP = { regular: "REGULAR TIER", pro: "PRO TIER", half: "HALF PASS",
  elite: "ELITE TIER", standard: "STANDARD TIER", trial: "GUEST" };
const LICENSE_TIER_MAP = {
  monthly: ["📅", "MONTHLY", "شهرية"],
  yearly:  ["🗓️", "YEARLY", "سنوية"],
  lifetime:["♾️", "LIFETIME", "دائمة"],
  standard:["🔑", "STANDARD", "عادية"],
  vip:     ["💎", "VIP", "مميزة"],
  guest:   ["👤", "GUEST", "زائر"],
  trial:   ["🎁", "TRIAL", "تجربة"],
};
const tierLabel = (tier) => {
  const m = LICENSE_TIER_MAP[tier];
  return m ? `${m[0]} ${m[1]} / ${m[2]}` : `${tier}`;
};
const FILTER_EMOJI_MAP = { active: "✅", expired: "⛔", trial: "🎁", frozen: "❄️", trainers: "👥" };

const ARROW_SVG = `<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" fill-rule="evenodd"></path></svg>`;

// ========== Member Modal ==========
export function openMemberModal(id = null) {
  const t = i18n.t;
  const m = id ? store.get("members", id) : null;
  const prices = planPrices();
  const planOptions = PLAN_KEYS.map((k) =>
    `<option value="${k}" ${m?.plan === k ? "selected" : ""}>${PLAN_DEFAULTS[k].en} / ${PLAN_DEFAULTS[k].ar} — $${prices[k]}</option>`).join("");
  const legacyOpt = m && !PLAN_KEYS.includes(m.plan)
    ? `<option value="${escapeHtml(m.plan)}" selected>${escapeHtml(m.plan)}</option>` : "";

  const mod = openModal(`
    <div class="modal-header mb-6">
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${m ? "✏️ " + t.editMember : "➕ " + t.addMember}</h3>
      <p class="font-arabic text-muted text-sm" dir="rtl">${m ? "تعديل بيانات العضو" : "إضافة عضو جديد"}</p>
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
          <label>Tag / وسم</label>
        </div>
      </div>
      <div class="grid ${m ? "grid-cols-1" : "grid-cols-[1fr_6.5rem]"} gap-4 items-end">
        <div class="field-wrapper">
          <select name="plan" class="dp-field">${planOptions}${legacyOpt}</select>
          <label>${t.plan}</label>
          <button type="button" id="editPricesBtn" title="Edit plan prices / تعديل أسعار الباقات" class="field-action btn-ghost">
            <span class="material-symbols-outlined text-[16px]">settings_suggest</span>
          </button>
        </div>
        ${m ? "" : `<div class="field-wrapper">
          <input name="days" type="number" min="1" max="1095" value="30" class="dp-field" placeholder=" " />
          <label>Days / الأيام</label>
        </div>`}
      </div>
      ${m && effStatus(m) !== "expired" ? `
      <div class="card p-4 gradient-border">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-[10px] uppercase tracking-widest text-muted font-headline mb-1">Subscription / الاشتراك</p>
            <p class="font-headline text-sm uppercase ${m.status === "frozen" ? "text-frost" : "text-volt"}">
              ${m.status === "frozen"
                ? `❄️ Frozen / مجمد${m.remainingDays != null ? ` <span class="normal-case text-xs text-muted">— ${m.remainingDays} يوم متوقف</span>` : ""}`
                : "✅ Active / فعال"}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button type="button" data-edit-prices title="Edit plan prices / تعديل أسعار الباقات" class="btn-secondary text-xs px-3 py-2">
              🏷️ ${prices[m?.plan] != null ? "$" + prices[m.plan] : "Prices"}
            </button>
            <button type="button" data-toggle-freeze class="btn-frost text-xs px-3 py-2">
              ${m.status === "frozen" ? "▶ Resume / استئناف" : "❄️ Freeze / تجميد"}
            </button>
          </div>
        </div>` : ""}
      ${m ? "" : `<div class="field-wrapper">
        <input name="startDate" type="date" value="${new Date().toLocaleDateString("en-CA")}" max="${new Date().toLocaleDateString("en-CA")}" class="dp-field" placeholder=" " />
        <label>Start Date / تاريخ البداية</label>
      </div>`}
      <div class="field-wrapper">
        <input name="paidAmount" type="number" min="0" step="0.5" value="${m ? m.paidAmount ?? 0 : prices[PLAN_KEYS[0]]}" class="dp-field" placeholder=" " />
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
    document.querySelector('select[name="plan"]', mod.el).addEventListener("change", (e) => {
      const p = planPrices()[e.target.value];
      if (p != null) document.querySelector('[name="paidAmount"]', mod.el).value = p;
    });
  }
  // Inline price editor
  const refreshPlanOptions = () => {
    const sel = document.querySelector('select[name="plan"]', mod.el);
    if (!sel) return;
    const current = sel.value;
    const fresh = planPrices();
    sel.innerHTML = PLAN_KEYS.map((k) =>
      `<option value="${k}" ${k === current ? "selected" : ""}>${PLAN_DEFAULTS[k].en} / ${PLAN_DEFAULTS[k].ar} — $${fresh[k]}</option>`).join("");
    const chip = mod.el.querySelector("[data-edit-prices]");
    if (chip && m) {
      const v = fresh[current];
      chip.innerHTML = `🏷️ ${v != null ? "$" + v : "Prices"}`;
    }
  };
  mod.el.querySelector("#editPricesBtn").addEventListener("click", () => openPlanPrices(refreshPlanOptions));
  mod.el.querySelector("[data-edit-prices]")?.addEventListener("click", () => openPlanPrices(refreshPlanOptions));

  // Freeze / resume subscription
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

  mod.el.querySelector("#memberForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const days = Number(fd.get("days")) || 30;
    const cleanName = sanitizeName(fd.get("name"));
    if (!cleanName) { showToast("Invalid name / اسم غير صالح", "err"); return; }
    const strip = (v) => String(v || "").replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 20);
    const data = {
      name: cleanName,
      phone: strip(fd.get("phone")),
      tag: strip(fd.get("tag")),
      plan: fd.get("plan"),
      paidAmount: Number(fd.get("paidAmount")) || 0,
    };
    if (m) {
      const patch = { ...data };
      delete patch.paidAmount;
      const res = store.update("members", id, patch);
      if (!res) return;
    } else {
      const startVal = fd.get("startDate");
      const joinTs = startVal ? new Date(`${startVal}T00:00:00`).getTime() : Date.now();
      const res = store.insert("members", {
        ...data,
        photo: "",
        status: data.plan === "trial" ? "trial" : "active",
        joinDate: joinTs,
        expiresAt: joinTs + days * DAY,
        checkins: 0,
      });
      if (!res) return;
    }
    mod.close();
    showToast(m ? "Saved / تم الحفظ" : "Member added / تمت إضافة العضو");
  });
}

// ========== Member Detail Modal ==========
export function openMemberDetail(id) {
  const m = store.get("members", id);
  const t = i18n.t;
  const st = effStatus(m);
  const avatarClass = st === "expired" ? "avatar-alert" : st === "trial" ? "avatar-frost" : "avatar-volt";
  const statusBadge = st === "expired" ? `<span class="badge badge-alert">⛔ منتهي</span>` : st === "trial" ? `<span class="badge badge-frost">🎁 تجريبي</span>` : st === "frozen" ? `<span class="badge badge-muted">❄️ مجمد</span>` : `<span class="badge badge-volt">✅ نشط</span>`;

  const mod = openModal(`
    <div class="flex items-center gap-4 mb-6">
      <div class="avatar ${avatarClass} text-xl">${initials(m.name)}</div>
      <div class="flex-1 min-w-0">
        <h3 class="font-headline font-bold uppercase text-lg truncate">${escapeHtml(m.name)}</h3>
        <div class="flex items-center gap-2 mt-1">
          ${statusBadge}
          <span class="text-sm text-muted font-mono" dir="ltr">#${m.id.slice(-4)}</span>
        </div>
        <p class="text-xs text-muted mt-0.5" dir="ltr">${escapeHtml(m.phone || "—")}</p>
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
    </div>
    <div class="flex gap-3 mt-3">
      ${waDigits(m.phone) ? `<a href="${waReminderLink(m)}" target="_blank" rel="noopener" class="btn-secondary flex-1 text-center">💬 تذكير واتساب</a>` : ""}
      <button data-card class="btn-secondary flex-1">🖨️ طباعة كارت / Print card</button>
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
  mod.el.querySelector("[data-card]").onclick = () => printMemberCard(m);
}

// ========== Renew Modal ==========
export function openRenewModal(id) {
  const m = store.get("members", id);
  const t = i18n.t;
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">${t.renew} — ${escapeHtml(m.name)}</h3>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">تجديد اشتراك العضو</p>
    <form id="renewForm" class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Days / أيام</label>
          <input name="days" type="number" min="1" max="1095" value="30" class="dp-field mt-1" /></div>
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.amount} ($)</label>
          <input name="amount" type="number" min="0" step="0.5" value="0" class="dp-field mt-1" dir="ltr" /></div>
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
  mod.el.querySelector("#renewForm").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-base]");
    if (!btn) return;
    e.preventDefault();
    const fd = new FormData(mod.el.querySelector("#renewForm"));
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

// ========== Trainer Modal ==========
export function openTrainerForm(id = null) {
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
        <input name="contractEnd" type="date" value="${cur?.contractEnd ? iso(cur.contractEnd) : iso(Date.now() + 30 * DAY_MS)}" class="dp-field mt-1"/></div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Phone (optional)</label>
        <input name="phone" dir="ltr" value="${cur ? escapeHtml(cur.phone || "") : ""}" class="dp-field mt-1" /></div>
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm pressable">${t.cancel}</button>
        <button type="submit" class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">${t.save}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  mod.el.querySelector("#trainerForm").addEventListener("submit", (e) => {
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

// ========== Trainer Details Modal ==========
export function openTrainerDetails(id) {
  const t = store.get("trainers", id);
  if (!t) return;
  const ledger = store.all("ledger");
  const mine = (l) => l && (l.trainerId === id || (!l.trainerId && typeof l.description === "string" && l.description.includes(t.name)));
  const money = ledger.filter((l) => l.type === "expense" && (l.category === "salary" || l.category === "advance") && mine(l)).sort((a, b) => b.date - a.date);
  const salaries = money.filter((l) => l.category === "salary");
  const advances = money.filter((l) => l.category === "advance");
  const totalPaid = money.reduce((s, p) => s + Number(p.amount || 0), 0);
  const mStart = new Date(); mStart.setDate(1); mStart.setHours(0, 0, 0, 0);
  const thisMonth = money.filter((l) => l.date >= mStart.getTime());
  const tookThisMonth = thisMonth.reduce((s, p) => s + Number(p.amount || 0), 0);
  const st = trainerStatus(t);
  const paidThisMonth = thisMonth.some((l) => l.category === "salary") || (t.lastPaidAt && t.lastPaidAt >= mStart.getTime());
  const salaryNum = Number(t.salary || 0);
  const remainingDue = salaryNum - tookThisMonth;
  const lastAdvance = advances[0] || null;
  const lastSalary = salaries[0] || null;

  const mod = openModal(`
    <div class="flex items-center justify-between mb-1">
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg">👤 ${escapeHtml(t.name)}</h3>
      <span class="text-primary font-headline font-bold" dir="ltr">${fmt.money(t.salary)}/mo</span>
    </div>
    <p class="font-arabic text-muted text-sm mb-5" dir="rtl">الملف المالي الكامل — رواتب وسلف</p>

    <!-- This month status -->
    <div class="rounded-xl p-4 mb-4 ${paidThisMonth ? "bg-primary/10 border border-primary/30" : "bg-alert/10 border border-alert/40"}">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="font-headline font-bold text-sm ${paidThisMonth ? "text-primary" : "text-alert"}">${paidThisMonth ? "✅ اتدفع له هذا الشهر" : "⏰ لسا ما اتدفع له هذا الشهر"}</p>
          <p class="text-xs text-muted mt-1">أخد هذا الشهر: <b class="text-on-surface" dir="ltr">${fmt.money(tookThisMonth)}</b> ${st.until ? ` • الدفعة الجاية: ${fmt.date(st.until, currentLang())}` : ""}</p>
          <p class="text-xs mt-1 ${remainingDue < 0 ? "text-accent" : "text-muted"}">${remainingDue < 0
            ? `⚠️ أخد زيادة عن راتبه بـ <b dir="ltr">${fmt.money(-remainingDue)}</b>`
            : `ضايل له من راتب هذا الشهر: <b class="text-primary" dir="ltr">${fmt.money(remainingDue)}</b>`}</p>
        </div>
        ${!paidThisMonth ? `<button id="payNowBtn" class="bg-primary text-black text-xs font-bold px-3 py-2 rounded-lg active:scale-95">ادفع الآن 💵</button>` : ""}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 text-sm mb-5">
      <div class="bg-surface-container rounded-xl p-3">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Last salary / آخر دفعة</p>
        <p class="font-headline">${lastSalary ? `${fmt.date(lastSalary.date, currentLang())} (${fmt.money(lastSalary.amount)})` : "لم يُدفع بعد"}</p>
      </div>
      <div class="bg-surface-container rounded-xl p-3">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Last advance / آخر سلفة</p>
        <p class="font-headline">${lastAdvance ? `${fmt.date(lastAdvance.date, currentLang())} (${fmt.money(lastAdvance.amount)})` : "لا يوجد"}</p>
      </div>
      <div class="bg-surface-container rounded-xl p-3">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Started / بدأ العمل</p>
        <p class="font-headline">${t.startedAt ? fmt.date(t.startedAt, currentLang()) : "—"}</p>
      </div>
      <div class="bg-surface-container rounded-xl p-3">
        <p class="text-[10px] uppercase tracking-widest text-muted mb-1">Total paid / إجمالي المصروف</p>
        <p class="font-headline text-alert" dir="ltr">${fmt.money(totalPaid)}</p>
      </div>
    </div>

    <!-- Record an advance -->
    <form id="advanceForm" class="flex gap-2 mb-6">
      <div class="field-wrapper flex-1">
        <input name="amount" type="number" min="1" step="0.5" required class="dp-field" placeholder=" " />
        <label>Advance amount / مبلغ السلفة ($)</label>
      </div>
      <button type="submit" class="bg-accent text-black text-xs font-bold px-4 rounded-xl active:scale-95 shrink-0">➕ سلفة</button>
    </form>

    <h4 class="font-headline font-bold uppercase tracking-tight text-sm mb-2">🧾 History / سجل الحركات</h4>
    <div class="glass-card rounded-lg flex flex-col divide-y divide-outline-variant/50 max-h-[220px] overflow-y-auto">
      ${money.length ? money.map((p) => `
        <div class="p-3 flex items-center justify-between text-sm">
          <div class="flex items-center gap-2 min-w-0">
            <span class="material-symbols-outlined ${p.category === "advance" ? "text-accent" : "text-alert"} text-[18px]">${p.category === "advance" ? "payments" : "south"}</span>
            <div class="min-w-0">
              <p class="truncate">${p.category === "advance" ? "سلفة / Advance" : "راتب / Salary"}</p>
              <p class="text-xs text-muted">${fmt.date(p.date, currentLang())}${p.trainerId ? "" : " (legacy)"}</p>
            </div>
          </div>
          <p class="font-headline font-bold ${p.category === "advance" ? "text-accent" : "text-alert"} tabular-nums" dir="ltr">-${fmt.money(p.amount)}</p>
        </div>`).join("") : `<p class="text-center text-muted py-5 text-sm">📭 لا توجد حركات مسجلة بعد</p>`}
    </div>

    ${t.phone ? `<p class="text-xs text-muted mt-4" dir="ltr">📞 ${escapeHtml(t.phone)}</p>` : ""}`);

  mod.el.querySelector("#payNowBtn")?.addEventListener("click", () => { payTrainer(t); mod.close(); });
  mod.el.querySelector("#advanceForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = Number(new FormData(e.target).get("amount"));
    if (!amount || amount <= 0) return;
    store.insert("ledger", {
      type: "expense",
      amount,
      description: `Advance: ${t.name} / سلفة: ${t.name}`,
      category: "advance",
      trainerId: t.id,
      date: Date.now(),
    });
    showToast(`➕ Advance recorded — ${fmt.money(amount)} / اتسجلت السلفة`);
    mod.close();
    openTrainerDetails(id);
  });
}

// ========== Plan Prices Modal ==========
export function openPlanPrices(onSaved) {
  const t = i18n.t;
  const prices = planPrices();
  const mod = openModal(`
    <div class="modal-header mb-6">
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">💲 Plan Prices / أسعار الباقات</h3>
      <p class="font-arabic text-muted text-sm" dir="rtl">حدّد السعر الافتراضي لكل باقة — يُستخدم تلقائياً عند إضافة عضو</p>
    </div>
    <form id="pricesForm" class="flex flex-col gap-4">
      ${PLAN_KEYS.map((k) => `
        <div class="field-wrapper">
          <input name="${k}" type="number" min="0" step="0.5" value="${prices[k] ?? 0}" class="dp-field" dir="ltr" placeholder=" " />
          <label>${PLAN_DEFAULTS[k].en} / ${PLAN_DEFAULTS[k].ar}</label>
        </div>`).join("")}
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="btn-secondary flex-1">${t.cancel}</button>
        <button type="submit" class="btn-primary flex-1">${t.save}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  mod.el.querySelector("#pricesForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = {};
    PLAN_KEYS.forEach((k) => { next[k] = Number(fd.get(k)) || 0; });
    savePlanPrices(next);
    mod.close();
    showToast("Prices saved / تم حفظ الأسعار");
    onSaved && onSaved();
  });
}

// ========== Transaction Modal ==========
export function openTxModal() {
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
          <input name="amount" type="number" min="0.5" step="0.5" required class="dp-field mt-1" dir="ltr" /></div>
      </div>
      <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">${t.description}</label>
        <input name="description" required class="dp-field mt-1" placeholder="e.g. Membership: Ahmed" /></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Category</label>
          <select name="category" class="dp-field mt-1">
            <option value="subscriptions">Subscriptions / اشتراكات</option>
            <option value="maintenance">Maintenance / صيانة</option>
            <option value="salary">Salary / رواتب</option>
            <option value="advance">Advance / سلفة</option>
            <option value="pos">POS / مبيعات</option>
            <option value="other-income">Other Income / إيرادات أخرى</option>
            <option value="other-expense">Other Expense / مصروفات أخرى</option>
          </select></div>
        <div><label class="text-[10px] uppercase tracking-widest text-muted font-headline">Note</label>
          <input name="note" class="dp-field mt-1" placeholder="Optional note" /></div>
      </div>
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="flex-1 py-3 rounded-xl border border-outline-variant text-muted font-bold uppercase text-sm pressable">${t.cancel}</button>
        <button type="submit" class="flex-1 py-3 rounded-xl bg-primary-fixed text-black font-headline font-bold uppercase text-sm pressable">${t.save}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  mod.el.querySelector("#txForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const type = fd.get("type");
    const amount = Number(fd.get("amount"));
    if (!amount || amount <= 0) { showToast("Invalid amount / مبلغ غير صالح", "err"); return; }
    const data = {
      type,
      amount,
      description: fd.get("description").trim(),
      category: fd.get("category"),
      note: fd.get("note")?.trim() || "",
      date: Date.now(),
    };
    store.insert("ledger", data);
    mod.close();
    showToast("Transaction recorded / تم تسجيل الحركة");
  });
}

// ========== Gym Name Modal ==========
export function openGymNameModal() {
  const t = i18n.t;
  const cur = localStorage.getItem("dp_gym_name") || "";
  const mod = openModal(`
    <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">🏷️ Gym Name / اسم النادي</h3>
    <p class="font-arabic text-muted text-sm mb-4" dir="rtl">بيظهر في القائمة الجانبية، رسائل الواتساب، والتقارير المطبوعة</p>
    <form id="gymNameForm" class="flex flex-col gap-3">
      <input name="gname" class="dp-field" value="${escapeHtml(cur)}" placeholder="اسم النادي…" maxlength="40" />
      <div class="flex gap-3 pt-1">
        <button type="button" data-close class="btn-secondary flex-1">${t.cancel}</button>
        <button type="submit" class="btn-primary flex-1">${t.save}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  mod.el.querySelector("#gymNameForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = String(new FormData(e.target).get("gname") || "").replace(/[<>]/g, "").trim().slice(0, 40);
    if (v) localStorage.setItem("dp_gym_name", v); else localStorage.removeItem("dp_gym_name");
    applyGymName();
    mod.close();
    showToast("Saved / تم الحفظ");
    // Re-render profile if needed
    try { const { viewProfile } = require("../screens/profile.js"); viewProfile(); } catch {}
  });
}

// ========== Plan Prices Modal ==========
export function openPlanPrices(onSaved) {
  const t = i18n.t;
  const prices = planPrices();
  const mod = openModal(`
    <div class="modal-header mb-6">
      <h3 class="font-headline font-bold uppercase tracking-tight text-lg mb-1">💲 Plan Prices / أسعار الباقات</h3>
      <p class="font-arabic text-muted text-sm" dir="rtl">حدّد السعر الافتراضي لكل باقة — يُستخدم تلقائياً عند إضافة عضو</p>
    </div>
    <form id="pricesForm" class="flex flex-col gap-4">
      ${PLAN_KEYS.map((k) => `
        <div class="field-wrapper">
          <input name="${k}" type="number" min="0" step="0.5" value="${prices[k] ?? 0}" class="dp-field" dir="ltr" placeholder=" " />
          <label>${PLAN_DEFAULTS[k].en} / ${PLAN_DEFAULTS[k].ar}</label>
        </div>`).join("")}
      <div class="flex gap-3 pt-2">
        <button type="button" data-close class="btn-secondary flex-1">${t.cancel}</button>
        <button type="submit" class="btn-primary flex-1">${t.save}</button>
      </div>
    </form>`);
  mod.el.querySelector("[data-close]").onclick = mod.close;
  mod.el.querySelector("#pricesForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const next = {};
    PLAN_KEYS.forEach((k) => { next[k] = Number(fd.get(k)) || 0; });
    savePlanPrices(next);
    mod.close();
    showToast("Prices saved / تم حفظ الأسعار");
    onSaved && onSaved();
  });
}

// ========== Print Functions ==========
export function printMemberCard(m) {
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent("DP-MEMBER:" + m.id)}`;
  const w = window.open("", "_blank", "width=480,height=720");
  if (!w) { showToast("Popup blocked / اسمح بالنوافذ المنبثقة", "err"); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHtml(m.name)}</title>
  <style>
    body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#111;margin:0;padding:24px;}
    h1{font-size:18px;margin:0 0 2px;text-align:center}
    .sub{text-align:center;color:#555;font-size:12px;margin-bottom:16px}
    .card{border:2px solid #000;border-radius:16px;padding:20px;width:320px;margin:0 auto;text-align:center}
    .card .name{font-size:22px;font-weight:800;margin:10px 0 2px}
    .muted{color:#555;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:start}
    .tot{font-weight:800;font-size:14px}
    @media print{body{padding:0}}
  </style></head><body>${buildMemberCardHtml(m, qr)}<script>window.onload=function(){setTimeout(window.print,300)};</script></body></html>`);
  w.document.close();
}

function buildMemberCardHtml(m, qr) {
  return `<div class="card">
    <div class="muted" style="letter-spacing:2px;font-weight:700">${escapeHtml(gymName())}</div>
    <div class="name">${escapeHtml(m.name)}</div>
    <div class="muted" dir="ltr">#${escapeHtml(String(m.id))}</div>
    <img src="${qr}" width="160" height="160" alt="QR" onerror="this.style.display='none'" style="margin:12px auto;display:block"/>
    <div class="muted">${escapeHtml(String(i18n.t.plans[m.plan] || m.plan))} · ${fmt.date(m.expiresAt)}</div>
  </div>`;
}

export function printMonthlyReport() {
  const AR_MONTHS = ["كانون الثاني","شباط","آذار","نيسان","أيار","حزيران","تموز","آب","أيلول","تشرين الأول","تشرين الثاني","كانون الأول"];
  const base = new Date(); base.setDate(1); base.setHours(0,0,0,0); base.setMonth(base.getMonth() + (window.ledgerOffset || 0));
  const mStart = base.getTime(); const nxt = new Date(base); nxt.setMonth(base.getMonth() + 1); const mEnd = nxt.getTime();
  const rows = store.all("ledger").filter((l) => l.date >= mStart && l.date < mEnd).sort((a, b) => a.date - b.date);
  const rev = rows.filter((l) => l.type === "revenue").reduce((s, l) => s + Number(l.amount || 0), 0);
  const exp = rows.filter((l) => l.type === "expense").reduce((s, l) => s + Number(l.amount || 0), 0);
  const money = (n) => `$${Number(n).toFixed(2)}`;
  const w = window.open("", "_blank", "width=640,height=720");
  if (!w) { showToast("Popup blocked / اسمح بالنوافذ المنبثقة", "err"); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHtml(gymName())} Report</title>
  <style>
    body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#111;margin:0;padding:24px;}
    h1{font-size:18px;margin:0 0 2px;text-align:center}
    .sub{text-align:center;color:#555;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:start}
    .tot{font-weight:800;font-size:14px}
    @media print{body{padding:0}}
  </style></head><body>${buildReportHtml(base, rev, exp, rows, money)}<script>window.onload=function(){setTimeout(window.print,300)};</script></body></html>`);
  w.document.close();
}

function buildReportHtml(base, rev, exp, rows, money) {
  return `<h1>${escapeHtml(gymName())} — تقرير ${AR_MONTHS[base.getMonth()]} ${base.getFullYear()}</h1>
  <div class="sub">إيرادات: ${money(rev)} · مصروفات: ${money(exp)} · صافي: ${money(rev - exp)}</div>
  <table><thead><tr><th>التاريخ</th><th>البيان</th><th>النوع</th><th>المبلغ</th></tr></thead><tbody>
    ${rows.map((l) => `<tr><td>${fmt.date(l.date)}</td><td>${escapeHtml(l.note || l.title || "—")}</td><td>${l.type === "revenue" ? "إيراد" : "مصروف"}</td><td dir="ltr">${money(l.amount)}</td></tr>`).join("") || `<tr><td colspan="4" style="text-align:center;color:#888">لا حركات هذا الشهر</td></tr>`}
    <tr class="tot"><td colspan="3">الصافي</td><td dir="ltr">${money(rev - exp)}</td></tr>
  </tbody></table>`;
}

// ========== CSV Export ==========
export function downloadCSV(filename, headers, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportCSVs() {
  const today = new Date().toISOString().slice(0, 10);
  const plans = i18n.t.plans;
  const members = store.all("members");
  downloadCSV(`members-${today}.csv`,
    ["id", "name", "phone", "plan", "joinDate", "expiresAt", "status"],
    members.map((m) => [m.id, m.name, m.phone || "", String(plans[m.plan] || m.plan),
      m.joinDate ? new Date(m.joinDate).toISOString().slice(0, 10) : "",
      m.expiresAt ? new Date(m.expiresAt).toISOString().slice(0, 10) : "", effStatus(m)]));
  setTimeout(() => downloadCSV(`ledger-${today}.csv`,
    ["id", "date", "type", "amount", "note"],
    store.all("ledger").map((l) => [l.id, l.date ? new Date(l.date).toISOString().slice(0, 10) : "",
      l.type, Number(l.amount) || 0, l.note || l.title || ""])), 350);
  showToast("CSV exported / تم تصدير جداول الأعضاء والمالية");
}