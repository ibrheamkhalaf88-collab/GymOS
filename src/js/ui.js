// UI utilities - toasts, modals, helpers
import { i18n } from './i18n.js';

export function showToast(message, type = 'success', action = null) {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const iconPath = type === 'error'
    ? '<path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/>'
    : '<path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

  let html = `<svg viewBox="0 0 24 24" fill="none">${iconPath}</svg><span>${message}</span>`;
  if (action) {
    html += `<button class="toast-action">${action.label}</button>`;
  }
  toast.innerHTML = html;

  if (action && action.onClick) {
    toast.querySelector('.toast-action').onclick = (e) => {
      e.stopPropagation();
      action.onClick();
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    };
  }

  stack.appendChild(toast);

  const timeoutId = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    toast.style.transition = 'all .25s ease';
    setTimeout(() => toast.remove(), 250);
  }, action ? 5000 : 3000);

  toast.onmouseenter = () => clearTimeout(timeoutId);
}

export function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(i18n.lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
}

export function daysLabel(days) {
  if (days < 0) return { text: i18n.lang === 'ar' ? 'منتهي' : 'EXPIRED', cls: 'danger' };
  if (days <= 3) return { text: `${days}d ${i18n.lang === 'ar' ? 'متبقي' : 'left'}`, cls: 'danger' };
  if (days <= 14) return { text: `${days}d ${i18n.lang === 'ar' ? 'متبقي' : 'left'}`, cls: 'warn' };
  return { text: `${days}d ${i18n.lang === 'ar' ? 'متبقي' : 'left'}`, cls: 'ok' };
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Modal helper
export function openModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  return overlay;
}

export function closeModal(overlay) {
  if (overlay) overlay.remove();
}

// Confirm dialog
export function confirmDialog(message) {
  return new Promise(resolve => {
    const overlay = openModal(`
      <div style="text-align:center; padding: 8px 0;">
        <p style="font-size:15px; margin-bottom:20px;">${message}</p>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary btn-block" id="cf-cancel">${i18n.t.cancel}</button>
          <button class="btn btn-danger btn-block" id="cf-ok">${i18n.t.confirm}</button>
        </div>
      </div>
    `);
    overlay.querySelector('#cf-cancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#cf-ok').onclick = () => { overlay.remove(); resolve(true); };
  });
}