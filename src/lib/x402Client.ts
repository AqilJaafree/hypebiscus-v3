/**
 * Payment Client for Subscription and Credits
 * Creates USDC payment transactions for subscriptions and credits
 */

import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// USDC mint addresses
const USDC_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Treasury wallet for receiving payments
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || 'YV2C7YyrkH67jTRZHvwovJfSK6BqiJJMycmRSXSWEy2';

// Network configuration
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta' ? 'solana' : 'solana-devnet';
const USDC_MINT = NETWORK === 'solana' ? USDC_MAINNET : USDC_DEVNET;
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Pricing (USDC micro-units, 6 decimals)
export const SUBSCRIPTION_PRICE = 4.99;
export const SUBSCRIPTION_PRICE_MICRO_USDC = 4_990_000; // $4.99 USDC

export const CREDIT_PACKAGES = {
  trial: { amount: 1, price: 0.01, priceInMicro: 10_000 }, // Trial: 1 credit for testing
  starter: { amount: 1000, price: 10.00, priceInMicro: 10_000_000 },
  power: { amount: 2500, price: 25.00, priceInMicro: 25_000_000 },
  pro: { amount: 5000, price: 50.00, priceInMicro: 50_000_000 },
} as const;

export type CreditPackage = keyof typeof CREDIT_PACKAGES;

interface PaymentResult {
  success: boolean;
  signature?: string;
  error?: string;
}

/**
 * Payment Client - Creates USDC transfer transactions
 */
class PaymentClient {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');
  }

  /**
   * Purchase subscription - Creates USDC transfer transaction
   * @param walletPublicKey - User's wallet public key
   * @param signTransaction - Wallet adapter's sign transaction function
   * @returns Payment result with transaction signature
   */
  async purchaseSubscription(
    walletPublicKey: PublicKey,
    signTransaction: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>
  ): Promise<PaymentResult> {
    try {
      console.log('Purchasing subscription for:', walletPublicKey.toBase58());

      // Create USDC transfer transaction
      const transaction = new Transaction();
      const treasuryPubkey = new PublicKey(TREASURY_WALLET);
      const usdcMintPubkey = new PublicKey(USDC_MINT);

      // Get associated token accounts
      const fromTokenAccount = await getAssociatedTokenAddress(
        usdcMintPubkey,
        walletPublicKey
      );

      const toTokenAccount = await getAssociatedTokenAddress(
        usdcMintPubkey,
        treasuryPubkey
      );

      // Create transfer instruction
      const transferIx = createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        walletPublicKey,
        SUBSCRIPTION_PRICE_MICRO_USDC,
        [],
        TOKEN_PROGRAM_ID
      );

      transaction.add(transferIx);

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletPublicKey;

      // Sign transaction with wallet
      const signedTx = await signTransaction(transaction) as Transaction;

      // Send and confirm transaction
      const signature = await this.connection.sendRawTransaction(signedTx.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      console.log('Subscription payment successful:', signature);

      // Call backend to create subscription record
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_subscription',
          walletAddress: walletPublicKey.toBase58(),
          paymentTxSignature: signature,
          x402PaymentProof: signature, // For now use signature as proof
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to record subscription');
      }

      return {
        success: true,
        signature,
      };
    } catch (error) {
      console.error('Subscription purchase failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment failed',
      };
    }
  }

  /**
   * Purchase credits - Creates USDC transfer transaction
   * @param walletPublicKey - User's wallet public key
   * @param packageName - Credit package to purchase
   * @param signTransaction - Wallet adapter's sign transaction function
   * @returns Payment result with transaction signature
   */
  async purchaseCredits(
    walletPublicKey: PublicKey,
    packageName: CreditPackage,
    signTransaction: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>
  ): Promise<PaymentResult> {
    try {
      const pkg = CREDIT_PACKAGES[packageName];
      console.log(`Purchasing ${pkg.amount} credits for $${pkg.price}`);

      // Create USDC transfer transaction
      const transaction = new Transaction();
      const treasuryPubkey = new PublicKey(TREASURY_WALLET);
      const usdcMintPubkey = new PublicKey(USDC_MINT);

      // Get associated token accounts
      const fromTokenAccount = await getAssociatedTokenAddress(
        usdcMintPubkey,
        walletPublicKey
      );

      const toTokenAccount = await getAssociatedTokenAddress(
        usdcMintPubkey,
        treasuryPubkey
      );

      // Create transfer instruction
      const transferIx = createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        walletPublicKey,
        pkg.priceInMicro,
        [],
        TOKEN_PROGRAM_ID
      );

      transaction.add(transferIx);

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletPublicKey;

      // Sign transaction with wallet
      const signedTx = await signTransaction(transaction) as Transaction;

      // Send and confirm transaction
      const signature = await this.connection.sendRawTransaction(signedTx.serialize());
      await this.connection.confirmTransaction(signature, 'confirmed');

      console.log('Credits payment successful:', signature);

      // Call backend to add credits
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'purchase_credits',
          walletAddress: walletPublicKey.toBase58(),
          creditsAmount: pkg.amount,
          usdcAmountPaid: pkg.price,
          paymentTxSignature: signature,
          x402PaymentProof: signature, // For now use signature as proof
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to record credits purchase');
      }

      return {
        success: true,
        signature,
      };
    } catch (error) {
      console.error('Credits purchase failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment failed',
      };
    }
  }
}

// Export singleton instance
export const x402PaymentClient = new PaymentClient();
