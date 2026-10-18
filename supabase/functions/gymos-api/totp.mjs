// ============================================================
// GymOS — TOTP (RFC 6238) + Base32 (RFC 4648) core helpers.
//
// Plain ESM, zero imports. Runs identically under Deno (Edge
// Function runtime) and Node >= 18 via `globalThis.crypto`, so
// tests/expiry-2fa.test.mjs exercises the REAL production
// algorithm with the RFC 6238 vectors instead of a parallel copy.
// ============================================================

// RFC 4648 alphabet — exactly 32 entries, in order.
export const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1; // ±1 step of drift tolerance

/* Base32-encode WITHOUT padding ('=' omitted, RFC 4648 §3.2 allows
   un-padded encodings; the decoder tolerates padding either way). */
export function base32Encode(bytes) {
  let bits = 0, value = 0, out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/* Base32-decode; tolerates padding, spaces and lowercase. Stray
   characters are skipped rather than throwing — the only input this
   ever receives is our own encoder output or a pasted authenticator
   secret (which users habitually paste with spaces/casing). */
export function base32Decode(text) {
  const clean = String(text || "").toUpperCase().replace(/[\s=]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = B32_ALPHABET.indexOf(clean[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/* HOTP (RFC 4226 §5.3): HMAC-SHA-1 over the 8-byte big-endian counter,
   dynamic truncation, `digits`-long decimal string. */
async function hotp(keyBytes, counter, digits) {
  const msg = new ArrayBuffer(8);
  const dv = new DataView(msg);
  dv.setUint32(0, Math.floor(counter / 2 ** 32)); // high word (0 until year ~52k)
  dv.setUint32(4, counter >>> 0);                 // low word
  const key = await globalThis.crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, msg));
  const off = sig[sig.length - 1] & 0x0f;         // dynamic truncation
  const bin = ((sig[off] & 0x7f) << 24) | (sig[off + 1] << 16) | (sig[off + 2] << 8) | sig[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/* TOTP at an explicit instant (ms since epoch). */
export async function totpCode(secretB32, timeMs, stepSeconds = TOTP_STEP_SECONDS, digits = TOTP_DIGITS) {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  return hotp(base32Decode(secretB32), counter, digits);
}

/* Verify a 6-digit code with ±`windowSteps` drift. `nowMs` is injectable
   so tests can pin the clock (default: wall clock). */
export async function verifyTotp(secretB32, code, windowSteps = TOTP_WINDOW, nowMs = Date.now()) {
  const clean = String(code || "").replace(/\D/g, "");
  if (clean.length !== TOTP_DIGITS) return false;
  for (let w = -windowSteps; w <= windowSteps; w++) {
    if ((await totpCode(secretB32, nowMs + w * TOTP_STEP_SECONDS * 1000)) === clean) return true;
  }
  return false;
}

/* 20 random bytes → 32 unpadded base32 chars (160 bits — the RFC 4226
   recommendation for HOTP secret entropy). */
export function generateTotpSecret() {
  const buf = new Uint8Array(20);
  globalThis.crypto.getRandomValues(buf);
  return base32Encode(buf);
}

// Recovery codes: A-Z0-9 (36 symbols). 256 % 36 ≠ 0, so plain modulo over a
// byte would bias the first 16 symbols — rejection-sample any draw at or
// above the largest multiple of 36 within a byte (252).
export const RECOVERY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const RECOVERY_CODE_LENGTH = 10;
const RECOVERY_BIAS_LIMIT = Math.floor(256 / RECOVERY_ALPHABET.length) * RECOVERY_ALPHABET.length;

export function generateRecoveryCode(length = RECOVERY_CODE_LENGTH) {
  const out = [];
  const buf = new Uint8Array(length * 2); // generous: rejects only ~1.6% of draws
  while (out.length < length) {
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] >= RECOVERY_BIAS_LIMIT) continue; // unbiased rejection sampling
      out.push(RECOVERY_ALPHABET[buf[i] % RECOVERY_ALPHABET.length]);
    }
  }
  return out.join("");
}

/* n recovery codes; the CALLER stores them bcrypt-hashed and returns the
   plaintext exactly once. */
export function generateRecoveryCodes(count = 8, length = RECOVERY_CODE_LENGTH) {
  return Array.from({ length: count }, () => generateRecoveryCode(length));
}
