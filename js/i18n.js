// ============================================================
// i18n — English / Arabic with RTL switching
// The design is intentionally bilingual (EN primary + AR sub),
// this module handles document direction and JS-side strings.
// ============================================================

const LANG_KEY = "dp_lang";

const strings = {
  en: {
    dashboard: "Dashboard", roster: "Roster", hardware: "Hardware",
    ledger: "Ledger", reports: "Reports", profile: "Profile",
    activeMembers: "Active Members", endedToday: "Ended Today",
    totalExpired: "Total Expired", maintAlert: "Maint. Alert",
    licenseStatus: "License Status", daysLeft: "Days Left",
    checkins7: "Check-ins (7D)", systemFeed: "System Feed",
    searchRoster: "SEARCH ID OR NAME...",
    addMember: "Add Member", editMember: "Edit Member",
    memberName: "Full name", phone: "Phone", plan: "Plan",
    plans: { trial: "Trial", standard: "Standard", pro: "Pro", elite: "Elite" },
    statuses: { active: "Active", expired: "Expired", trial: "Trial", frozen: "Frozen" },
    joinDate: "Joined", expiresOn: "Expires", paidAmount: "Paid", checkins: "Check-ins",
    save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit",
    renew: "Renew", confirmDelete: "Delete this record?",
    mrr: "Monthly Recurring Revenue",
    revenueThisMonth: "Revenue / Month", expensesMonth: "Expenses / Month",
    netProfit: "Net profit", transactions: "Transactions",
    addTransaction: "Add Transaction", type: "Type", revenue: "Revenue",
    expense: "Expense", amount: "Amount", description: "Description",
    devicesHealth: "Device Health", equipment: "Equipment",
    addDevice: "Add Device", deviceName: "Device name", location: "Location",
    issue: "Issue", maintenanceStatus: "Maintenance status",
    maintStates: { pending: "Pending", "in-repair": "In repair", completed: "Completed" },
    cost: "Cost", paid: "Paid",
    languageLabel: "Language", exportData: "Export backup (JSON)",
    importData: "Import backup", resetData: "Reset demo data",
    deactivate: "Deactivate license", adminPanel: "Codes Admin",
    yourLicense: "Your License", activatedOn: "Activated on",
    expiresOn2: "Expires on", device: "Device",
    reportsTitle: "Reports & Analytics", planDistribution: "Plan distribution",
    cashflow: "Cashflow (6 months)", noData: "No data yet",
  },
  ar: {
    dashboard: "الرئيسية", roster: "الأعضاء", hardware: "الأجهزة",
    ledger: "المالية", reports: "التقارير", profile: "حسابي",
    activeMembers: "الأعضاء النشطون", endedToday: "انتهت اليوم",
    totalExpired: "إجمالي المنتهية", maintAlert: "تنبيه صيانة",
    licenseStatus: "حالة الترخيص", daysLeft: "يوم متبقي",
    checkins7: "تسجيلات الدخول (٧ أيام)", systemFeed: "سجل النظام",
    searchRoster: "ابحث بالاسم أو الرقم...",
    addMember: "إضافة عضو", editMember: "تعديل العضو",
    memberName: "الاسم الكامل", phone: "الهاتف", plan: "الباقة",
    plans: { trial: "تجريبية", standard: "عادية", pro: "احترافية", elite: "مميزة" },
    statuses: { active: "نشط", expired: "منتهي", trial: "تجربة", frozen: "مجمد" },
    joinDate: "الانضمام", expiresOn: "ينتهي", paidAmount: "المدفوع", checkins: "زيارات",
    save: "حفظ", cancel: "إلغاء", delete: "حذف", edit: "تعديل",
    renew: "تجديد", confirmDelete: "حذف هذا السجل؟",
    mrr: "الإيرادات الشهرية المتكررة",
    revenueThisMonth: "إيرادات الشهر", expensesMonth: "مصروفات الشهر",
    netProfit: "صافي الربح", transactions: "الحركات المالية",
    addTransaction: "إضافة حركة", type: "النوع", revenue: "إيراد",
    expense: "مصروف", amount: "المبلغ", description: "الوصف",
    devicesHealth: "صحة الأجهزة", equipment: "المعدات",
    addDevice: "إضافة جهاز", deviceName: "اسم الجهاز", location: "الموقع",
    issue: "المشكلة", maintenanceStatus: "حالة الصيانة",
    maintStates: { pending: "بانتظار", "in-repair": "قيد الإصلاح", completed: "تم" },
    cost: "التكلفة", paid: "المدفوع",
    languageLabel: "اللغة", exportData: "تصدير نسخة احتياطية",
    importData: "استيراد نسخة", resetData: "إعادة تعيين البيانات",
    deactivate: "إلغاء تفعيل الترخيص", adminPanel: "إدارة الأكواد",
    yourLicense: "ترخيصك", activatedOn: "تفعل بتاريخ",
    expiresOn2: "ينتهي بتاريخ", device: "الجهاز",
    reportsTitle: "التقارير والتحليلات", planDistribution: "توزيع الباقات",
    cashflow: "التدفق النقدي (٦ أشهر)", noData: "لا توجد بيانات",
  },
};

class I18n {
  constructor() {
    const saved = localStorage.getItem(LANG_KEY);
    this.lang = saved || "en";
  }
  get t() { return strings[this.lang] || strings.en; }

  setLang(lang) {
    this.lang = lang;
    localStorage.setItem(LANG_KEY, lang);
    applyDir(lang);
    document.dispatchEvent(new CustomEvent("langchange", { detail: lang }));
  }

  bi(en, ar) {
    // Bilingual block markup used across the design
    return this.lang === "ar"
      ? `<span class="bi-label items-start"><span class="ar" dir="ltr">${en}</span><span dir="rtl">${ar}</span></span>`
      : `<span class="bi-label items-start"><span>${en}</span><span class="ar font-arabic" dir="rtl">${ar}</span></span>`;
  }
}

export function applyDir(lang) {
  const html = document.documentElement;
  html.lang = lang;
  // The design keeps LTR structure; Arabic mode flips direction
  html.dir = lang === "ar" ? "rtl" : "ltr";
}

export function currentLang() {
  return localStorage.getItem(LANG_KEY) || "en";
}

export const i18n = new I18n();
applyDir(i18n.lang);