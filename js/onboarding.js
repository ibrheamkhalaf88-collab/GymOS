// Digital Pulse — Onboarding (pixel-faithful to Stitch designs)
const KEY_SEEN = "dp_onboarded";

const ARROW_SVG = `<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" fill-rule="evenodd"></path></svg>`;

function dots(active, { inactive = "bg-gray-600", activeW = "w-8", shadow = "" } = {}) {
  return `<div class="flex items-center gap-2" data-purpose="pagination-dots">${[0, 1, 2].map((i) =>
    i === active
      ? `<div class="${activeW} h-2 rounded-full bg-[#CCFF00] transition-all ${shadow}"></div>`
      : `<div class="w-2 h-2 rounded-full ${inactive} transition-colors"></div>`
  ).join("")}</div>`;
}

const SLIDES = [
  // ── Slide 1 · Ready to Start? (onboarding_get_started_pure_black) ──
  () => `
<main class="flex flex-col h-full w-full max-w-md mx-auto px-6 py-8 relative flex-1">
  <div aria-hidden="true" class="h-8 w-full"></div>
  <section class="flex-1 flex flex-col items-center justify-center w-full pb-8">
    <div class="w-full max-w-[280px] aspect-square relative mb-12 flex items-center justify-center">
      <div class="absolute inset-0 bg-[#CCFF00] opacity-10 blur-3xl rounded-full"></div>
      <img alt="Rocket Launch Illustration" class="w-full h-full object-contain relative z-10 drop-shadow-2xl" src="assets/img/intro-start.jpg"/>
    </div>
    <div class="w-full text-center space-y-6">
      <header class="space-y-2">
        <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Ready to Start?</h1>
        <h2 class="text-3xl sm:text-4xl font-bold font-arabic text-white" dir="rtl">جاهز تبدأ؟</h2>
      </header>
      <div class="space-y-3 px-4">
        <p class="text-base text-gray-400 leading-relaxed">Register your account now and make your club management exceptional.</p>
        <p class="text-base text-gray-400 leading-relaxed font-arabic" dir="rtl">سجل حسابك الآن واجعل إدارة ناديك استثنائية.</p>
      </div>
    </div>
  </section>
  <section class="w-full pb-6 pt-4 mt-auto">
    <button data-next class="w-full bg-[#CCFF00] hover:bg-[#b3e600] active:scale-95 text-black font-extrabold text-lg py-4 px-8 rounded-2xl transition-all duration-200 ease-in-out glow-effect flex items-center justify-center gap-2" type="button">
      <span>Get Started</span>
      ${ARROW_SVG}
    </button>
  </section>
</main>`,

  // ── Slide 2 · Smart Assistant (onboarding_smart_assistant_pure_black) ──
  () => `
<main class="flex-grow flex flex-col justify-between px-6 pt-12 pb-8 flex-1">
  <section class="flex justify-center items-center flex-grow mb-8">
    <div class="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(204,255,0,0.2)] border border-gray-800">
      <img alt="Smart Gym Assistant Illustration" class="w-full h-auto object-cover block" src="assets/img/intro-assistant.jpg"/>
    </div>
  </section>
  <section class="flex flex-col space-y-6 text-center">
    <div class="space-y-3">
      <h1 class="text-2xl font-bold leading-tight" dir="rtl">مساعدك الذكي لإدارة الجيم</h1>
      <h2 class="text-xl font-semibold text-gray-300">Your Smart Assistant for Gym Management</h2>
    </div>
    <div class="space-y-4 text-sm text-gray-400">
      <p class="leading-relaxed" dir="rtl">اجعل إدارة ناديك الرياضي أكثر سهولة وذكاءً. حل متكامل لكل ما تحتاجه الإدارة في مكان واحد.</p>
      <p class="leading-relaxed">Make managing your sports club easier and smarter. An integrated solution for everything management needs in one place.</p>
    </div>
  </section>
  <section class="mt-10 flex flex-col items-center space-y-6">
    ${dots(0)}
    <button data-next class="w-full bg-[#CCFF00] text-black font-bold py-4 rounded-xl text-lg hover:bg-[#aacc00] transition-colors shadow-[0_4px_14px_0_rgba(204,255,0,0.39)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#CCFF00] focus:ring-offset-black">Next / التالي</button>
  </section>
</main>`,

  // ── Slide 3 · Member Management (onboarding_member_management_pure_black) ──
  () => `
<main class="w-full max-w-md mx-auto flex flex-col flex-1 mx-auto">
  <div class="h-12 w-full"></div>
  <section class="flex-1 flex items-center justify-center p-6 w-full">
    <div class="relative w-full aspect-square max-w-[320px] rounded-3xl overflow-hidden neon-border bg-gray-900/50 backdrop-blur-sm">
      <img alt="Membership Management Illustration" class="w-full h-full object-cover mix-blend-screen opacity-90" src="assets/img/intro-members.jpg"/>
    </div>
  </section>
  <section class="px-6 py-8 flex flex-col gap-6 text-center">
    <div class="space-y-3">
      <h1 class="text-2xl font-bold tracking-tight text-white font-cairo">إدارة العضويات بلمسة واحدة</h1>
      <h2 class="text-xl font-semibold tracking-tight text-[#CCFF00] text-glow">One-Touch Membership Management</h2>
    </div>
    <div class="space-y-4">
      <p class="text-base text-gray-400 font-cairo leading-relaxed" dir="rtl">سجل المشتركين الجدد، تابع تواريخ التجديد، وادفع الاشتراكات بسهولة فائقة دون فوضى الأوراق.</p>
      <p class="text-sm text-gray-400 leading-relaxed max-w-[280px] mx-auto">Register new members, track renewal dates, and pay subscriptions with extreme speed without paper chaos.</p>
    </div>
  </section>
  <footer class="w-full max-w-md mx-auto px-6 pb-6 pt-4 flex flex-col gap-8 mt-auto">
    ${dots(1, { activeW: "w-6", shadow: "shadow-[0_0_8px_rgba(204,255,0,0.5)]" })}
    <div class="w-full flex gap-4">
      <button data-next class="flex-1 bg-[#CCFF00] text-black font-bold text-lg py-4 px-8 rounded-2xl shadow-[0_4px_20px_rgba(204,255,0,0.3)] hover:bg-[#b3e600] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group">
        Next / التالي
        <svg class="h-5 w-5 group-hover:translate-x-1 transition-transform" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" fill-rule="evenodd"></path></svg>
      </button>
    </div>
  </footer>
</main>`,

  // ── Slide 4 · Smart Decisions (onboarding_smart_decisions_pure_black) ──
  () => `
<div class="flex-1 flex flex-col w-full max-w-md mx-auto px-6 pt-12 pb-8">
  <main class="flex-1 flex items-center justify-center min-h-[353px] w-full">
    <div class="relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden border border-gray-800 glow-volt p-2 bg-black">
      <img alt="Smart data charts illustration" class="w-full h-full object-cover rounded-xl" src="assets/img/intro-decisions.jpg"/>
    </div>
  </main>
  <section class="mt-8 mb-10 flex flex-col gap-4 text-center">
    <div class="flex flex-col gap-2">
      <h1 class="text-2xl font-black uppercase tracking-tight text-white leading-none">Smart Decisions Based on Data</h1>
      <h2 class="text-xl font-bold text-gray-200 leading-tight arabic-text">قرارات ذكية قائمة على البيانات</h2>
    </div>
    <div class="flex flex-col gap-3 mt-2">
      <p class="text-sm text-gray-400 font-medium leading-relaxed">Monitor your gym growth with daily numbers and reports, raise work efficiency and focus on developing your club.</p>
      <p class="text-sm text-gray-400 font-medium leading-relaxed arabic-text">راقب نمو صالتك بالأرقام والتقارير اليومية، ارفع كفاءة العمل وركز على تطوير ناديك.</p>
    </div>
  </section>
  <footer class="mt-auto flex flex-col items-center gap-8 w-full">
    ${dots(2, { inactive: "bg-gray-700", shadow: "shadow-[0_0_8px_rgba(204,255,0,0.4)]" })}
    <button data-next class="w-full bg-[#CCFF00] text-black font-black text-lg py-4 rounded-lg uppercase tracking-widest hover:bg-[#d4ff33] active:scale-[0.98] transition-all focus:outline-none focus:ring-4 focus:ring-[#CCFF00]/50" type="button">Next</button>
  </footer>
</div>`,
];

let idx = 0;

function render() {
  const root = document.getElementById("slideRoot");
  root.innerHTML = SLIDES[idx]();
  root.querySelectorAll("[data-next]").forEach((b) =>
    b.addEventListener("click", () => {
      if (idx < SLIDES.length - 1) {
        idx++;
        render();
        window.scrollTo(0, 0);
      } else {
        finish();
      }
    })
  );
}

function finish() {
  localStorage.setItem(KEY_SEEN, "1");
  const lic = JSON.parse(localStorage.getItem("dp_license") || "null");
  location.replace(lic && lic.active ? "app.html" : "activate.html");
}

// Routing: returning users skip onboarding
(function route() {
  const seen = localStorage.getItem(KEY_SEEN) === "1";
  if (seen) {
    let target = "activate.html";
    try {
      const lic = JSON.parse(localStorage.getItem("dp_license") || "null");
      if (lic && lic.active && (!lic.expiresAt || Date.now() < lic.expiresAt)) target = "app.html";
    } catch {}
    location.replace(target);
    return;
  }
  render();
})();