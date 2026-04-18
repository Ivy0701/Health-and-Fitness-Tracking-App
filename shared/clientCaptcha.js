/** Client-side captcha shared by user login and admin login (no server round-trip). */

export const CLIENT_CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CLIENT_CAPTCHA_LENGTH = 4;

export const CLIENT_CAPTCHA_MESSAGES = {
  required: "Verification code is required.",
  incorrect: "Incorrect verification code.",
};

/**
 * @returns {string} Uppercase A–Z / digits string of length CLIENT_CAPTCHA_LENGTH
 */
export function generateClientCaptchaString() {
  const chars = CLIENT_CAPTCHA_CHARS;
  const len = CLIENT_CAPTCHA_LENGTH;
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/**
 * Normalize user input for comparison (trim + uppercase).
 * @param {string} raw
 */
export function normalizeCaptchaInput(raw) {
  return String(raw || "").trim().toUpperCase();
}

/**
 * Same rules as user login: empty/wrong messages; refresh when empty or wrong (code !== expected).
 * @param {string} rawInput
 * @param {string} expectedCaptcha current captcha string (e.g. ref.value)
 */
export function getClientCaptchaValidation(rawInput, expectedCaptcha) {
  const code = normalizeCaptchaInput(rawInput);
  const expected = String(expectedCaptcha || "");
  let message = "";
  if (!code) {
    message = CLIENT_CAPTCHA_MESSAGES.required;
  } else if (code !== expected) {
    message = CLIENT_CAPTCHA_MESSAGES.incorrect;
  }
  const ok = !message;
  const shouldRegenerate = !ok && code !== expected;
  return { ok, message, shouldRegenerate };
}
