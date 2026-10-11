const CZ_PREFIX = "+420";
const SK_PREFIX = "+421";

// Remove spaces, dashes, parentheses
function strip(input: string): string {
  return input.replace(/[\s\-().]/g, "");
}

/**
 * Normalize a phone number to E.164 format.
 * Handles Czech/Slovak numbers with or without country code.
 * Returns null if the input cannot be normalized.
 */
export function normalizePhone(input: string): string | null {
  let phone = strip(input.trim());
  if (!phone) return null;

  // Already E.164
  if (/^\+\d{10,15}$/.test(phone)) return phone;

  // 00420... → +420...
  if (phone.startsWith("00")) {
    phone = "+" + phone.slice(2);
    if (/^\+\d{10,15}$/.test(phone)) return phone;
  }

  // 9-digit Czech number
  if (/^\d{9}$/.test(phone)) return CZ_PREFIX + phone;

  // Czech with leading 0 (0602...)
  if (/^0\d{9}$/.test(phone)) return CZ_PREFIX + phone.slice(1);

  // Slovak 10-digit starting with 09
  if (/^09\d{8}$/.test(phone)) return SK_PREFIX + phone.slice(1);

  return null;
}

/**
 * Check if a phone number is valid E.164.
 */
export function isValidE164(phone: string): boolean {
  return /^\+\d{10,15}$/.test(phone);
}
