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
 * Handle confirmation text "DELETE MY WALLET"
 * Actually performs the deletion
 */
export async function handleDeleteWalletConfirmation(ctx: Context) {
  try {
    const text = (ctx.message as any)?.text;
    const session = (ctx as any).session;

    // Check if we're awaiting deletion confirmation
    if (!session || !session.awaitingWalletDeletion) {
      return; // Not in deletion flow
    }

    // Check if text matches exactly
    if (text !== 'DELETE MY WALLET') {
      await ctx.reply(
        `❌ Confirmation failed.\n\n` +
        `You typed: "${text}"\n` +
        `Required: "DELETE MY WALLET"\n\n` +
        `Please type it exactly as shown (case-sensitive).`
      );
      return;
    }

    const telegramId = ctx.from?.id.toString();
    if (!telegramId) {
      await ctx.reply('❌ Unable to identify your account.');
      return;
    }

    // Clear session state
    session.awaitingWalletDeletion = false;
    const walletAddress = session.walletToDelete;
    session.walletToDelete = null;

    // Show processing message
    await ctx.reply('🗑️ Deleting wallet and all associated data...');

    // Perform the deletion
    const result = await mcpClient.deleteWalletCompletely(telegramId);

    if (result.success) {
      // Show detailed deletion summary
      let summary =
        `✅ *Wallet Deleted Successfully*\n\n` +
        `Wallet: \`${walletAddress?.slice(0, 8)}...${walletAddress?.slice(-8)}\`\n\n` +
        `📊 *Deleted Records:*\n`;

      if (result.deletedRecords.userLink) {
        summary += `• ✅ Wallet link removed\n`;
      }
      if (result.deletedRecords.credits > 0) {
        summary += `• ✅ ${result.deletedRecords.credits} credit record(s)\n`;
      }
      if (result.deletedRecords.subscriptions > 0) {
        summary += `• ✅ ${result.deletedRecords.subscriptions} subscription(s)\n`;
      }
      if (result.deletedRecords.creditTransactions > 0) {
        summary += `• ✅ ${result.deletedRecords.creditTransactions} transaction(s)\n`;
      }
      if (result.deletedRecords.positionLinks > 0) {
        summary += `• ✅ ${result.deletedRecords.positionLinks} position link(s)\n`;
      }
      if (result.deletedRecords.linkTokens > 0) {
        summary += `• ✅ ${result.deletedRecords.linkTokens} link token(s)\n`;
      }
      if (result.deletedRecords.repositionExecutions > 0) {
        summary += `• ✅ ${result.deletedRecords.repositionExecutions} reposition execution(s)\n`;
      }
      if (result.deletedRecords.pendingTransactions > 0) {
        summary += `• ✅ ${result.deletedRecords.pendingTransactions} pending transaction(s)\n`;
      }
      if (result.deletedRecords.botGeneratedWallet) {
        summary += `• ✅ Bot-generated wallet keys\n`;
      }

      summary +=
        `\n✨ All wallet data has been permanently removed.\n\n` +
        `You can link a new wallet anytime using /link`;

      await ctx.reply(summary, { parse_mode: 'Markdown' });

    } else {
      await ctx.reply('❌ Failed to delete wallet. Please try again or contact support.');
    }

  } catch (error) {
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
