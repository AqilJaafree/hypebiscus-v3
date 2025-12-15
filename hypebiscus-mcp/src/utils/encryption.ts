// Encryption utilities for secure private key storage
import crypto from 'crypto';
import { logger } from '../config.js';

export class EncryptionService {
  private key: Buffer;

  constructor() {
    const encryptionKey = process.env.ENCRYPTION_KEY;

    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required for auto-reposition');
    }

    if (encryptionKey.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }

    this.key = Buffer.from(encryptionKey, 'hex');
    logger.info('Encryption service initialized');
  }

  /**
   * Encrypt text using AES-256-CBC
   * @param text - Plain text to encrypt
   * @returns Encrypted text and IV
   */
  encrypt(text: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypt text using AES-256-CBC
   * @param encrypted - Encrypted text in hex format
   * @param ivHex - Initialization vector in hex format
   * @returns Decrypted plain text
   */
  decrypt(encrypted: string, ivHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();
