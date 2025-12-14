// Wallet Deletion Handlers - Complete wallet data deletion
import { Context } from 'telegraf';
import { mcpClient } from '../../utils/mcpClient';
import { getOrCreateUser } from '../../services/db';

/**
 * Handle /deletewallet command
 * Shows warning and requires confirmation
 */
export async function handleDeleteWalletCommand(ctx: Context) {
  try {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) {
      await ctx.reply('❌ Unable to identify your account.');
      return;
    }

    // Check if user has any wallet (bot-generated, imported, or linked)
    const user = await getOrCreateUser(
      parseInt(telegramId),
      ctx.from?.username,
      ctx.from?.first_name,
      ctx.from?.last_name
    );

    if (!user.wallet) {
      await ctx.reply('ℹ️ No wallet is currently linked to your account.');
      return;
    }

    // Show comprehensive warning
    await ctx.reply(
      `🚨 *WALLET DELETION WARNING* 🚨\n\n` +
      `⚠️ This action will *PERMANENTLY DELETE*:\n\n` +
      `• ❌ Wallet link\n` +
      `• ❌ Credit balance\n` +
      `• ❌ Active subscriptions\n` +
      `• ❌ Transaction history\n` +
      `• ❌ Position links\n` +
      `• ❌ Bot-generated wallet keys (if any)\n\n` +
      `✅ What will NOT be deleted:\n` +
      `• Your Telegram account\n` +
      `• Your positions on Solana blockchain\n\n` +
      `🔒 *THIS CANNOT BE UNDONE!*\n\n` +
      `⚠️ If you have credits or an active subscription, they will be lost.\n\n` +
      `To proceed, send: /confirmdeletewallet`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error initiating wallet deletion:', error);
    await ctx.reply('❌ Failed to process deletion request. Please try again.');
  }
}

/**
 * Handle /confirm_delete_wallet command
 * Shows final confirmation with wallet address
 */
export async function handleConfirmDeleteWalletCommand(ctx: Context) {
  try {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) {
      await ctx.reply('❌ Unable to identify your account.');
      return;
    }

    // Get user's wallet (bot-generated, imported, or linked)
    const user = await getOrCreateUser(
      parseInt(telegramId),
      ctx.from?.username,
      ctx.from?.first_name,
      ctx.from?.last_name
    );

    if (!user.wallet) {
      await ctx.reply('ℹ️ No wallet is currently linked to your account.');
      return;
    }

    const walletAddress = user.wallet.publicKey;

    // Show final confirmation with wallet address
    const shortAddress = `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}`;

    await ctx.reply(
      `⚠️ *FINAL CONFIRMATION REQUIRED*\n\n` +
      `Wallet to be deleted:\n` +
      `\`${shortAddress}\`\n\n` +
      `Type exactly: *DELETE MY WALLET*\n\n` +
      `(This must match exactly, case-sensitive)`,
      { parse_mode: 'Markdown' }
    );

    // Store confirmation state in session
    if ((ctx as any).session) {
      (ctx as any).session.awaitingWalletDeletion = true;
      (ctx as any).session.walletToDelete = walletAddress;
    }

  } catch (error) {
    console.error('Error in confirm delete wallet:', error);
    await ctx.reply('❌ Failed to process confirmation. Please try again.');
  }
}

/**
 * Validation result for deletion confirmation
 */
interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Deleted records from the wallet deletion operation
 */
interface DeletedRecords {
  userLink: boolean;
  credits: number;
  subscriptions: number;
  creditTransactions: number;
  positionLinks: number;
  linkTokens: number;
  repositionExecutions: number;
  pendingTransactions: number;
  botGeneratedWallet: boolean;
}

/**
 * Validate that the user is in the deletion flow
 */
function validateDeletionFlow(session: any): ValidationResult {
  if (!session || !session.awaitingWalletDeletion) {
    return { isValid: false }; // Not in deletion flow, silently skip
  }
  return { isValid: true };
}

/**
 * Validate that the confirmation text matches exactly
 */
function validateConfirmationText(text: string): ValidationResult {
  if (text !== 'DELETE MY WALLET') {
    return {
      isValid: false,
      errorMessage:
        `❌ Confirmation failed.\n\n` +
        `You typed: "${text}"\n` +
        `Required: "DELETE MY WALLET"\n\n` +
        `Please type it exactly as shown (case-sensitive).`
    };
  }
  return { isValid: true };
}

/**
 * Clear the deletion session state
 */
function clearDeletionSession(session: any): string | null {
  session.awaitingWalletDeletion = false;
  const walletAddress = session.walletToDelete;
  session.walletToDelete = null;
  return walletAddress;
}

/**
 * Build a summary line for a deleted record type
 */
function buildRecordLine(
  condition: boolean | number,
  text: string
): string {
  if (!condition) return '';

  if (typeof condition === 'number' && condition > 0) {
    return `• ✅ ${condition} ${text}\n`;
  }

  if (condition === true) {
    return `• ✅ ${text}\n`;
  }

  return '';
}

/**
 * Build the deletion summary message
 */
function buildDeletionSummary(
  walletAddress: string | null,
  deletedRecords: DeletedRecords
): string {
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}`
    : 'Unknown';

  let summary =
    `✅ *Wallet Deleted Successfully*\n\n` +
    `Wallet: \`${shortAddress}\`\n\n` +
    `📊 *Deleted Records:*\n`;

  summary += buildRecordLine(deletedRecords.userLink, 'Wallet link removed');
  summary += buildRecordLine(deletedRecords.credits, 'credit record(s)');
  summary += buildRecordLine(deletedRecords.subscriptions, 'subscription(s)');
  summary += buildRecordLine(deletedRecords.creditTransactions, 'transaction(s)');
  summary += buildRecordLine(deletedRecords.positionLinks, 'position link(s)');
  summary += buildRecordLine(deletedRecords.linkTokens, 'link token(s)');
  summary += buildRecordLine(deletedRecords.repositionExecutions, 'reposition execution(s)');
  summary += buildRecordLine(deletedRecords.pendingTransactions, 'pending transaction(s)');
  summary += buildRecordLine(deletedRecords.botGeneratedWallet, 'Bot-generated wallet keys');

  summary +=
    `\n✨ All wallet data has been permanently removed.\n\n` +
    `You can link a new wallet anytime using /link`;

  return summary;
}

/**
 * Execute the wallet deletion and send response
 */
async function executeDeletion(
  ctx: Context,
  telegramId: string,
  walletAddress: string | null
): Promise<void> {
  await ctx.reply('🗑️ Deleting wallet and all associated data...');

  const result = await mcpClient.deleteWalletCompletely(telegramId);

  if (result.success) {
    const summary = buildDeletionSummary(walletAddress, result.deletedRecords);
    await ctx.reply(summary, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('❌ Failed to delete wallet. Please try again or contact support.');
  }
}

/**
 * Handle errors during wallet deletion
 */
async function handleDeletionError(ctx: Context, error: unknown): Promise<void> {
  console.error('Error deleting wallet:', error);

  // Clear session state on error
  if ((ctx as any).session) {
    (ctx as any).session.awaitingWalletDeletion = false;
    (ctx as any).session.walletToDelete = null;
  }

  await ctx.reply(
    `❌ *Deletion Failed*\n\n` +
    `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
    `Please try again or contact support.`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * Handle confirmation text "DELETE MY WALLET"
 * Actually performs the deletion
 */
export async function handleDeleteWalletConfirmation(ctx: Context) {
  try {
    const text = (ctx.message as any)?.text;
    const session = (ctx as any).session;

    // Validate deletion flow
    const flowValidation = validateDeletionFlow(session);
    if (!flowValidation.isValid) {
      return; // Not in deletion flow, silently skip
    }

    // Validate confirmation text
    const textValidation = validateConfirmationText(text);
    if (!textValidation.isValid) {
      await ctx.reply(textValidation.errorMessage!);
      return;
    }

    // Validate telegram ID
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) {
      await ctx.reply('❌ Unable to identify your account.');
      return;
    }

    // Clear session and get wallet address
    const walletAddress = clearDeletionSession(session);

    // Execute deletion
    await executeDeletion(ctx, telegramId, walletAddress);

  } catch (error) {
    await handleDeletionError(ctx, error);
  }
}

/**
 * Handle /cancel command to cancel deletion
 */
export async function handleCancelDeletion(ctx: Context) {
  const session = (ctx as any).session;

  if (session && session.awaitingWalletDeletion) {
    session.awaitingWalletDeletion = false;
    session.walletToDelete = null;

    await ctx.reply(
      `✅ Wallet deletion cancelled.\n\n` +
      `Your wallet data is safe.`
    );
  }
}
