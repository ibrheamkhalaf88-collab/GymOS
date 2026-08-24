// i18n - bilingual English/Arabic support with RTL switching
import { appConfig } from './config.js';

const translations = {
  en: {
    // Branding
    brandName: 'DIGITAL PULSE',
    brandTagline: 'Membership & Facility Manager',

    // Navigation
    nav: { dashboard: 'Dashboard', roster: 'Members', hardware: 'Devices', ledger: 'Finances', settings: 'Settings' },

    // Common
    search: 'Search...',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    close: 'Close',
    loading: 'Loading...',
    retry: 'Retry',
    confirm: 'Confirm',
    yes: 'Yes',
    no: 'No',

    // Dashboard
    activeMembers: 'Active Members',
    endedToday: 'Ended Today',
    totalExpired: 'Total Expired',
    maintAlert: 'Maint. Alert',
    checkins: 'CHECK-INS',
    systemFeed: 'SYSTEM FEED',
    viewAll: 'View all',

    // Roster
    rosterDb: 'ROSTER DB',
    searchDb: 'SEARCH DB...',
    active: 'ACTIVE',
    expired: 'EXPIRED',
    trial: 'TRIAL',
    daysLeft: 'days left',
    renew: 'RENEW',

    // Member form
    addMember: 'Add Member',
    editMember: 'Edit Member',
    memberName: 'Full Name',
    phone: 'Phone Number',
    plan: 'Plan',
    planBasic: 'Basic',
    planPro: 'Pro',
    planEnterprise: 'Enterprise',

    // Hardware
    systemHealth: 'SYSTEM HEALTH',
    onlineDevices: 'Online Devices',
    offlineDevices: 'Offline Devices',
    alerts: 'ALERTS',
    equipment: 'EQUIPMENT',
    addEquipment: 'إضافة جهاز',
    deviceName: 'اسم الجهاز',
    deviceType: 'نوع الجهاز',
    statusPending: 'بانتظار',
    statusInRepair: 'قيد الإصلاح',
    statusCompleted: 'تم',
    cost: 'التكلفة الكلية',
    amountPaid: 'المبلغ المدفوع',
    monthlyRevenue: 'MONTHLY RECURRING REVENUE',
    thisMonth: 'This Month',
    vsLastMonth: 'vs last month',
    revenue: 'Revenue',
    expenses: 'Expenses',

    // Auth
    login: 'Login',
    signup: 'Create Account',
    logout: 'Log Out',
    email: 'Email',
    password: 'Password',
    fullName: 'Full Name',
    welcomeBack: 'Welcome back',
    createAccount: 'Create your account',
    licenseKey: '6-Digit License Key',

    // Settings
    profile: 'Profile',
    viewProfile: 'View Profile',
    preferences: 'Preferences',
    language: 'Language',
    languageEnglish: 'English',
    languageArabic: 'العربية',
    theme: 'Theme',
    notifications: 'Notifications',
    security: 'Security',
    changePassword: 'Change Password',

    // Toasts
    saved: 'Saved successfully',
    deleted: 'Deleted successfully',
    error: 'Something went wrong',
    loginSuccess: 'Logged in successfully',
    welcome: 'Welcome!'
  },

  ar: {
    brandName: 'النبض الرقمي',
    brandTagline: 'مدير العضويات والمنشآت',

    nav: { dashboard: 'الرئيسية', roster: 'الأعضاء', hardware: 'الأجهزة', ledger: 'المالية', settings: 'الإعدادات' },

    search: 'بحث...',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    add: 'إضافة',
    close: 'إغلاق',
    loading: 'جارٍ التحميل...',
    retry: 'إعادة المحاولة',
    confirm: 'تأكيد',
    yes: 'نعم',
    no: 'لا',

    activeMembers: 'الأعضاء النشطين',
    endedToday: 'انتهت اليوم',
    totalExpired: 'إجمالي المنتهية',
    maintAlert: 'تنبيه صيانة',
    checkins: 'تسجيلات الدخول',
    systemFeed: 'سجل النظام',
    viewAll: 'عرض الكل',

    rosterDb: 'قاعدة البيانات',
    searchDb: 'بحث في قاعدة البيانات...',
    active: 'نشط',
    expired: 'منتهي',
    trial: 'تجريبي',
    daysLeft: 'يوم متبقي',
    renew: 'تجديد',

    addMember: 'إضافة عضو',
    editMember: 'تعديل العضو',
    memberName: 'الاسم الكامل',
    phone: 'رقم الهاتف',
    plan: 'الباقة',
    planBasic: 'أساسية',
    planPro: 'احترافية',
    planEnterprise: 'مؤسسية',

    systemHealth: 'صحة النظام',
    onlineDevices: 'أجهزة متصلة',
    offlineDevices: 'أجهزة متوقفة',
    alerts: 'تنبيهات',
    equipment: 'المعدات',

    monthlyRevenue: 'الإيرادات الشهرية المتكررة',
    thisMonth: 'هذا الشهر',
    vsLastMonth: 'مقارنة بالشهر الماضي',
    revenue: 'الإيرادات',
    expenses: 'المصروفات',

    login: 'تسجيل الدخول',
    signup: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    fullName: 'الاسم الكامل',
    welcomeBack: 'مرحباً بعودتك',
    createAccount: 'أنشئ حسابك',
    licenseKey: 'مفتاح الترخيص (٦ أرقام)',

    profile: 'الملف الشخصي',
    viewProfile: 'عرض الملف الشخصي',
    preferences: 'التفضيلات',
    language: 'اللغة',
    languageEnglish: 'English',
    languageArabic: 'العربية',
    theme: 'المظهر',
    notifications: 'الإشعارات',
    security: 'الأمان',
    changePassword: 'تغيير كلمة المرور',

    saved: 'تم الحفظ بنجاح',
    deleted: 'تم الحذف بنجاح',
    error: 'حدث خطأ ما',
    loginSuccess: 'تم تسجيل الدخول',
    welcome: 'أهلاً بك!'
  }
};

class I18n {
  constructor() {
    this.lang = localStorage.getItem('dp_lang') || appConfig.language;
  }

  get t() {
    return translations[this.lang] || translations[appConfig.language];
  }

  setLang(lang) {
    this.lang = lang;
    localStorage.setItem('dp_lang', lang);
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }

  tKey(key) {
    return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : key), this.t);
  }

  // Translate all elements with data-i18n attributes
  apply() {
    const html = document.documentElement;
    html.lang = this.lang;
    html.dir = this.lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = this.tKey(key);
      if (text) el.textContent = text;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = this.tKey(key);
      if (text) el.placeholder = text;
    });
  }

  isRTL() {
    return this.lang === 'ar';
  }
}

export const i18n = new I18n();