// Secure logging utility to prevent sensitive data exposure

const SENSITIVE_KEYS = [
  'privateKey',
  'secretKey',
  'mnemonic',
  'seed',
  'password',
  'apiKey',
  'api_key',
  'secret',
  'token',
  'auth',
  'authorization'
];

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Sanitizes objects to remove sensitive data before logging
 */
function sanitizeObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if key contains sensitive data
      if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    }

    return sanitized;
  }

  return obj;
}

/**
 * Secure logger that sanitizes sensitive data and respects production mode
 */
export const secureLog = {
  log: (...args: unknown[]) => {
    if (isProduction) return;
    console.log(...args.map(sanitizeObject));
  },

  warn: (...args: unknown[]) => {
    console.warn(...args.map(sanitizeObject));
  },

  error: (...args: unknown[]) => {
    console.error(...args.map(sanitizeObject));
  },

  debug: (...args: unknown[]) => {
    if (isProduction) return;
    console.debug(...args.map(sanitizeObject));
  },

  // For public keys and transaction signatures (safe to log)
  publicInfo: (...args: unknown[]) => {
    if (isProduction) return;
    console.log('[PUBLIC]', ...args);
  }
};

/**
 * Masks sensitive parts of strings (like API keys, tokens)
 */
export function maskSensitiveString(str: string, showFirst = 4, showLast = 4): string {
  if (!str || str.length <= showFirst + showLast) return str;

  const start = str.slice(0, showFirst);
  const end = str.slice(-showLast);
  const masked = '*'.repeat(Math.min(str.length - showFirst - showLast, 8));

  return `${start}${masked}${end}`;
}

/**
 * Safe logger for wallet addresses (shortens but doesn't hide)
 */
export function logWalletAddress(address: string, label = 'Wallet'): void {
  if (isProduction) return;

  const shortened = address.length > 12
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : address;

  console.log(`${label}:`, shortened);
}

export default secureLog;
