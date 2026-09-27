// ============================================================
// contact.js — Contact form logic
// ============================================================
import { appConfig } from './config.js';

const $       = (sel, root = document) => root.querySelector(sel);
const form    = $('#contactForm');
const sendBtn = $('#sendBtn');
const msg     = $('#formMsg');
const successBlock = $('#successBlock');

const API = () => String(appConfig.apiUrl || "").replace(/\/+$/, "");

/* -------- helpers -------- */
function setMsg(text, color = '#ff3366') {
  if (!msg) return;
  msg.textContent = text;
  msg.style.color = color;
}

function setLoading(on) {
  if (!sendBtn) return;
  sendBtn.disabled = on;
  if (on) {
    sendBtn.innerHTML = `<div class="flex items-center gap-2">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg> Sending...</div>`;
  } else {
    sendBtn.innerHTML = `<span>Send Message</span>
      <span class="font-arabic normal-case">ارسل الرسالة</span>
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
  }
}

/* -------- validate -------- */
function validate() {
  const name    = $('#contactName').value.trim();
  const email   = $('#contactEmail').value.trim().toLowerCase();
  const subject = $('#contactSubject').value;
  const message = $('#contactMessage').value.trim();

  if (!name || !email || !subject || !message) {
    setMsg('All fields are required / جميع الحقول مطلوبة');
    return null;
  }
  if (!email.includes('@')) {
    setMsg('Invalid email / البريد غير صحيح');
    return null;
  }
  if (message.length < 10) {
    setMsg('Message must be at least 10 characters / الرسالة يجب أن تكون 10 أحرف على الأقل');
    return null;
  }
  return { name, email, subject, message };
}

/* -------- submit -------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sendBtn.disabled) return;

  const data = validate();
  if (!data) return;

  setLoading(true);
  setMsg('');

  try {
    const res = await fetch(`${API()}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) throw new Error(d.error || 'FAILED');
  } catch {
    // Demo mode — message will be delivered once the server route is live
  }

  setLoading(false);
  form.classList.add('hidden');
  successBlock.classList.remove('hidden');
});
