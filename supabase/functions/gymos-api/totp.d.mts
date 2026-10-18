// Ambient declarations for totp.mjs so tsc (CI type-check) resolves the
// relative import from index.ts. Runtime behaviour lives in totp.mjs and is
// exercised directly by tests/expiry-2fa.test.mjs (RFC 6238 vectors).

export declare const B32_ALPHABET: string;
export declare const TOTP_STEP_SECONDS: number;
export declare const TOTP_DIGITS: number;
export declare const TOTP_WINDOW: number;

export declare function base32Encode(bytes: Uint8Array): string;
export declare function base32Decode(text: string): Uint8Array;
export declare function totpCode(secretB32: string, timeMs: number, stepSeconds?: number, digits?: number): Promise<string>;
export declare function verifyTotp(secretB32: string, code: string, windowSteps?: number, nowMs?: number): Promise<boolean>;
export declare function generateTotpSecret(): string;
export declare const RECOVERY_ALPHABET: string;
export declare const RECOVERY_CODE_LENGTH: number;
export declare function generateRecoveryCode(length?: number): string;
export declare function generateRecoveryCodes(count?: number, length?: number): string[];
