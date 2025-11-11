// Input validation utilities
import { VALIDATION } from '../config.js';
import { ErrorType, HypebiscusMCPError } from '../tools/types.js';

/**
 * Validates a Solana address format
 * @param address - The address to validate
 * @returns True if valid, throws error if invalid
 */
export function validateSolanaAddress(address: string): boolean {
  // Check length
  if (address.length < VALIDATION.minPoolAddressLength || address.length > VALIDATION.maxPoolAddressLength) {
    throw new HypebiscusMCPError(
      ErrorType.INVALID_POOL_ADDRESS,
      `Invalid pool address length: ${address.length}. Must be between 32-44 characters.`
    );
  }

  // Check base58 format
  if (!VALIDATION.base58Regex.test(address)) {
    throw new HypebiscusMCPError(
      ErrorType.INVALID_POOL_ADDRESS,
      'Invalid pool address format. Must be a valid base58 string.'
    );
  }

  return true;
}

/**
 * Sanitizes a string input to prevent injection attacks
 * @param input - The input string to sanitize
 * @param maxLength - Maximum allowed length
 * @returns Sanitized string
 */
export function sanitizeString(input: string, maxLength: number = 100): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML
    .slice(0, maxLength);
}

/**
 * Validates that a number is within acceptable range
 * @param value - The number to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns True if valid, false otherwise
 */
export function isValidNumber(value: number, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): boolean {
  return typeof value === 'number' && !isNaN(value) && value >= min && value <= max;
}

/**
 * Safely parses a numeric string
 * @param value - The value to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed number or default
 */
export function safeParseNumber(value: string | number | undefined, defaultValue: number = 0): number {
  if (typeof value === 'number') {
    return isValidNumber(value) ? value : defaultValue;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isValidNumber(parsed) ? parsed : defaultValue;
  }

  return defaultValue;
}
