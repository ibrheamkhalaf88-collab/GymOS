// Generates subjects.json (UTF-8) for the auth email templates.
// Run: node scripts/gen-email-subjects.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'supabase', 'auth-email-templates', 'subjects.json');

const subjects = {
  confirmation: 'أكّد حسابك في Digital Pulse ✓ Confirm your account',
  recovery: 'استعادة كلمة السر في Digital Pulse 🔑 Reset your password',
  invite: 'دعوة للانضمام إلى Digital Pulse 🎉 You\'re invited',
  email_change: 'تأكيد بريدك الجديد في Digital Pulse ✓ Confirm your new email',
};

writeFileSync(out, JSON.stringify(subjects, null, 2) + '\n', 'utf8');
console.log('Wrote', out);
