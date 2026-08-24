// Onboarding Flow Controller
const slides = document.querySelectorAll('.onb-slide');
const dots = document.querySelectorAll('.onb-dot');
const ctaBtn = document.getElementById('onbCta');
const skipBtn = document.getElementById('onbSkip');
const ctaText = ctaBtn.querySelector('.onb-cta-text');

let current = 0;

function goTo(index) {
  slides.forEach(s => s.classList.remove('is-active'));
  dots.forEach(d => d.classList.remove('is-active'));
  slides[index].classList.add('is-active');
  dots[index].classList.add('is-active');
  current = index;
  ctaText.textContent = index === slides.length - 1 ? 'Get Started' : 'Next';
}

ctaBtn.addEventListener('click', () => {
  if (current === slides.length - 1) {
    window.location.href = '/auth/signup.html';
  } else {
    goTo(current + 1);
  }
});

skipBtn.addEventListener('click', () => {
  window.location.href = '/auth/login.html';
});

dots.forEach(d => {
  d.addEventListener('click', () => goTo(parseInt(d.dataset.dot)));
});