// src/lib/utils/errorHandling.ts

export enum ErrorType {
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  POOL_NOT_FOUND = 'POOL_NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  constructor(
    public type: ErrorType,
    message: string,
    public details?: string,
    public code?: string | number,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
  }

  get userMessage(): string {
    return this.getUserFriendlyMessage();
  }

  private getUserFriendlyMessage(): string {
    switch (this.type) {
      case ErrorType.WALLET_NOT_CONNECTED:
        return 'Please connect your wallet to continue.';
      case ErrorType.TRANSACTION_FAILED:
        return 'Transaction failed. Please try again.';
      case ErrorType.API_ERROR:
        return 'Service temporarily unavailable. Please try again later.';
      case ErrorType.NETWORK_ERROR:
        return 'Network error. Please check your connection.';
      case ErrorType.INSUFFICIENT_BALANCE:
        return 'Insufficient balance to complete this transaction.';
      case ErrorType.POOL_NOT_FOUND:
        return 'Requested pool not found. Please try a different pool.';
      case ErrorType.INVALID_INPUT:
        return 'Invalid input provided. Please check your data.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }
}

/**
 * Error classification utilities
 */
export function classifyError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    // Classify common error patterns
    const message = error.message.toLowerCase();
    
    if (message.includes('wallet') && message.includes('not connected')) {
      return new AppError(
        ErrorType.WALLET_NOT_CONNECTED,
        error.message,
        error.stack,
        undefined,
        true
      );
    }
    
    if (message.includes('transaction') && message.includes('failed')) {
      return new AppError(
        ErrorType.TRANSACTION_FAILED,
        error.message,
        error.stack,
        undefined,
        true
      );
    }
    
    if (message.includes('network') || message.includes('fetch')) {
      return new AppError(
        ErrorType.NETWORK_ERROR,
        error.message,
        error.stack,
        undefined,
        true
      );
    }
    
    if (message.includes('insufficient') && message.includes('balance')) {
      return new AppError(
        ErrorType.INSUFFICIENT_BALANCE,
        error.message,
        error.stack,
        undefined,
        false
      );
    }
    
    if (message.includes('pool') && message.includes('not found')) {
      return new AppError(
        ErrorType.POOL_NOT_FOUND,
        error.message,
        error.stack,
        undefined,
        true
      );
    }
    
    // Default to unknown error
    return new AppError(
      ErrorType.UNKNOWN_ERROR,
      error.message,
      error.stack,
      undefined,
      true
    );
  }

  // Handle non-Error objects
  return new AppError(
    ErrorType.UNKNOWN_ERROR,
    'An unknown error occurred',
    typeof error === 'string' ? error : JSON.stringify(error),
    undefined,
    true
  );
}

/**
 * Error handler for async operations
 */
export async function handleAsyncOperation<T>(
  operation: () => Promise<T>,
  context: string = 'Operation'
): Promise<{ data: T | null; error: AppError | null }> {
  try {
    const data = await operation();
    return { data, error: null };
  } catch (error) {
    const classifiedError = classifyError(error);
    // Log error safely without exposing sensitive details
    console.error(`${context} failed:`, {
      type: classifiedError.type,
      message: classifiedError.userMessage,
      code: classifiedError.code,
      // Only include stack trace in development
      ...(process.env.NODE_ENV === 'development' && { details: classifiedError.details })
    });
    return { data: null, error: classifiedError };
  }
}

/**
 * Error boundary hook for React components
 */
export function useErrorHandler() {
  return {
    handleError: (error: unknown, context?: string) => {
      const appError = classifyError(error);
      
      // Log error for debugging without sensitive details
      console.error(`Error in ${context || 'component'}:`, {
        type: appError.type,
        message: appError.userMessage,
        code: appError.code,
        // Only include stack trace in development
        ...(process.env.NODE_ENV === 'development' && { details: appError.details })
      });
      
      // You could integrate with a toast notification system here
      // toast.error(appError.userMessage);
      
      return appError;
    },
    
    handleAsyncError: async <T>(
      operation: () => Promise<T>,
      context?: string
    ): Promise<T | null> => {
      try {
        return await operation();
      } catch (error) {
        const appError = classifyError(error);
        console.error(`Async error in ${context || 'operation'}:`, {
          type: appError.type,
          message: appError.userMessage,
          code: appError.code,
          // Only include stack trace in development
          ...(process.env.NODE_ENV === 'development' && { details: appError.details })
        });
        
        // You could show error UI here
        // toast.error(appError.userMessage);
        
        return null;
      }
    }
  };
}

/**
 * Retry utility for failed operations
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  context?: string
): Promise<T> {
  let lastError: AppError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = classifyError(error);
      
      // Don't retry non-recoverable errors
      if (!lastError.recoverable) {
        throw lastError;
      }
      
      if (attempt === maxRetries) {
        console.error(`${context || 'Operation'} failed after ${maxRetries} attempts:`, lastError);
        throw lastError;
      }
      
      console.warn(`${context || 'Operation'} attempt ${attempt} failed, retrying...`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  
  throw lastError!;
}

/**
 * Validation utilities
 */
export function validateInput(
  value: unknown,
  rules: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'object';
    min?: number;
    max?: number;
    pattern?: RegExp;
  },
  fieldName: string = 'Input'
): void {
  const { required = false, type, min, max, pattern } = rules;
  
  // Check required
  if (required && (value === null || value === undefined || value === '')) {
    throw new AppError(
      ErrorType.INVALID_INPUT,
      `${fieldName} is required`,
      undefined,
      undefined,
      true
    );
  }
  
  // Skip further validation if value is empty and not required
  if (!required && (value === null || value === undefined || value === '')) {
    return;
  }
  
  // Check type
  if (type && typeof value !== type) {
    throw new AppError(
      ErrorType.INVALID_INPUT,
      `${fieldName} must be of type ${type}`,
      undefined,
      undefined,
      true
    );
  }
  
  // Check numeric constraints
  if (type === 'number' && typeof value === 'number') {
    if (min !== undefined && value < min) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        `${fieldName} must be at least ${min}`,
        undefined,
        undefined,
        true
      );
    }
    
    if (max !== undefined && value > max) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        `${fieldName} must be at most ${max}`,
        undefined,
        undefined,
        true
      );
    }
  }
  
  // Check string constraints
  if (type === 'string' && typeof value === 'string') {
    if (min !== undefined && value.length < min) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        `${fieldName} must be at least ${min} characters`,
        undefined,
        undefined,
        true
      );
    }
    
    if (max !== undefined && value.length > max) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        `${fieldName} must be at most ${max} characters`,
        undefined,
        undefined,
        true
      );
    }
    
    if (pattern && !pattern.test(value)) {
      throw new AppError(
        ErrorType.INVALID_INPUT,
        `${fieldName} format is invalid`,
        undefined,
        undefined,
        true
      );
    }
  }
}