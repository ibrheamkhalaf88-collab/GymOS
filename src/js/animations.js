// ===== Digital Pulse — Animations Module =====
// Lottie + GSAP + Intersection Observer for smooth motion graphics

import lottie from 'lottie-web';

// ---- 1. LOADING SPINNER (Lottie) ----
export function showLottieLoader(container, loop = true) {
  const loaderAnim = lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: loop,
    autoplay: true,
    animationData: {
      v: '5.7.4',
      fr: 30,
      ip: 0,
      op: 60,
      w: 200,
      h: 200,
      nm: 'loader',
      ddd: 0,
      assets: [],
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: 'spinner',
          sr: 1,
          ks: {
            o: { a: 0, k: 100 },
            r: { a: 1, k: [{ t: 0, s: [0], h: 0 }, { t: 60, s: [360] }] },
            p: { a: 0, k: [100, 100, 0] },
            a: { a: 0, k: [0, 0, 0] },
            s: { a: 0, k: [100, 100, 100] }
          },
          shapes: [
            {
              ty: 'gr',
              it: [
                {
                  ty: 'el',
                  d: 1,
                  s: { a: 0, k: [120, 120] },
                  p: { a: 0, k: [0, 0] }
                },
                {
                  ty: 'st',
                  c: { a: 0, k: [0.8, 1, 0, 1] },
                  o: { a: 0, k: 100 },
                  w: { a: 0, k: 12 },
                  lc: 2,
                  lj: 2,
                  d: [{ n: 'd', v: { a: 0, k: 75 } }, { n: 'g', v: { a: 0, k: 0 } }, { n: 'o', v: { a: 0, k: 25 } }]
                },
                {
                  ty: 'tr',
                  p: { a: 0, k: [0, 0] },
                  a: { a: 0, k: [0, 0] },
                  s: { a: 0, k: [100, 100] },
                  r: { a: 0, k: 0 },
                  o: { a: 0, k: 100 }
                }
              ]
            }
          ],
          ip: 0,
          op: 60,
          st: 0
        }
      ]
    }
  });
  return loaderAnim;
}

// ---- 2. SUCCESS STATE (Lottie) ----
export function showSuccessAnim(container) {
  return lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: false,
    autoplay: true,
    animationData: {
      v: '5.7.4', fr: 30, ip: 0, op: 45, w: 200, h: 200,
      nm: 'success', ddd: 0, assets: [],
      layers: [
        {
          ddd: 0, ind: 1, ty: 4, nm: 'check', sr: 1,
          ks: {
            o: { a: 1, k: [{ t: 0, s: [0] }, { t: 10, s: [100] }] },
            r: { a: 0, k: 0 }, p: { a: 0, k: [100, 100, 0] },
            a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] }
          },
          shapes: [
            {
              ty: 'gr',
              it: [
                { ty: 'el', d: 1, s: { a: 0, k: [140, 140] }, p: { a: 0, k: [0, 0] } },
                {
                  ty: 'st', c: { a: 0, k: [0.133, 0.773, 0.369, 1] }, o: { a: 0, k: 100 },
                  w: { a: 0, k: 10 }, lc: 2, lj: 2,
                  d: [{ n: 'd', v: { a: 0, k: 100 } }]
                },
                {
                  ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] },
                  s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }
                }
              ]
            },
            {
              ty: 'sh',
              ks: {
                a: 0,
                k: {
                  c: false,
                  v: [{ i: [0, 0], o: [0, 0] }, { i: [0, 0], o: [0, 0] }, { i: [0, 0], o: [0, 0] }],
                  v: [[-30, 0], [-10, 20], [30, -25]]
                }
              },
              nm: 'check-path'
            },
            {
              ty: 'st', c: { a: 0, k: [0.133, 0.773, 0.369, 1] }, o: { a: 0, k: 100 },
              w: { a: 0, k: 12 }, lc: 2, lj: 2
            }
          ],
          ip: 0, op: 45, st: 0
        }
      ]
    }
  });
}

// ---- 3. HERO TITLE ANIMATION (Text reveal) ----
export function animateHeroTitle(element) {
  if (!element) return;
  const text = element.textContent;
  element.innerHTML = '';

  // Split into chars (skip spaces)
  [...text].forEach((char, i) => {
    if (char === ' ') {
      element.appendChild(document.createTextNode(' '));
      return;
    }
    const span = document.createElement('span');
    span.textContent = char;
    span.style.cssText = `
      display: inline-block;
      opacity: 0;
      transform: translateY(30px) rotateX(-45deg);
      animation: heroReveal 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
      animation-delay: ${i * 0.04}s;
    `;
    element.appendChild(span);
  });
}

// ---- 4. SCROLL REVEAL (Intersection Observer) ----
export function initScrollReveal() {
  const elements = document.querySelectorAll('[data-reveal]');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -50px 0px' });

  elements.forEach(el => observer.observe(el));
}

// ---- 5. CARD HOVER GLOW ----
export function initCardGlow() {
  document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mx', `${x}px`);
      card.style.setProperty('--my', `${y}px`);
      card.classList.add('is-glowing');
    });
    card.addEventListener('mouseleave', () => {
      card.classList.remove('is-glowing');
    });
  });
}
