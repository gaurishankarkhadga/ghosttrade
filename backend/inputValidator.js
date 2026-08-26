// =====================================================
// INPUT VALIDATOR — Zero-Dependency Sanitization Library
// Prevents NoSQL Injection, XSS, and input abuse.
// Pure functions — no side effects, no dependencies.
// =====================================================

/**
 * Validates and sanitizes an email address.
 * - Strips MongoDB operator keys ($gt, $regex, etc.)
 * - Validates RFC 5322 format (simplified)
 * - Normalizes to lowercase
 * - Max 254 characters (RFC 5321)
 * 
 * @param {*} email — Raw input (may not be a string)
 * @returns {{ valid: boolean, sanitized: string|null, error?: string }}
 */
export function sanitizeEmail(email) {
  // Guard: must be a string (blocks { $gt: "" } NoSQL injection)
  if (!email || typeof email !== 'string') {
    return { valid: false, sanitized: null, error: 'Email must be a non-empty string.' };
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length > 254) {
    return { valid: false, sanitized: null, error: 'Email exceeds maximum length.' };
  }

  // Simplified RFC 5322 check
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, sanitized: null, error: 'Invalid email format.' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validates a password against security policy.
 * Policy: Min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit.
 * 
 * @param {*} password — Raw input
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password must be a non-empty string.' };
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters.' };
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password exceeds maximum length.' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter.' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter.' };
  }

  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must contain at least one digit.' };
  }

  return { valid: true };
}

/**
 * Sanitizes a generic string input.
 * - Strips null bytes and control characters
 * - Trims whitespace
 * - Enforces max length
 * 
 * @param {*} str — Raw input
 * @param {number} maxLength — Maximum allowed length (default: 500)
 * @returns {string|null} — Sanitized string or null if invalid
 */
export function sanitizeString(str, maxLength = 500) {
  if (!str || typeof str !== 'string') return null;

  // Remove null bytes and control characters (except newlines and tabs)
  let cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  cleaned = cleaned.trim();

  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength);
  }

  return cleaned || null;
}

/**
 * Recursively strips MongoDB operator keys from an object.
 * Prevents NoSQL injection via query operator payloads like { $gt: "" }.
 * 
 * @param {*} obj — Input object (from request.body)
 * @returns {*} — Cleaned object with all $-prefixed keys removed
 */
export function sanitizeMongoQuery(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeMongoQuery);

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    // Strip any key starting with $ (MongoDB operators)
    if (key.startsWith('$')) continue;
    // Strip any key containing . (nested field access)
    if (key.includes('.')) continue;
    cleaned[key] = sanitizeMongoQuery(value);
  }
  return cleaned;
}

/**
 * Validates and sanitizes a financial ticker symbol.
 * Whitelist: A-Z, 0-9, hyphen, period only. Max 15 chars.
 * 
 * @param {*} ticker — Raw input
 * @returns {string|null} — Sanitized ticker or null
 */
export function sanitizeTicker(ticker) {
  if (!ticker || typeof ticker !== 'string') return null;

  const cleaned = ticker.trim().toUpperCase().replace(/[^A-Z0-9\-\.]/g, '');
  if (cleaned.length === 0 || cleaned.length > 15) return null;

  return cleaned;
}

/**
 * Validates that a value is one of the allowed enum values.
 * 
 * @param {*} value — Input to validate
 * @param {string[]} allowedValues — Array of valid values
 * @returns {boolean}
 */
export function validateEnum(value, allowedValues) {
  return typeof value === 'string' && allowedValues.includes(value);
}

/**
 * Sanitizes a name string (for signup).
 * Allows letters, spaces, hyphens, apostrophes. Max 100 chars.
 * 
 * @param {*} name — Raw input
 * @returns {string|null}
 */
export function sanitizeName(name) {
  if (!name || typeof name !== 'string') return null;

  // Remove anything that's not a letter, space, hyphen, apostrophe, or period
  let cleaned = name.trim().replace(/[^\p{L}\p{M}\s\-'.]/gu, '');
  if (cleaned.length > 100) cleaned = cleaned.substring(0, 100);
  if (cleaned.length < 1) return null;

  return cleaned;
}
