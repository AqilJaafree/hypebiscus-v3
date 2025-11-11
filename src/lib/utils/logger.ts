/**
 * Secure logging utilities for Hypebiscus
 * Prevents PII, secrets, and sensitive data from being logged
 */

interface LogContext {
  userId?: string;
  walletAddress?: string;
  endpoint?: string;
  userAgent?: string;
  ip?: string;
  timestamp?: string;
  sessionId?: string;
}

interface SecurityEvent {
  type: 'WALLET_CONNECTION' | 'TRANSACTION_ATTEMPT' | 'API_ABUSE' | 'AUTH_FAILURE' | 'RATE_LIMIT_HIT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  context: LogContext;
  metadata?: Record<string, unknown>;
}

class SecureLogger {
  private static instance: SecureLogger;
  private sensitivePatterns = [
    /private[_\s]*key/i,
    /secret[_\s]*key/i,
    /api[_\s]*key/i,
    /password/i,
    /token/i,
    /seed[_\s]*phrase/i,
    /mnemonic/i,
    /\b[A-Za-z0-9]{32,}\b/, // Potential API keys/tokens
    /\b0x[a-fA-F0-9]{40,}\b/, // Ethereum-style addresses (partial)
    /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/, // Base58 addresses (Solana)
  ];

  private piiPatterns = [
    /\b[\w._%+-]+@[\w.-]+\.[A-Z|a-z]{2,}\b/, // Email
    /\b\d{3}-?\d{2}-?\d{4}\b/, // SSN
    /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card
    /\b\d{3}-?\d{3}-?\d{4}\b/, // Phone numbers
  ];

  private constructor() {}

  static getInstance(): SecureLogger {
    if (!SecureLogger.instance) {
      SecureLogger.instance = new SecureLogger();
    }
    return SecureLogger.instance;
  }

  /**
   * Sanitize sensitive data from log messages and objects
   */
  private sanitize(data: unknown): unknown {
    if (typeof data === 'string') {
      let sanitized = data;
      
      // Replace sensitive patterns
      this.sensitivePatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      });
      
      // Replace PII patterns
      this.piiPatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '[PII_REDACTED]');
      });
      
      return sanitized;
    }

    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        return data.map(item => this.sanitize(item));
      }
      
      const sanitized: Record<string, unknown> = {};
      
      for (const [key, value] of Object.entries(data)) {
        // Skip sensitive keys entirely
        if (this.isSensitiveKey(key)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitize(value);
        }
      }
      
      return sanitized;
    }

    return data;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password', 'secret', 'key', 'token', 'private', 'seed', 'mnemonic',
      'authorization', 'auth', 'signature', 'privateKey', 'secretKey',
      'apiKey', 'accessToken', 'refreshToken'
    ];
    
    return sensitiveKeys.some(sensitive => 
      key.toLowerCase().includes(sensitive.toLowerCase())
    );
  }

  /**
   * Sanitize wallet address for logging (show first 4 and last 4 chars)
   */
  private sanitizeWalletAddress(address: string): string {
    if (!address || address.length < 8) return '[WALLET_REDACTED]';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  /**
   * Log security events with proper sanitization
   */
  logSecurityEvent(event: SecurityEvent): void {
    const sanitizedEvent = {
      ...event,
      context: {
        ...event.context,
        walletAddress: event.context.walletAddress 
          ? this.sanitizeWalletAddress(event.context.walletAddress)
          : undefined,
        ip: event.context.ip 
          ? `${event.context.ip.split('.').slice(0, 3).join('.')}.xxx`
          : undefined,
        userAgent: event.context.userAgent?.slice(0, 100), // Truncate long user agents
      },
      metadata: event.metadata ? this.sanitize(event.metadata) : undefined,
      timestamp: new Date().toISOString(),
    };

    // In production, this would go to your logging service
    if (process.env.NODE_ENV === 'production') {
      // Send to external logging service (Sentry, LogRocket, etc.)
      this.sendToExternalLogger(sanitizedEvent);
    } else {
      console.log('[SECURITY_EVENT]', JSON.stringify(sanitizedEvent, null, 2));
    }
  }

  /**
   * Log general application events with sanitization
   */
  log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    const sanitizedData = data ? this.sanitize(data) : undefined;
    const logEntry = {
      level,
      message: this.sanitize(message),
      data: sanitizedData,
      timestamp: new Date().toISOString(),
    };

    if (process.env.NODE_ENV === 'production') {
      this.sendToExternalLogger(logEntry);
    } else {
      console[level](`[${level.toUpperCase()}]`, logEntry);
    }
  }

  /**
   * Log rate limiting events with potential abuse patterns
   */
  logRateLimitEvent(context: LogContext, attemptCount: number): void {
    this.logSecurityEvent({
      type: 'RATE_LIMIT_HIT',
      severity: attemptCount > 20 ? 'HIGH' : attemptCount > 10 ? 'MEDIUM' : 'LOW',
      context,
      metadata: {
        attemptCount,
        potentialAbuse: attemptCount > 20,
      }
    });
  }

  /**
   * Log wallet connection events
   */
  logWalletEvent(
    walletAddress: string,
    eventType: 'CONNECTED' | 'DISCONNECTED' | 'TRANSACTION_SIGNED',
    context: Partial<LogContext> = {}
  ): void {
    this.logSecurityEvent({
      type: 'WALLET_CONNECTION',
      severity: 'LOW',
      context: {
        ...context,
        walletAddress,
        timestamp: new Date().toISOString(),
      },
      metadata: {
        eventType
      }
    });
  }

  /**
   * Send logs to external service (implement based on your chosen provider)
   */
  private sendToExternalLogger(data: unknown): void {
    // Example implementations:
    
    // For Sentry:
    // Sentry.addBreadcrumb({ message: data.message, data: data.data });
    
    // For LogRocket:
    // LogRocket.log(data.level, data.message, data.data);
    
    // For custom webhook:
    // fetch('/api/logs', { method: 'POST', body: JSON.stringify(data) });
    
    // For now, just console log in production with timestamp
    console.log(`[PROD_LOG_${new Date().toISOString()}]`, JSON.stringify(data));
  }
}

// Export singleton instance
export const logger = SecureLogger.getInstance();

// Convenience methods
export const logSecurityEvent = (event: SecurityEvent) => logger.logSecurityEvent(event);
export const logInfo = (message: string, data?: unknown) => logger.log('info', message, data);
export const logWarn = (message: string, data?: unknown) => logger.log('warn', message, data);
export const logError = (message: string, data?: unknown) => logger.log('error', message, data);
export const logWalletEvent = (
  walletAddress: string,
  eventType: 'CONNECTED' | 'DISCONNECTED' | 'TRANSACTION_SIGNED',
  context?: Partial<LogContext>
) => logger.logWalletEvent(walletAddress, eventType, context);
export const logRateLimitEvent = (context: LogContext, attemptCount: number) => 
  logger.logRateLimitEvent(context, attemptCount);