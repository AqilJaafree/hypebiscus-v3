// Error handling utilities
import { ErrorType, HypebiscusMCPError } from '../tools/types.js';
import { logger } from '../config.js';

/**
 * Wraps an async operation with error handling
 * @param operation - The async operation to execute
 * @param context - Context description for logging
 * @returns Result or throws formatted error
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HypebiscusMCPError) {
      logger.error(`${context}:`, error.message);
      throw error;
    }

    logger.error(`${context}:`, error);
    throw new HypebiscusMCPError(
      ErrorType.UNKNOWN_ERROR,
      `Failed to ${context}`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Formats an error for user-friendly display
 * @param error - The error to format
 * @returns Formatted error message
 */
export function formatError(error: unknown): string {
  if (error instanceof HypebiscusMCPError) {
    return `Error (${error.type}): ${error.message}${error.details ? `\nDetails: ${error.details}` : ''}`;
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return `Unknown error: ${String(error)}`;
}

/**
 * Creates a standardized error response
 * @param error - The error to format
 * @returns Error response object
 */
export function createErrorResponse(error: unknown): { error: string; type: string } {
  if (error instanceof HypebiscusMCPError) {
    return {
      error: error.message,
      type: error.type,
    };
  }

  return {
    error: error instanceof Error ? error.message : String(error),
    type: ErrorType.UNKNOWN_ERROR,
  };
}

/**
 * Checks if an error is a network/timeout error
 * @param error - The error to check
 * @returns True if network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof HypebiscusMCPError) {
    return error.type === ErrorType.NETWORK_ERROR;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    );
  }

  return false;
}

/**
 * Retries an operation with exponential backoff
 * @param operation - The operation to retry
 * @param maxRetries - Maximum number of retries
 * @param baseDelay - Base delay in milliseconds
 * @returns Operation result
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries - 1 && isNetworkError(error)) {
        const delay = baseDelay * Math.pow(2, attempt);
        logger.debug(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError;
}
