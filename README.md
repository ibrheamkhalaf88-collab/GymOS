# ⚡ GymOS — Cyber Athletic Gym Manager

> Professional membership, device & finance management for modern gyms —
> bilingual (EN/AR · RTL), license-activated, installable as an Android app.

**GymOS** (powered by the *Digital Pulse* activation system) is a full-stack-flavored
**portfolio project**: vanilla JS SPA with a Firebase-powered
activation-code licensing system, local-first data, PWA support and a CI-built Android APK.

<p align="center">
  <img alt="stack" src="https://img.shields.io/badge/JS-vanilla-f7df1e?logo=javascript&logoColor=black" />
  <img alt="design" src="https://img.shields.io/badge/design-cyber--athletic-ccff00" />
  <img alt="db" src="https://img.shields.io/badge/codes%20DB-Firebase-orange?logo=firebase" />
  <img alt="mobile" src="https://img.shields.io/badge/APK-Capacitor-blue?logo=android" />
</p>

---

## ✨ Features

| Area | Details |
|------|---------|
| 🧭 **Onboarding** | 4 bilingual slides (pure-black cyber style), auto-skip for returning users |
| 🔑 **License system** | Online activation codes (`XXX-XXX`) stored in Firestore; one device per code; revoke/restore; validity days per tier |
| 🛡️ **Admin console** | Email-gated (`admin.html`): generate keys, live registry table, stats, JSON export/import, WhatsApp share |
| 👥 **Member roster** | Search, status filters (active/expired/trial/frozen), member cards, renewals with auto ledger entries |
| 🖥️ **Hardware** | Device health board: pending / in-repair / completed + cost vs paid tracking |
| 💰 **Ledger** | MRR hero metric, bento KPIs, cashflow bars (in/out), transaction feed |
| 📊 **Analytics** | Check-ins chart (Chart.js), plan distribution, monthly cashflow |
| 🌐 **Bilingual i18n** | EN primary + AR secondary everywhere; one-tap RTL switch |
| 📱 **PWA + APK** | Manifest, offline-capable service worker, Capacitor Android build via GitHub Actions |
| 🔒 **Security rules** | Clients can only flip a single unused code to "used"; only the admin account can create/delete/list |

## 🏗️ Architecture

```
┌─────────────────────────── Client device ───────────────────────────┐
│  index.html → activate.html → app.html (SPA)                        │
│  Facility data (members/devices/ledger) → localStorage  [local-first]│
└──────────────────────────────┬──────────────────────────────────────┘
                               │ activation only
                     ┌─────────▼─────────┐
                     │  Firebase Auth     │ admin email sign-in
                     │  Firestore `codes` │ XXX-XXX registry
                     └───────────────────┘
```

- **Client data never leaves the device** (privacy by design).
- Only the *license handshake* touches the cloud.
- Works fully in **DEMO MODE** (localStorage codes) when Firebase isn't configured — perfect for GitHub Pages demos.

## 🚀 Quick start

```bash
npx serve .          # any static server works
```

Demo admin login: `admin@example.com` / `admin2040` — demo code: `7Q2-K9D`

Full setup (Firebase, rules, deploy, APK): see **[SETUP.md](SETUP.md)** (عربي).

## 🐳 Docker

```bash
docker compose up --build       # → http://localhost:8080
```

Hardened nginx:alpine image with security headers
(CSP, X-Frame-Options DENY, nosniff), gzip and immutable asset caching.

## 🛡️ Security & quality

- **PBKDF2-SHA256** password hashing (100k iterations + per-user salt) — [`js/db.js`](js/db.js)
- **Anti-injection / anti-XSS layer** — every input sanitized in [`js/validate.js`](js/validate.js); all renders escaped
- **Brute-force lockout** on client login (5 tries → 15 min)
- **Server-side rules** — [`firestore.rules`](firestore.rules) (least privilege, admin-only registry)
- **Tests** — `npm test` (node:test, validation + crypto vectors)
- **Lint** — `npm lint` (ESLint flat config)
- Full details: [SECURITY.md](SECURITY.md)

## 🔄 CI/CD (GitHub Actions)

| Workflow | What it does |
|----------|--------------|
| **CI — Quality Gates** | ESLint → unit tests → Docker build → push image to GHCR |
| **Deploy Web** | GitHub Pages on every push to `main` |
| **Build Android APK** | Capacitor + Gradle APK artifact (release on tags) |

## 📁 Project structure

```
├── index.html            # Onboarding (4 slides)
├── activate.html         # License activation (digit inputs)
├── app.html              # Main SPA shell
├── admin.html            # Codes admin console
├── js/
│   ├── config.js         # App + Firebase + admin settings
│   ├── firebase-config.js# FB init (CDN ES modules)
│   ├── db.js             # Codes API (Firestore ⇄ demo fallback)
│   ├── store.js          # Local-first facility data
│   ├── license.js        # Per-device license state
│   ├── app.js            # SPA screens & routing
│   ├── admin.js          # Admin console logic
│   ├── i18n.js           # EN/AR + RTL
│   └── ui.js             # Toasts/modals/helpers
├── css/theme.css         # Design tokens & components
├── vendor/               # Local Tailwind CDN build + Chart.js
├── docs/design/          # Stitch design source (screens + DESIGN.md)
├── firestore.rules       # Security rules
└── .github/workflows/    # Pages deploy + Android APK CI
```

## 🎨 Design system

**Digital Pulse — Cyber Athletic** (see [`docs/design/digital_pulse_cyber_athletic/DESIGN.md`](docs/design/digital_pulse_cyber_athletic/DESIGN.md)):
pure-black surfaces (#000/#171717), volt neon accents (#CCFF00), neon-alert pink (#FF3366),
frost blue for secondary data, Space Grotesk × Manrope × Tajawal typography,
pill-modern radii and LED-style glow states.

## 🔐 Security model

| Actor | Can | Cannot |
|-------|-----|--------|
| Client (anonymous) | Read one code by exact ID, mark it used once | List/create/delete codes, reuse or edit used codes |
| Admin (email auth) | Full control of the codes collection | — |

Rules are enforced server-side in [`firestore.rules`](firestore.rules).

## 📄 License

MIT — see [LICENSE](LICENSE).
