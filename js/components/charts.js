// ============================================================
// Charts Component
// ============================================================
import { store } from "../store.js";
import { currentLang } from "../i18n.js";
import { escapeHtml } from "../ui.js";
import { DAY_MS } from "../constants.js";
import { nf } from "../app-core.js";

let charts = [];
let chartLoading = null;

export function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }
export function trackChart(c) { charts.push(c); return c; }

export function ensureChart() {
  if (window.Chart) return Promise.resolve();
  if (chartLoading) return chartLoading;
  chartLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/chart.umd.min.js";
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  return chartLoading;
}

export async function drawCheckinsChart(days) {
  const canvas = document.getElementById("growthChart");
  if (!canvas) return;
  await ensureChart();
  if (!window.Chart) return;
  const data = days === 7 ? store.stats().checkins7 : store.stats().checkins30;

  document.querySelectorAll(".chart-range").forEach((b) => {
    const active = Number(b.dataset.range) === days;
    b.classList.toggle("bg-surface-hover", active);
    b.classList.toggle("border-outline-variant", !active);
    b.classList.toggle("text-white", active);
    b.classList.toggle("text-muted", !active);
  });

  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, "rgba(204, 255, 0, 0.4)");
  gradient.addColorStop(1, "rgba(204, 255, 0, 0.0)");

  trackChart(new window.Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((_, i) => String(i + 1)),
      datasets: [{
        data,
        borderColor: "#CCFF00",
        backgroundColor: gradient,
        borderWidth: 2,
        pointBackgroundColor: "#0A0A0A",
        pointBorderColor: "#CCFF00",
        pointBorderWidth: 2,
        pointRadius: days === 7 ? 4 : 0,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#171717",
          titleFont: { family: "Space Grotesk", size: 14 },
          bodyFont: { family: "Space Grotesk", size: 16, weight: "bold" },
          padding: 10,
          borderColor: "#333333",
          borderWidth: 1,
          displayColors: false,
          callbacks: { label: (c) => c.parsed.y + " check-ins" },
        },
      },
      scales: {
        x: { display: false },
        y: { display: false, min: Math.max(0, Math.min(...data) - 20) },
      },
      interaction: { intersect: false, mode: "index" },
    },
  }));
}