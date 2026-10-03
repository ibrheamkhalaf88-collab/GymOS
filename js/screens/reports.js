// ============================================================
// Reports Screen
// ============================================================
import { store } from "../store.js";
import { i18n, currentLang } from "../i18n.js";
import { showToast, openModal, confirmDialog, fmt, initials, escapeHtml } from "../ui.js";
import { sanitizeName, sanitizeAmount, sanitizePhone, validatePassword } from "../validate.js";
import { appConfig } from "../config.js";
import { DAY_MS } from "../constants.js";
import { syncExpiryNotifications, effStatus, effectiveLicense, gymName, applyGymName, waDigits, waReminderLink, waWinbackLink } from "../components/notifications.js";
import { nf } from "../app-core.js";

const DAY = DAY_MS;

export function viewReports() {
  const screen = document.getElementById("screen");
  screen.innerHTML = `
    <div class="flex flex-col gap-6">
      <h1 class="font-headline text-3xl tracking-tighter text-on-surface uppercase mb-1">Reports & Analytics</h1>
      <p class="arabic-sub text-muted text-sm" dir="rtl">التقارير والتحليلات</p>

      <!-- Plan Distribution -->
      <div class="bg-surface cyber-border rounded-xl p-4">
        <h2 class="font-headline font-bold uppercase tracking-tight mb-4">Plan Distribution / توزيع الباقات</h2>
        <div id="planDistChart" class="h-64"></div>
      </div>

      <!-- Cashflow Chart -->
      <div class="bg-surface cyber-border rounded-xl p-4">
        <h2 class="font-headline font-bold uppercase tracking-tight mb-4">Cashflow (6 months) / التدفق النقدي (٦ أشهر)</h2>
        <div id="cashflowChart" class="h-64"></div>
      </div>

      <!-- Check-ins Trend -->
      <div class="bg-surface cyber-border rounded-xl p-4">
        <h2 class="font-headline font-bold uppercase tracking-tight mb-4">Check-ins Trend / اتجاه تسجيلات الدخول</h2>
        <div id="checkinsTrendChart" class="h-64"></div>
      </div>
    </div>`;

  // Load charts when screen is visible
  const { ensureChart } = await import("../components/charts.js");
  await ensureChart();
  if (!window.Chart) return;

  const members = store.all("members");
  const ledger = store.all("ledger");
  const checkins = store.all("checkins");

  // Plan Distribution
  const planCounts = {};
  members.forEach(m => { planCounts[m.plan] = (planCounts[m.plan] || 0) + 1; });
  const planLabels = Object.keys(planCounts);
  const planData = planLabels.map(k => planCounts[k]);
  const planColors = planLabels.map(() => `hsl(${Math.random() * 360}, 70%, 50%)`);

  new window.Chart(document.getElementById("planDistChart"), {
    type: "doughnut",
    data: { labels: planLabels, datasets: [{ data: planData, backgroundColor: planColors, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { color: "#fff", font: { family: "Space Grotesk" } } } } }
  });

  // Cashflow (last 6 months)
  const months = [];
  const revenueData = [];
  const expenseData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const start = d.getTime(); const end = new Date(d); end.setMonth(d.getMonth() + 1); const endTime = end.getTime();
    const rev = ledger.filter(l => l.type === "revenue" && l.date >= start && l.date < endTime).reduce((s, l) => s + Number(l.amount || 0), 0);
    const exp = ledger.filter(l => l.type === "expense" && l.date >= start && l.date < endTime).reduce((s, l) => s + Number(l.amount || 0), 0);
    months.push(d.toLocaleDateString(currentLang() === "ar" ? "ar-EG" : "en-GB", { month: "short" }));
    revenueData.push(rev);
    expenseData.push(exp);
  }

  new window.Chart(document.getElementById("cashflowChart"), {
    type: "bar",
    data: { labels: months, datasets: [
      { label: "Revenue / إيرادات", data: revenueData, backgroundColor: "rgba(204,255,0,0.4)", borderColor: "#CCFF00", borderWidth: 1 },
      { label: "Expenses / مصروفات", data: expenseData, backgroundColor: "rgba(255,51,102,0.4)", borderColor: "#FF3366", borderWidth: 1 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#fff", font: { family: "Space Grotesk" } } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
  });

  // Check-ins Trend (last 30 days)
  const checkinLabels = checkins.slice(-30).map(c => new Date(c.date).toLocaleDateString(currentLang() === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short" }));
  const checkinData = checkins.slice(-30).map(c => c.count);

  new window.Chart(document.getElementById("checkinsTrendChart"), {
    type: "line",
    data: { labels: checkinLabels, datasets: [{ label: "Check-ins", data: checkinData, borderColor: "#CCFF00", backgroundColor: "rgba(204,255,0,0.2)", fill: true, tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#fff", font: { family: "Space Grotesk" } } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }
  });
}