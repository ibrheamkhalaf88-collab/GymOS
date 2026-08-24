// Main app shell - navigation, screen routing, shared layout
import { license } from './license.js';
import { data } from './data.js';
import { i18n } from './i18n.js';
import { showToast, openModal, closeModal, initials, escapeHtml, confirmDialog } from './ui.js';
import { dataIO } from './export.js';

class App {
  constructor() {
    this.currentScreen = 'dashboard';
    this.screens = {};
    this.lastDeleted = null; // Store last deleted item for undo
  }

  init() {
    // Apply language
    i18n.apply();

    // Check license activation
    if (!license.checkActivation()) {
      return;
    }

    // Register screens
    this.registerScreens();

    // Build nav
    this.buildNav();

    // Show default screen
    this.showScreen('dashboard');

    // Notifications handler
    const notifBtn = document.getElementById('notif-btn');
    if (notifBtn) notifBtn.onclick = () => {
      const dropdown = document.getElementById('notif-dropdown');
      if (dropdown) {
        dropdown.classList.toggle('is-open');
        if (dropdown.classList.contains('is-open')) {
          this.renderNotifications();
        }
      }
    };

    // FAB handler
    const fabBtn = document.getElementById('add-member-fab');
    if (fabBtn) fabBtn.onclick = () => this.openAddMemberModal();

    // Add device button handler
    const addDeviceBtn = document.getElementById('add-device-btn');
    if (addDeviceBtn) addDeviceBtn.onclick = () => this.openAddDeviceModal();

    // Search handler
    const searchInput = document.getElementById('roster-search');
    if (searchInput) {
      searchInput.onkeyup = (e) => this.handleSearch(e.target.value);
      searchInput.oninput = (e) => this.handleSearch(e.target.value);
    }

    // Filter pills handler
    document.querySelectorAll('#roster-filter-pills .pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('#roster-filter-pills .pill').forEach(p => p.classList.remove('is-active'));
        pill.classList.add('is-active');
        this.handleFilter(pill.dataset.status);
      };
    });

    // Profit period selector
    const profitPeriod = document.getElementById('profit-period');
    if (profitPeriod) profitPeriod.onchange = () => this.updateProfitSummary();

    // Data management listeners
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.onclick = () => this.exportData();

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.onclick = () => this.handleReset();
  }

  // ============ SEARCH & FILTER ============
  handleSearch(query) {
    query = query.toLowerCase().trim();
    const rows = document.querySelectorAll('#roster-list .roster-row');
    rows.forEach(row => {
      const name = row.querySelector('.roster-name')?.textContent?.toLowerCase() || '';
      const phone = row.querySelector('.roster-sub')?.textContent?.toLowerCase() || '';
      const match = name.includes(query) || phone.includes(query);
      row.style.display = match ? '' : 'none';
    });
  }

  handleFilter(status) {
    const rows = document.querySelectorAll('#roster-list .roster-row');
    rows.forEach(row => {
      const statusAttr = row.dataset.status || 'active';
      row.style.display = (status === 'all' || statusAttr === status) ? '' : 'none';
    });
  }

  // ============ ADD MEMBER ============
  async openAddMemberModal() {
    const content = `
      <div class="modal-content">
        <h3 class="modal-title">${i18n.lang === 'ar' ? 'إضافة عضو جديد' : 'Add New Member'}</h3>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
          <input type="text" id="new-member-name-ar" class="form-input" dir="auto" placeholder="${i18n.lang === 'ar' ? 'أدخل الاسم بالعربي' : 'Arabic name'}">
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
          <input type="text" id="new-member-name" class="form-input" placeholder="${i18n.lang === 'ar' ? 'English name' : 'English name'}">
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'}</label>
          <input type="tel" id="new-member-phone" class="form-input" dir="ltr" placeholder="${i18n.lang === 'ar' ? '05xxxxxxxx' : '05xxxxxxxx'}">
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'الباقة' : 'Plan'}</label>
          <select id="new-member-plan" class="form-input">
            <option value="basic">${i18n.lang === 'ar' ? 'أساسي - 30 يوم' : 'Basic - 30 days'}</option>
            <option value="pro">${i18n.lang === 'ar' ? 'محترف - 90 يوم' : 'Pro - 90 days'}</option>
            <option value="enterprise">${i18n.lang === 'ar' ? 'مؤسسي - 180 يوم' : 'Enterprise - 180 days'}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'المبلغ المدفوع' : 'Paid Amount'}</label>
          <input type="number" id="new-member-amount" class="form-input" dir="ltr" placeholder="0">
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'تاريخ الانضمام' : 'Join Date'}</label>
          <input type="date" id="new-member-join-date" class="form-input" dir="ltr">
        </div>

        <div class="form-actions">
          <button class="btn btn-secondary" id="cancel-add-member">${i18n.lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button class="btn btn-primary" id="confirm-add-member">${i18n.lang === 'ar' ? 'إضافة' : 'Add'}</button>
        </div>
      </div>
    `;

    // Set today's date as default
    document.getElementById('new-member-join-date').value = new Date().toISOString().split('T')[0];

    const overlay = openModal(content);

    const closeFn = () => { if (overlay) overlay.remove(); };
    document.getElementById('cancel-add-member').onclick = closeFn;
    document.getElementById('confirm-add-member').onclick = () => this.saveNewMember(closeFn);
  }

  async saveNewMember(closeFn) {
    const nameAr = document.getElementById('new-member-name-ar')?.value?.trim();
    const name = document.getElementById('new-member-name')?.value?.trim() || nameAr;
    const phone = document.getElementById('new-member-phone')?.value?.trim();
    const plan = document.getElementById('new-member-plan')?.value || 'basic';
    const paidAmount = parseFloat(document.getElementById('new-member-amount')?.value) || 0;
    const joinDate = document.getElementById('new-member-join-date')?.value || new Date().toISOString().split('T')[0];

    if (!nameAr || !phone) {
      showToast(i18n.lang === 'ar' ? 'الرجاء إدخال الاسم ورقم الهاتف' : 'Please enter name and phone', 'error');
      return;
    }

    // Calculate days based on plan
    const planDays = { basic: 30, pro: 90, enterprise: 180 };
    const daysLeft = planDays[plan] || 30;

    const member = {
      id: 'mem_' + Date.now(),
      nameAr,
      name,
      phone,
      plan,
      status: 'active',
      daysLeft,
      joinDate,
      joinDate: new Date().toISOString().split('T')[0],
      lastCheckin: null,
      checkins: 0,
      paidAmount,
      createdAt: new Date().toISOString()
    };

    await data.create('members', member);
    if (closeFn) closeFn();
    showToast(i18n.lang === 'ar' ? 'تم إضافة العضو بنجاح' : 'Member added successfully', 'success');
    this.renderRoster();
  }

  // ============ ADD DEVICE ============
  async openAddDeviceModal() {
    const content = `
      <div class="modal-content">
        <h3 class="modal-title">${i18n.lang === 'ar' ? 'إضافة جهاز' : 'Add Device'}</h3>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'اسم الجهاز' : 'Device Name'}</label>
          <input type="text" id="new-device-name" class="form-input" placeholder="${i18n.lang === 'ar' ? 'اسم الجهاز' : 'Device name'}">
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'نوع الجهاز' : 'Device Type'}</label>
          <select id="new-device-type" class="form-input">
            <option value="ps5">${i18n.lang === 'ar' ? 'بلايستيشن 5' : 'PlayStation 5'}</option>
            <option value="ps4">${i18n.lang === 'ar' ? 'بلايستيشن 4' : 'PlayStation 4'}</option>
            <option value="xbox">${i18n.lang === 'ar' ? 'إكس بوكس' : 'Xbox'}</option>
            <option value="pc">${i18n.lang === 'ar' ? 'كمبيوتر' : 'PC'}</option>
            <option value="vr">${i18n.lang === 'ar' ? 'واقع افتراضي' : 'VR'}</option>
            <option value="other">${i18n.lang === 'ar' ? 'أخرى' : 'Other'}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'الحالة' : 'Status'}</label>
          <select id="new-device-status" class="form-input">
            <option value="pending">${i18n.lang === 'ar' ? 'بانتظار' : 'Pending'}</option>
            <option value="inrepair">${i18n.lang === 'ar' ? 'قيد الإصلاح' : 'In Repair'}</option>
            <option value="completed">${i18n.lang === 'ar' ? 'تم' : 'Completed'}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'التكلفة الكلية' : 'Total Cost'}</label>
          <input type="number" id="new-device-cost" class="form-input" dir="ltr" placeholder="0">
        </div>

        <div class="form-group">
          <label class="form-label">${i18n.lang === 'ar' ? 'المبلغ المدفوع' : 'Amount Paid'}</label>
          <input type="number" id="new-device-paid" class="form-input" dir="ltr" placeholder="0">
        </div>

        <div class="form-actions">
          <button class="btn btn-secondary" id="cancel-add-device">${i18n.lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button class="btn btn-primary" id="confirm-add-device">${i18n.lang === 'ar' ? 'إضافة' : 'Add'}</button>
        </div>
      </div>
    `;

    const overlay = openModal(content);

    const closeFn = () => { if (overlay) overlay.remove(); };
    document.getElementById('cancel-add-device').onclick = closeFn;
    document.getElementById('confirm-add-device').onclick = () => this.saveNewDevice(closeFn);
  }

  async saveNewDevice(closeFn) {
    const name = document.getElementById('new-device-name')?.value?.trim();
    const type = document.getElementById('new-device-type')?.value || 'other';
    const status = document.getElementById('new-device-status')?.value || 'pending';
    const cost = parseFloat(document.getElementById('new-device-cost')?.value) || 0;
    const paid = parseFloat(document.getElementById('new-device-paid')?.value) || 0;

    if (!name) {
      showToast(i18n.lang === 'ar' ? 'الرجاء إدخال اسم الجهاز' : 'Please enter device name', 'error');
      return;
    }

    const device = {
      id: 'dev_' + Date.now(),
      name,
      nameAr: name,
      type,
      status,
      cost,
      paid,
      remaining: cost - paid,
      location: i18n.lang === 'ar' ? 'قسم الصيانة' : 'Repair Section',
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    await data.create('devices', device);

    if (cost > 0) {
      const expense = {
        id: 'exp_' + Date.now(),
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        amount: cost,
        description: i18n.lang === 'ar' ? `جهاز: ${name}` : `Device: ${name}`,
        descriptionAr: i18n.lang === 'ar' ? `جهاز: ${name}` : `Device: ${name}`,
        category: 'devices'
      };
      await data.create('ledger', expense);
    }

    if (closeFn) closeFn();
    showToast(i18n.lang === 'ar' ? 'تم إضافة الجهاز بنجاح' : 'Device added successfully', 'success');
    this.renderHardware();
  }

  // ============ NOTIFICATIONS ============
  async renderNotifications() {
    const list = document.getElementById('notif-list');
    const badge = document.getElementById('notif-badge');
    if (!list) return;

    const notifs = await data.fetchAll('notifications');
    const unread = notifs.filter(n => !n.read).length;

    if (badge) {
      badge.textContent = unread > 0 ? String(unread) : '';
      badge.style.display = unread > 0 ? 'flex' : 'none';
    }

    if (!notifs.length) {
      list.innerHTML = `<div class="notif-empty">${i18n.lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}</div>`;
      return;
    }

    list.innerHTML = notifs.map(n => {
      const icon = n.type === 'warning' ? 'warning' : n.type === 'success' ? 'check' : 'info';
      const iconColor = n.type === 'warning' ? 'var(--orange)' : n.type === 'success' ? 'var(--lime)' : 'var(--text-dim)';
      return `
        <div class="notif-item ${n.read ? 'is-read' : ''}" data-id="${n.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="1.6" style="width:18px; height:18px; flex-shrink:0;">
            <circle cx="12" cy="12" r="10"/>
          </svg>
          <div class="notif-main">
            <div class="notif-title">${i18n.isRTL() ? (n.titleAr || n.title) : n.title}</div>
            <div class="notif-desc">${i18n.isRTL() ? (n.descAr || n.description) : n.description}</div>
            <div class="notif-time">${n.time || ''}</div>
          </div>
        </div>
      `;
    }).join('');

    // Mark as read on click
    list.querySelectorAll('.notif-item').forEach(item => {
      item.onclick = async () => {
        const id = item.dataset.id;
        const n = notifs.find(x => x.id === id);
        if (n && !n.read) {
          await data.update('notifications', id, { read: true });
          this.renderNotifications();
        }
      };
    });
  }

  async handleReset() {
    const confirm1 = await confirmDialog(i18n.lang === 'ar'
      ? 'هل أنت متأكد؟ سيتم حذف جميع البيانات نهائياً!'
      : 'Are you sure? ALL DATA will be permanently deleted!');

    if (!confirm1) return;

    const confirm2 = await confirmDialog(i18n.lang === 'ar'
      ? 'تحذير أخير: لا يمكن التراجع عن هذه العملية. هل تود المتابعة؟'
      : 'FINAL WARNING: This cannot be undone. Do you want to proceed?');

    if (confirm2) {
      await data.resetAllData();
      showToast(i18n.lang === 'ar' ? 'تمت إعادة تعيين البيانات' : 'Data reset successfully', 'success');
      window.location.reload();
    }
  }

  async exportData() {
    const allData = {
      members: await data.fetchAll('members'),
      devices: await data.fetchAll('devices'),
      ledger: await data.fetchAll('ledger'),
      checkins: await data.fetchAll('checkins'),
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `digital-pulse-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast(i18n.lang === 'ar' ? 'تم تصدير البيانات' : 'Data exported successfully');
  }

  registerScreens() {
    this.screens = {
      dashboard: { el: document.getElementById('screen-dashboard'), render: () => this.renderDashboard() },
      roster: { el: document.getElementById('screen-roster'), render: () => this.renderRoster() },
      hardware: { el: document.getElementById('screen-hardware'), render: () => this.renderHardware() },
      ledger: { el: document.getElementById('screen-ledger'), render: () => this.renderLedger() },
      settings: { el: document.getElementById('screen-settings'), render: () => this.renderSettings() }
    };
  }

  buildNav() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    const items = [
      { id: 'dashboard', icon: 'M3 12 12 3l9 9M5 10v10h14V10', label: 'nav.dashboard', color: '#22c55e' },
      { id: 'roster', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', label: 'nav.roster', color: '#ccff00' },
      { id: 'hardware', icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2zM9 9h6v6H9V9z', label: 'nav.hardware', color: '#a78bfa' },
      { id: 'ledger', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', label: 'nav.ledger', color: '#f97316' },
      { id: 'settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z', label: 'nav.settings', color: '#8a8a8a' }
    ];

    nav.innerHTML = items.map(item => `
      <button class="nav-btn" data-target="${item.id}" data-color="${item.color}">
        <svg viewBox="0 0 24 24" fill="none" stroke="${item.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="nav-icon">
          <path d="${item.icon}"/>
        </svg>
        <span data-i18n="${item.label}">${i18n.tKey(item.label)}</span>
      </button>
    `).join('');

    nav.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.showScreen(btn.dataset.target));
    });
  }

  showScreen(name) {
    Object.entries(this.screens).forEach(([id, screen]) => {
      if (!screen.el) return;
      screen.el.hidden = id !== name;
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.target === name);
    });

    this.currentScreen = name;
    if (this.screens[name]?.render) this.screens[name].render();
  }

  setupGlobalListeners() {
    // Close dropdowns on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('.dropdown-wrap')) {
        document.querySelectorAll('.dropdown.is-open').forEach(d => d.classList.remove('is-open'));
      }
    });
  }

  // ============ DASHBOARD ============
  async renderDashboard() {
    const stats = await data.getStats();
    const notifs = await data.fetchAll('notifications');

    document.getElementById('stat-active').textContent = stats.activeMembers;
    document.getElementById('stat-ended-today').textContent = stats.endedToday;
    document.getElementById('stat-expired').textContent = stats.totalExpired;
    document.getElementById('stat-alerts').textContent = stats.alerts;

    // Calculate and display profit summary
    await this.updateProfitSummary();

    // Render chart
    this.renderChart(stats.checkinData);
  }

  // ============ PROFIT SUMMARY ============
  async updateProfitSummary() {
    const period = document.getElementById('profit-period')?.value || 'month';
    const allLedger = await data.fetchAll('ledger');

    const now = new Date();
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    let filteredLedger = allLedger;

    if (period === 'month') {
      filteredLedger = allLedger.filter(e => new Date(e.date) >= monthAgo);
    } else if (period === '3months') {
      filteredLedger = allLedger.filter(e => new Date(e.date) >= threeMonthsAgo);
    } else if (period === '6months') {
      filteredLedger = allLedger.filter(e => new Date(e.date) >= sixMonthsAgo);
    } else if (period === 'year') {
      filteredLedger = allLedger.filter(e => new Date(e.date) >= yearAgo);
    }
    // 'all' keeps all data

    const revenue = filteredLedger.filter(e => e.type === 'revenue').reduce((sum, e) => sum + (e.amount || 0), 0);
    const expenses = filteredLedger.filter(e => e.type === 'expense').reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = revenue - expenses;

    document.getElementById('stat-profit').textContent = '$' + netProfit.toLocaleString();
  }

  renderChart(dataPoints) {
    const svg = document.getElementById('checkins-chart');
    if (!svg) return;
    const w = 320, hMax = 150, hMin = 20;
    const step = w / (dataPoints.length - 1);
    const points = dataPoints.map((v, i) => ({
      x: Math.round(i * step),
      y: Math.round(hMax - (v / 100) * (hMax - hMin))
    }));

    const polyStr = points.map(p => `${p.x},${p.y}`).join(' ');
    const areaStr = `M${polyStr.replace(/ /g, ' L')} L${w},${hMax} L0,${hMax} Z`;

    const area = svg.querySelector('#chart-area');
    const line = svg.querySelector('#chart-line');
    const dots = svg.querySelector('#chart-dots');
    if (area) area.setAttribute('d', areaStr);
    if (line) line.setAttribute('points', polyStr);
    if (dots) {
      dots.innerHTML = points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3.5"/>`).join('');
    }
  }

  // ============ ROSTER ============
  async renderRoster() {
    const members = await data.fetchAll('members');
    const list = document.getElementById('roster-list');
    if (!list) return;

    list.innerHTML = members.map(m => {
      const sub = this.daysLabel(m.daysLeft);
      const dotClass = sub.cls === 'danger' ? 'pink' : sub.cls === 'warn' ? 'orange' : 'lime';
      return `
        <div class="roster-row" data-id="${m.id}">
          <div class="avatar-box ${sub.cls === 'warn' ? 'avatar-box--warn' : ''}">${initials(m.name)}</div>
          <div class="roster-main">
            <div class="roster-name">${escapeHtml(m.name)}</div>
            <div class="roster-sub">${escapeHtml(m.phone)} · ${m.plan}</div>
          </div>
          <div class="roster-status ${sub.cls}">
            ${sub.text}
            <span class="dot ${dotClass}" style="margin-top:4px; display:inline-block;"></span>
          </div>
        </div>`;
    }).join('');

    // Click to open member detail
    list.querySelectorAll('.roster-row').forEach(row => {
      row.addEventListener('click', () => this.openMemberModal(row.dataset.id));
    });
  }

  daysLabel(days) {
    if (days < 0) return { text: i18n.lang === 'ar' ? 'منتهي' : 'EXPIRED', cls: 'danger' };
    if (days <= 3) return { text: `${days}d ${i18n.lang === 'ar' ? 'متبقي' : 'left'}`, cls: 'danger' };
    if (days <= 14) return { text: `${days}d ${i18n.lang === 'ar' ? 'متبقي' : 'left'}`, cls: 'warn' };
    return { text: `${days}d ${i18n.lang === 'ar' ? 'متبقي' : 'left'}`, cls: 'ok' };
  }

  async openMemberModal(id) {
    const member = await data.fetchOne('members', id);
    if (!member) {
      showToast(i18n.lang === 'ar' ? 'العضو غير موجود' : 'Member not found', 'error');
      return;
    }

    const content = `
      <div class="modal-head">
        <h3 class="modal-title">${escapeHtml(member.name)}</h3>
        <button class="modal-close" id="member-modal-close">×</button>
      </div>

      <div class="member-details">
        <div class="detail-row">
          <span class="detail-label">${i18n.lang === 'ar' ? 'الهاتف' : 'Phone'}</span>
          <span class="detail-value">${escapeHtml(member.phone || '')}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${i18n.lang === 'ar' ? 'الباقة' : 'Plan'}</span>
          <span class="detail-value">${member.plan}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${i18n.lang === 'ar' ? 'تاريخ الانضمام' : 'Join Date'}</span>
          <span class="detail-value">${member.joinDate || '—'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${i18n.lang === 'ar' ? 'الأيام المتبقية' : 'Days Left'}</span>
          <span class="detail-value">${member.daysLeft}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">${i18n.lang === 'ar' ? 'الحالة' : 'Status'}</span>
          <span class="detail-value">${member.status}</span>
        </div>
      </div>

      <div class="form-actions" style="margin-top:20px;">
        <button class="btn btn-secondary" id="member-modal-close-2">${i18n.lang === 'ar' ? 'إغلاق' : 'Close'}</button>
        <button class="btn btn-danger" id="member-delete-btn">${i18n.lang === 'ar' ? 'حذف' : 'Delete'}</button>
      </div>
    `;

    const overlay = openModal(content);
    const closeFn = () => { if (overlay) overlay.remove(); };

    document.getElementById('member-modal-close').onclick = closeFn;
    document.getElementById('member-modal-close-2').onclick = closeFn;
    document.getElementById('member-delete-btn').onclick = () => {
      closeFn();
      this.deleteMember(id, member);
    };
  }

  async deleteMember(id, member) {
    if (!await confirmDialog(i18n.lang === 'ar'
      ? `هل تريد حذف ${member.name}؟`
      : `Delete ${member.name}?`)) {
      return;
    }

    const result = await data.delete('members', id);
    this.lastDeleted = { collection: 'members', item: result.item };

    showToast(
      i18n.lang === 'ar' ? 'تم حذف العضو' : 'Member deleted',
      'success',
      {
        label: i18n.lang === 'ar' ? 'تراجع' : 'UNDO',
        onClick: () => this.undoDelete()
      }
    );

    this.renderRoster();
  }

  async undoDelete() {
    if (!this.lastDeleted) return;
    await data.restore(this.lastDeleted.collection, this.lastDeleted.item);
    this.lastDeleted = null;
    showToast(i18n.lang === 'ar' ? 'تمت الاستعادة' : 'Restored successfully', 'success');
    this.renderRoster();
  }

  // ============ HARDWARE ============
  async renderHardware() {
    const devices = await data.fetchAll('devices');
    const list = document.getElementById('equip-list');
    if (!list) return;

    list.innerHTML = devices.map(d => {
      const statusColor = d.status === 'online' ? 'green' : d.status === 'offline' ? 'red' : 'orange';
      const statusLabel = i18n.lang === 'ar'
        ? (d.status === 'pending' ? 'بانتظار' : d.status === 'inrepair' ? 'قيد الإصلاح' : d.status === 'completed' ? 'تم' : d.status)
        : (d.status === 'pending' ? 'Pending' : d.status === 'inrepair' ? 'In Repair' : d.status === 'completed' ? 'Completed' : d.status);
      return `
        <div class="equip-row" data-id="${d.id}">
          <div class="equip-main">
            <div class="roster-name">${i18n.isRTL() ? d.nameAr : d.name}</div>
            <div class="roster-sub">${d.location || (i18n.lang === 'ar' ? 'قسم الصيانة' : 'Repair Section')}</div>
          </div>
          <div class="roster-status">
            <span class="dot ${statusColor}"></span>
            ${statusLabel}
            <button class="row-delete-btn" data-id="${d.id}" title="${i18n.lang === 'ar' ? 'حذف' : 'Delete'}">×</button>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.row-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteDevice(btn.dataset.id);
      });
    });
  }

  async deleteDevice(id) {
    const device = await data.fetchOne('devices', id);
    if (!device) return;

    if (!await confirmDialog(i18n.lang === 'ar'
      ? `هل تريد حذف ${device.name}؟`
      : `Delete ${device.name}?`)) {
      return;
    }

    const result = await data.delete('devices', id);
    this.lastDeleted = { collection: 'devices', item: result.item };

    showToast(
      i18n.lang === 'ar' ? 'تم حذف الجهاز' : 'Device deleted',
      'success',
      {
        label: i18n.lang === 'ar' ? 'تراجع' : 'UNDO',
        onClick: () => this.undoDelete()
      }
    );

    this.renderHardware();
  }

  // ============ LEDGER ============
  async renderLedger() {
    const entries = await data.fetchAll('ledger');
    const totalRevenue = entries.filter(e => e.type === 'revenue').reduce((s, e) => s + e.amount, 0);
    const totalExpenses = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);

    const mrrEl = document.getElementById('mrr-value');
    if (mrrEl) mrrEl.textContent = '$' + totalRevenue.toLocaleString();

    const list = document.getElementById('ledger-list');
    if (!list) return;

    list.innerHTML = entries.map(e => `
      <div class="feed-card" data-id="${e.id}" style="--bar:${e.type === 'revenue' ? 'var(--lime)' : 'var(--pink)'}; cursor:pointer;">
        <div class="feed-main">
          <div class="feed-title">${i18n.isRTL() ? e.descriptionAr : e.description}</div>
          <div class="feed-desc">${e.date} · ${e.category}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="feed-time" style="color:${e.type === 'revenue' ? 'var(--lime)' : 'var(--pink)'}; font-weight:700;">
            ${e.type === 'revenue' ? '+' : '-'}$${e.amount.toLocaleString()}
          </span>
          <button class="row-delete-btn" data-id="${e.id}" title="${i18n.lang === 'ar' ? 'حذف' : 'Delete'}">×</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.row-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteLedgerEntry(btn.dataset.id);
      });
    });
  }

  async deleteLedgerEntry(id) {
    const entry = await data.fetchOne('ledger', id);
    if (!entry) return;

    if (!await confirmDialog(i18n.lang === 'ar'
      ? `هل تريد حذف هذه المعاملة؟`
      : `Delete this transaction?`)) {
      return;
    }

    const result = await data.delete('ledger', id);
    this.lastDeleted = { collection: 'ledger', item: result.item };

    showToast(
      i18n.lang === 'ar' ? 'تم حذف المعاملة' : 'Transaction deleted',
      'success',
      {
        label: i18n.lang === 'ar' ? 'تراجع' : 'UNDO',
        onClick: () => this.undoDelete()
      }
    );

    this.renderLedger();
    this.renderDashboard();
  }

  // ============ PROFILE / SETTINGS ============
  renderSettings() {
    const licenseKey = license.getLicense();
    const activatedDate = license.getActivatedDate();

    const content = document.getElementById('settings-content');
    if (!content) return;

    // Use the user's provided Commander Profile design, adapted to the app's CSS
    content.innerHTML = `
      <!-- Profile Header -->
      <div class="card" style="text-align:center; margin-bottom:24px; border-color: #333; position: relative; overflow: hidden;">
        <div class="avatar-box" style="width:96px; height:96px; border-radius:50%; margin:0 auto 16px; border:2px solid var(--lime); box-shadow:0 0 15px rgba(204,255,0,0.4); overflow:hidden;">
          <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBu94K6TQNI9S5C05dPmGzSuDaZhBHGYvDpImoHGoNAiV0LlyIZ5LUQ0cFRq52Wvxbj8nR5h0atk9t5f0aBH3zHBoZCSPbyB3qjYVKkHfU1gGVEh6gMzCykfhRa1o0_K55DzNrH4hLV3r-NmRLtU2yfvVcSVRX7s_aLuR3USISjhuAXd0FOqhoTHg2sX4z4KOlwS1LsSEJJML8BywcGHGNVOyyTn8eBPlavt1z2uYm6UWAELUTBsiYw" alt="Profile" style="width:100%; height:100%; object-fit:cover;">
        </div>
        <h2 style="font-family:var(--font-display); font-size:24px; font-weight:700; color:var(--text); text-transform:uppercase; letter-spacing: -0.5px;">DIGITAL PULSE</h2>
        <div style="display:flex; flex-direction:column; align-items:center; margin-top:4px;">
          <span style="color:var(--text-dim); font-size:14px;">Shift Alpha</span>
          <span style="color:rgba(138,138,138,0.7); font-size:12px; margin-top:2px;" class="ar">القائد - المناوبة ألفا</span>
        </div>
        <div style="margin-top:16px; display:inline-flex; items-center; gap:6px; background:rgba(204,255,0,0.1); padding:6px 12px; border-radius:4px; border:1px solid rgba(204,255,0,0.3);">
          <span class="dot lime" style="animation: pulse 2s infinite;"></span>
          <span style="color:var(--lime); font-size:10px; font-family:var(--font-display); font-weight:700; letter-spacing:1px; text-transform:uppercase;">SYSTEM ACTIVE</span>
        </div>
      </div>

      <div class="grid" style="display:grid; grid-template-columns:1fr; gap:16px;">
        
        <!-- Account Security -->
        <div class="card card-hover" style="border-color:#333;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:12px; margin-bottom:16px;">
            <div>
              <h3 style="font-family:var(--font-display); font-size:16px; font-weight:700; color:var(--text); text-transform:uppercase;">Account Security</h3>
              <p style="color:rgba(138,138,138,0.7); font-size:12px;" class="ar">أمان الحساب</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.6" style="width:24px; height:24px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <p style="font-size:13px; font-weight:600; text-transform:uppercase;">Password</p>
              <p style="font-size:11px; color:var(--text-dim); margin-top:4px;">Last changed 30 days ago</p>
            </div>
            <button style="color:var(--lime); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">EDIT</button>
          </div>
          <div style="height:1px; background:#333; margin-bottom:12px;"></div>
          
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p style="font-size:13px; font-weight:600; text-transform:uppercase;">Active Sessions</p>
              <p style="font-size:11px; color:var(--text-dim); margin-top:4px;">2 devices connected</p>
            </div>
            <button style="color:var(--lime); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">REVIEW</button>
          </div>
        </div>

        <!-- App Preferences -->
        <div class="card card-hover" style="border-color:#333;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:12px; margin-bottom:16px;">
            <div>
              <h3 style="font-family:var(--font-display); font-size:16px; font-weight:700; color:var(--text); text-transform:uppercase;">App Preferences</h3>
              <p style="color:rgba(138,138,138,0.7); font-size:12px;" class="ar">تفضيلات التطبيق</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.6" style="width:24px; height:24px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <p style="font-size:13px; font-weight:600; text-transform:uppercase;">Language / اللغة</p>
              <p style="font-size:11px; color:var(--text-dim); margin-top:4px;">${i18n.lang === 'en' ? 'English (Default)' : 'Arabic'}</p>
            </div>
            <div class="auth-switch" style="margin-bottom:0; background:var(--card-2); padding:2px; border-radius:20px;">
              <button class="${i18n.lang === 'en' ? 'is-active' : ''}" data-lang="en" style="padding:4px 12px; border-radius:18px; font-size:10px; font-weight:700;">ENG</button>
              <button class="${i18n.lang === 'ar' ? 'is-active' : ''}" data-lang="ar" style="padding:4px 12px; border-radius:18px; font-size:10px; font-family:var(--font-ar);">عربي</button>
            </div>
          </div>
          <div style="height:1px; background:#333; margin-bottom:12px;"></div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p style="font-size:13px; font-weight:600; text-transform:uppercase;">Theme Mode</p>
              <p style="font-size:11px; color:var(--text-dim); margin-top:4px;">Dark Mode (Forced)</p>
            </div>
            <div style="width:36px; height:20px; background:var(--lime); border-radius:10px; position:relative; opacity:0.8;">
              <div style="width:16px; height:16px; background:#000; border-radius:50%; position:absolute; top:2px; right:2px;"></div>
            </div>
          </div>
        </div>
        
        <!-- System License & Info -->
        <div class="card card-hover" style="border-color:#333;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:12px; margin-bottom:16px;">
            <div>
              <h3 style="font-family:var(--font-display); font-size:16px; font-weight:700; color:var(--text); text-transform:uppercase;">System License</h3>
              <p style="color:rgba(138,138,138,0.7); font-size:12px;" class="ar">ترخيص النظام</p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.6" style="width:24px; height:24px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <p style="font-size:13px; font-weight:600; text-transform:uppercase;">License Key</p>
              <p style="font-size:11px; color:var(--text-dim); margin-top:4px; font-family:monospace;">${licenseKey || 'DP-XXXX-XXXX'}</p>
            </div>
            <button id="copy-license-btn" style="color:var(--lime); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">COPY</button>
          </div>
          <div style="height:1px; background:#333; margin-bottom:12px;"></div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div>
              <p style="font-size:13px; font-weight:600; text-transform:uppercase;">Activated</p>
              <p style="font-size:12px; color:var(--lime); font-weight:700; margin-top:4px; font-family:var(--font-display);">${activatedDate ? new Date(activatedDate).toLocaleDateString() : 'TODAY'}</p>
            </div>
            <span class="dot lime" style="animation: pulse 2s infinite;"></span>
          </div>

          <div style="height:1px; background:#333; margin-bottom:16px;"></div>

          <!-- Data Management Actions -->
          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <button id="export-json-btn" style="flex:1; background:var(--card-2); color:var(--text); border:1px solid #333; border-radius:8px; padding:10px; font-family:var(--font-display); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; display:flex; justify-content:center; align-items:center; gap:6px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              JSON
            </button>
            <button id="export-excel-btn" style="flex:1; background:var(--card-2); color:var(--text); border:1px solid #333; border-radius:8px; padding:10px; font-family:var(--font-display); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; display:flex; justify-content:center; align-items:center; gap:6px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              EXCEL
            </button>
          </div>
          <div style="display:flex; gap:8px; margin-bottom:16px;">
            <label for="import-file-input" style="flex:1; background:var(--card-2); color:var(--lime); border:1px solid rgba(204,255,0,0.3); border-radius:8px; padding:10px; font-family:var(--font-display); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; display:flex; justify-content:center; align-items:center; gap:6px; cursor:pointer;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px; height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              IMPORT
            </label>
            <input type="file" id="import-file-input" accept=".json,.xlsx" style="display:none;">
          </div>

          <!-- Team Identity -->
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
            <div style="width:36px; height:36px; border-radius:50%; background:var(--card-2); border:1px solid rgba(204,255,0,0.3); display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(204,255,0,0.2);">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" stroke-width="2" style="width:16px; height:16px;"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            </div>
            <div>
              <p style="font-family:var(--font-display); font-size:14px; font-weight:700; text-transform:uppercase;">hitik</p>
              <p style="font-size:10px; color:var(--text-dim);">Built by hitik / <span class="ar">صُنع بواسطة hitik</span></p>
            </div>
          </div>
          
          <!-- Team Contact -->
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
            <div style="width:36px; height:36px; border-radius:50%; background:var(--card-2); border:1px solid rgba(204,255,0,0.3); display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(204,255,0,0.2);">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" stroke-width="2" style="width:16px; height:16px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </div>
            <div>
              <p style="font-family:monospace; font-size:14px; font-weight:700;">+972568802803</p>
              <p style="font-size:10px; color:var(--text-dim); text-transform:uppercase;">WhatsApp / Signal</p>
            </div>
          </div>
          
          <div style="height:1px; background:#333; margin-bottom:12px;"></div>
          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div>
              <p style="font-family:var(--font-display); font-size:20px; font-weight:700;">v4.2.0-rc1</p>
              <p style="font-family:monospace; font-size:10px; color:var(--text-dim); margin-top:2px;">Build: 98f2a1b</p>
            </div>
            <span style="font-size:9px; color:rgba(204,255,0,0.7); text-transform:uppercase; letter-spacing:1px; font-weight:600;">Up to date</span>
          </div>
        </div>

        <button id="logout-btn-settings" style="width:100%; background:var(--pink); color:#fff; border:1px solid var(--pink); border-radius:12px; padding:16px; font-family:var(--font-display); font-size:16px; font-weight:700; text-transform:uppercase; letter-spacing:2px; display:flex; justify-content:center; align-items:center; gap:8px; box-shadow:0 0 15px rgba(255,51,102,0.4); margin-top:8px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px; height:20px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          ${i18n.t.logout || 'LOGOUT'}
        </button>
      </div>
    `;

    // Reattach listeners
    const logoutBtn = document.getElementById('logout-btn-settings');
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      license.deactivate();
      window.location.href = '/public/license.html';
    });

    const copyBtn = document.getElementById('copy-license-btn');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const licenseKey = license.getLicense();
      if (licenseKey) {
        navigator.clipboard.writeText(licenseKey);
        showToast(i18n.lang === 'ar' ? 'تم النسخ بنجاح' : 'Copied to clipboard', 'success');
      }
    });

    // Export JSON
    const exportJsonBtn = document.getElementById('export-json-btn');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', async () => {
      exportJsonBtn.disabled = true;
      const result = await dataIO.exportToJSON();
      exportJsonBtn.disabled = false;
      if (result?.success) {
        showToast(i18n.lang === 'ar' ? 'تم تصدير نسخة احتياطية (JSON)' : 'Backup exported (JSON)', 'success');
      } else {
        showToast(i18n.lang === 'ar' ? 'فشل التصدير' : 'Export failed', 'error');
      }
    });

    // Export Excel
    const exportExcelBtn = document.getElementById('export-excel-btn');
    if (exportExcelBtn) exportExcelBtn.addEventListener('click', async () => {
      exportExcelBtn.disabled = true;
      exportExcelBtn.textContent = i18n.lang === 'ar' ? 'جارٍ التصدير...' : 'EXPORTING...';
      const result = await dataIO.exportToExcel();
      exportExcelBtn.disabled = false;
      exportExcelBtn.textContent = 'EXCEL';
      if (result?.success) {
        showToast(i18n.lang === 'ar' ? 'تم تصدير ملف Excel' : 'Excel file exported', 'success');
      } else {
        showToast(i18n.lang === 'ar' ? 'فشل التصدير' : 'Export failed', 'error');
      }
    });

    // Import (JSON or Excel)
    const importInput = document.getElementById('import-file-input');
    if (importInput) importInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      let result;
      if (file.name.endsWith('.json')) {
        result = await dataIO.importFromJSON(file);
      } else if (file.name.endsWith('.xlsx')) {
        result = await dataIO.importFromExcel(file);
      } else {
        showToast(i18n.lang === 'ar' ? 'نوع الملف غير مدعوم' : 'Unsupported file type', 'error');
        return;
      }

      if (result?.success) {
        showToast(i18n.lang === 'ar' ? 'تم استيراد البيانات بنجاح' : 'Data imported successfully', 'success');
        this.renderSettings();
      } else {
        showToast(result?.error || (i18n.lang === 'ar' ? 'فشل الاستيراد' : 'Import failed'), 'error');
      }
      importInput.value = '';
    });

    document.querySelectorAll('.auth-switch button[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
        i18n.setLang(btn.dataset.lang);
        this.renderSettings();
      });
    });
  }
}

// Initialize
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());

export { app };