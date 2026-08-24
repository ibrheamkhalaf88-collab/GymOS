// Export / Import Module - تصدير واستيراد البيانات
// يدعم JSON + Excel (XLSX) مع تنسيق جميل ومرتب

// ============ تصدير JSON ============
async function exportToJSON() {
  try {
    const allData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      license: localStorage.getItem('dp_license') || 'unknown',
      members: await getCollection('members'),
      devices: await getCollection('devices'),
      ledger: await getCollection('ledger'),
      checkins: await getCollection('checkins'),
      notifications: await getCollection('notifications'),
    };

    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `digital-pulse-${formatDate()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true, type: 'json' };
  } catch (error) {
    console.error('Export JSON failed:', error);
    return { success: false, error: error.message };
  }
}

// ============ تصدير Excel (XLSX) ============
async function exportToExcel() {
  try {
    // تحميل مكتبة SheetJS من CDN (إذا لم تكن محملة)
    if (typeof XLSX === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    }

    const wb = XLSX.utils.book_new();

    // --- Sheet 1: الأعضاء ---
    const members = await getCollection('members');
    const membersData = members.map(m => ({
      'الاسم (عربي)': m.nameAr || '',
      'الاسم (English)': m.name || '',
      'رقم الهاتف': m.phone || '',
      'الباقة': translatePlan(m.plan),
      'الحالة': translateStatus(m.status),
      'الأيام المتبقية': m.daysLeft ?? '',
      'تاريخ الانضمام': m.joinDate || '',
      'آخر تسجيل دخول': m.lastCheckin || '',
      'عدد تسجيلات الدخول': m.checkins ?? '',
      'المبلغ المدفوع': m.paidAmount ?? '',
    }));
    const wsMembers = XLSX.utils.json_to_sheet(membersData);
    styleSheet(wsMembers, ['الاسم (عربي)', 'الاسم (English)', 'رقم الهاتف', 'الباقة', 'الحالة']);
    XLSX.utils.book_append_sheet(wb, wsMembers, 'الأعضاء / Members');

    // --- Sheet 2: الأجهزة ---
    const devices = await getCollection('devices');
    const devicesData = devices.map(d => ({
      'الاسم (عربي)': d.nameAr || '',
      'الاسم (English)': d.name || '',
      'النوع': d.type || '',
      'الحالة': translateDeviceStatus(d.status),
      'آخر ظهور': d.lastSeen || '',
      'الخطأ': d.error || '',
      'الموقع': d.location || '',
    }));
    const wsDevices = XLSX.utils.json_to_sheet(devicesData);
    styleSheet(wsDevices, ['الاسم (عربي)', 'الاسم (English)', 'النوع', 'الحالة']);
    XLSX.utils.book_append_sheet(wb, wsDevices, 'الأجهزة / Devices');

    // --- Sheet 3: المالية ---
    const ledger = await getCollection('ledger');
    const ledgerData = ledger.map(l => ({
      'التاريخ': l.date || '',
      'النوع': l.type === 'revenue' ? 'إيراد' : 'مصروف',
      'المبلغ': l.amount ?? 0,
      'الوصف (عربي)': l.descriptionAr || '',
      'الوصف (English)': l.description || '',
      'التصنيف': l.category || '',
    }));
    const wsLedger = XLSX.utils.json_to_sheet(ledgerData);
    styleSheet(wsLedger, ['التاريخ', 'النوع', 'المبلغ', 'الوصف (عربي)', 'الوصف (English)', 'التصنيف']);
    XLSX.utils.book_append_sheet(wb, wsLedger, 'المالية / Ledger');

    // --- Sheet 4: تسجيلات الدخول ---
    const checkins = await getCollection('checkins');
    const checkinsData = checkins.map(c => ({
      'التاريخ': c.date ? new Date(c.date).toLocaleDateString('en-GB') : '',
      'العدد': c.count ?? 0,
    }));
    const wsCheckins = XLSX.utils.json_to_sheet(checkinsData);
    styleSheet(wsCheckins, ['التاريخ', 'العدد']);
    XLSX.utils.book_append_sheet(wb, wsCheckins, 'تسجيلات الدخول / Check-ins');

    // --- Sheet 5: ملخص ---
    const stats = await computeStats(members, devices, ledger, checkins);
    const summaryData = [
      { 'المؤشر': 'إجمالي الأعضاء', 'القيمة': members.length },
      { 'المؤشر': 'الأعضاء النشطين', 'القيمة': members.filter(m => m.status === 'active' || m.status === 'trial').length },
      { 'المؤشر': 'الأعضاء المنتهية', 'القيمة': members.filter(m => m.status === 'expired').length },
      { 'المؤشر': 'الأجهزة المتصلة', 'القيمة': devices.filter(d => d.status === 'online').length },
      { 'المؤشر': 'الأجهزة المتوقفة', 'القيمة': devices.filter(d => d.status === 'offline').length },
      { 'المؤشر': 'إجمالي الإيرادات', 'القيمة': stats.totalRevenue },
      { 'المؤشر': 'إجمالي المصروفات', 'القيمة': stats.totalExpenses },
      { 'المؤشر': 'صافي الربح', 'القيمة': stats.totalRevenue - stats.totalExpenses },
      { 'المؤشر': 'تاريخ التصدير', 'القيمة': new Date().toLocaleString('en-GB') },
      { 'المؤشر': 'كود التفعيل', 'القيمة': localStorage.getItem('dp_license') || 'غير معروف' },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    styleSheet(wsSummary, ['المؤشر', 'القيمة']);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص / Summary');

    // حفظ الملف
    XLSX.writeFile(wb, `digital-pulse-${formatDate()}.xlsx`);
    return { success: true, type: 'xlsx' };
  } catch (error) {
    console.error('Export Excel failed:', error);
    return { success: false, error: error.message };
  }
}

// ============ استيراد JSON ============
async function importFromJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.version) {
      return { success: false, error: 'ملف غير صالح: لا يوجد رقم إصدار' };
    }

    // تأكيد من المستخدم
    const confirmImport = window.confirm(
      '⚠️ هل أنت متأكد من استيراد البيانات؟\nسيتم استبدال جميع البيانات الحالية!'
    );
    if (!confirmImport) return { success: false, error: 'تم الإلغاء' };

    // تحميل كل مجموعة
    const collections = ['members', 'devices', 'ledger', 'checkins', 'notifications'];
    for (const col of collections) {
      if (Array.isArray(data[col])) {
        localStorage.setItem(`dp_${col}`, JSON.stringify(data[col]));
      }
    }

    return { success: true, collections: collections.length };
  } catch (error) {
    console.error('Import failed:', error);
    return { success: false, error: error.message };
  }
}

// ============ استيراد Excel ============
async function importFromExcel(file) {
  try {
    if (typeof XLSX === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    }

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });

    // قراءة كل الـ sheets وتحويلها للـ format الصحيح
    const imported = {};

    if (wb.SheetNames.includes('الأعضاء / Members')) {
      const ws = wb.Sheets['الأعضاء / Members'];
      imported.members = XLSX.utils.sheet_to_json(ws).map(row => ({
        name: row['الاسم (English)'] || row['الاسم (عربي)'] || '',
        nameAr: row['الاسم (عربي)'] || row['الاسم (English)'] || '',
        phone: row['رقم الهاتف'] || '',
        plan: reversePlan(row['الباقة']),
        status: reverseStatus(row['الحالة']),
        daysLeft: row['الأيام المتبقية'] || 0,
        joinDate: row['تاريخ الانضمام'] || '',
        lastCheckin: row['آخر تسجيل دخول'] || '',
        checkins: row['عدد تسجيلات الدخول'] || 0,
        paidAmount: row['المبلغ المدفوع'] || 0,
      }));
    }

    if (wb.SheetNames.includes('الأجهزة / Devices')) {
      const ws = wb.Sheets['الأجهزة / Devices'];
      imported.devices = XLSX.utils.sheet_to_json(ws).map(row => ({
        name: row['الاسم (English)'] || row['الاسم (عربي)'] || '',
        nameAr: row['الاسم (عربي)'] || row['الاسم (English)'] || '',
        type: row['النوع'] || '',
        status: reverseDeviceStatus(row['الحالة']),
        lastSeen: row['آخر ظهور'] || '',
        error: row['الخطأ'] || '',
        location: row['الموقع'] || '',
      }));
    }

    if (wb.SheetNames.includes('المالية / Ledger')) {
      const ws = wb.Sheets['المالية / Ledger'];
      imported.ledger = XLSX.utils.sheet_to_json(ws).map(row => ({
        date: row['التاريخ'] || '',
        type: row['النوع'] === 'إيراد' ? 'revenue' : 'expense',
        amount: row['المبلغ'] || 0,
        description: row['الوصف (English)'] || row['الوصف (عربي)'] || '',
        descriptionAr: row['الوصف (عربي)'] || row['الوصف (English)'] || '',
        category: row['التصنيف'] || '',
      }));
    }

    // تأكيد
    const confirmImport = window.confirm(
      `⚠️ هل أنت متأكد من استيراد البيانات؟\nسيتم استبدال ${Object.keys(imported).length} مجموعات`
    );
    if (!confirmImport) return { success: false, error: 'تم الإلغاء' };

    // حفظ في localStorage
    Object.entries(imported).forEach(([key, value]) => {
      localStorage.setItem(`dp_${key}`, JSON.stringify(value));
    });

    return { success: true, collections: Object.keys(imported).length };
  } catch (error) {
    console.error('Import Excel failed:', error);
    return { success: false, error: error.message };
  }
}

// ============ Helpers ============
async function getCollection(name) {
  const stored = localStorage.getItem(`dp_${name}`);
  if (stored) return JSON.parse(stored);

  // إن لم تكن موجودة، إرجاع مصفوفة فارغة
  return [];
}

async function computeStats(members, devices, ledger, checkins) {
  return {
    totalRevenue: ledger.filter(l => l.type === 'revenue').reduce((s, l) => s + (l.amount || 0), 0),
    totalExpenses: ledger.filter(l => l.type === 'expense').reduce((s, l) => s + (l.amount || 0), 0),
  };
}

function formatDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function styleSheet(ws, headerCols) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);

  // عرض الأعمدة تلقائياً
  const colWidths = headerCols.map(() => ({ wch: 18 }));
  if (colWidths.length > 0) {
    ws['!cols'] = colWidths;
  }
}

function translatePlan(plan) {
  const map = { basic: 'أساسي', pro: 'محترف', enterprise: 'مؤسسي' };
  return map[plan] || plan || '';
}

function reversePlan(name) {
  const map = { 'أساسي': 'basic', 'محترف': 'pro', 'مؤسسي': 'enterprise', 'Basic': 'basic', 'Pro': 'pro', 'Enterprise': 'enterprise' };
  return map[name] || 'basic';
}

function translateStatus(status) {
  const map = { active: 'نشط', expired: 'منتهي', trial: 'تجريبي' };
  return map[status] || status || '';
}

function reverseStatus(name) {
  const map = { 'نشط': 'active', 'منتهي': 'expired', 'تجريبي': 'trial', 'Active': 'active', 'Expired': 'expired', 'Trial': 'trial' };
  return map[name] || 'active';
}

function translateDeviceStatus(status) {
  const map = { online: 'متصل', offline: 'متوقف', warning: 'تحذير' };
  return map[status] || status || '';
}

function reverseDeviceStatus(name) {
  const map = { 'متصل': 'online', 'متوقف': 'offline', 'تحذير': 'warning' };
  return map[name] || 'offline';
}

// ============ التصدير ============
export const dataIO = {
  exportToJSON,
  exportToExcel,
  importFromJSON,
  importFromExcel,
};