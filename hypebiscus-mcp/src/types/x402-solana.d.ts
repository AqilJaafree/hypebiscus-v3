/**
 * Type definitions for x402-solana
 * These are placeholder types until the package is installed
 *
 * Install: pnpm install x402-solana
 */

declare module 'x402-solana/server' {
  export interface X402PaymentHandlerConfig {
    network: 'solana' | 'solana-devnet';
    treasuryAddress: string;
    facilitatorUrl: string;
    rpcUrl?: string;
    defaultToken?: string;
  }

  export interface PaymentRequirements {
    price: {
      amount: string;
      asset: {
        address: string;
      };
    };
    network: 'solana' | 'solana-devnet';
    config: {
      description: string;
      resource: string;
      mimeType?: string;
      maxTimeoutSeconds?: number;
    };
  }

  export interface SettlementResult {
    signature?: string;
    [key: string]: unknown;
  }

  export class X402PaymentHandler {
    constructor(config: X402PaymentHandlerConfig);

    extractPayment(headers: Record<string, string | string[] | undefined>): string | null;

    createPaymentRequirements(requirements: PaymentRequirements): Promise<PaymentRequirements>;

    create402Response(requirements: PaymentRequirements): {
      status: number;
      body: Record<string, unknown>;
    };

    verifyPayment(paymentHeader: string, requirements: PaymentRequirements): Promise<boolean>;

    settlePayment(
      paymentHeader: string,
      requirements: PaymentRequirements
    ): Promise<SettlementResult>;
  }
}
