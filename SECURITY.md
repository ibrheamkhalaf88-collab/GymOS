# 🔐 Security — GymOS

## Threat model & controls

| Risk | Control |
|------|---------|
| **SQL/NoSQL injection** | Firestore SDK parameterizes everything (no string queries). All user input passes `js/validate.js` sanitizers (strict code regex, name/phone whitelists, amount clamps). Nothing is ever concatenated into queries. |
| **XSS** | Every dynamic render escapes via `escapeHtml()` (`js/ui.js`); inputs additionally stripped of `<>` and control chars at the validation layer. CSP header blocks inline script injection in Docker deployments. |
| **Weak credentials** | Passwords hashed with **PBKDF2-SHA256, 100 000 iterations + per-user 16-byte random salt** (`js/db.js → derivePasswordHash`). Legacy SHA-256 records upgrade transparently on next login. |
| **Brute force** | Client lockout: 5 failed logins → 15-minute cooldown (`validate.js`). Codes are 6 chars from an unambiguous 32-symbol alphabet (~1.07 B combinations). |
| **Clickjacking / MIME sniffing** | `X-Frame-Options: DENY`, `nosniff`, strict `Referrer-Policy`, locked-down `Content-Security-Policy` (nginx config). |
| **Privilege abuse** | `firestore.rules`: only the admin email can list/create/delete codes; clients may flip one unused code and set a password hash exactly once; all other collections denied by default. |

## Reporting

Found a vulnerability? Open a private security advisory on GitHub
(**Security → Advisories → New draft advisory**) — do not open a public issue.

## Known limitations (roadmap)

- Login rate-limiting is client-side; move to App Check / Cloud Functions for server-side enforcement.
- `gyms/{CODE}` uses capability-token access (knowing the unguessable code grants access); upgrade path documented in SETUP.md.
- GitHub Pages cannot set custom headers — full CSP applies on the Docker deployment.
