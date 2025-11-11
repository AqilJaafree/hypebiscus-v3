/**
 * Credits Handler - Manage pay-per-use credits
 *
 * Commands:
 * - /credits - View credit balance and transaction history
 * - /topup - Purchase credits via website link
 */

import { Context } from 'telegraf';
import { mcpClient } from '../../utils/mcpClient';
import { getOrCreateUser } from '../../services/db';

/**
 * Handle /credits command - View credit balance
 */
export async function handleCreditsCommand(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('❌ Unable to identify user');
    return;
  }

  try {
    const user = await getOrCreateUser(
      telegramId,
      ctx.from?.username,
      ctx.from?.first_name,
      ctx.from?.last_name
    );

    // Check if wallet is linked
    const linkedAccount = await mcpClient.getLinkedAccount(telegramId.toString());

    if (!linkedAccount.isLinked || !linkedAccount.walletAddress) {
      await ctx.reply(
        '❌ **No Wallet Linked**\n\n' +
        'You need to link your website wallet to check credits.\n\n' +
        'Use `/link` command or scan the QR code on the website.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Check subscription status
    const subscriptionStatus = await mcpClient.checkSubscription(linkedAccount.walletAddress);

    if (subscriptionStatus.isActive) {
      await ctx.reply(
        '✅ **Active Subscription**\n\n' +
        `Tier: ${subscriptionStatus.tier}\n` +
        `Expires: ${new Date(subscriptionStatus.expiresAt!).toLocaleDateString()}\n` +
        `Days Remaining: ${subscriptionStatus.daysRemaining}\n\n` +
        '🎉 You have **unlimited** auto-repositions!\n\n' +
        '_No need for credits while your subscription is active._',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Get credit balance
    const creditBalance = await mcpClient.getCreditBalance(linkedAccount.walletAddress);

    const balanceMessage =
      '💳 **Your Credits Balance**\n\n' +
      `💰 Current Balance: **${creditBalance.balance}** credits\n` +
      `📥 Total Purchased: ${creditBalance.totalPurchased} credits\n` +
      `📤 Total Used: ${creditBalance.totalUsed} credits\n\n` +
      `🔄 Repositions Available: **${Math.floor(creditBalance.balance / 1)}**\n\n` +
      `💵 Price: $0.01 USDC per credit (1 credit = 1 reposition)\n\n`;

    if (creditBalance.balance === 0) {
      await ctx.reply(
        balanceMessage +
        '⚠️ **You have no credits!**\n\n' +
        'Use `/topup` to purchase credits or `/subscribe` for unlimited repositions.',
        { parse_mode: 'Markdown' }
      );
    } else if (creditBalance.balance < 10) {
      await ctx.reply(
        balanceMessage +
        '⚠️ **Low balance warning!**\n\n' +
        'Use `/topup` to purchase more credits.',
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(
        balanceMessage +
        'Use `/topup` to purchase more credits or `/subscribe` for unlimited.',
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('Error getting credits:', error);
    await ctx.reply(
      '❌ Failed to fetch credit balance.\n\n' +
      'Please try again later or contact support if the issue persists.'
    );
  }
}

/**
 * Handle /topup command - Purchase credits
 */
export async function handleTopupCommand(ctx: Context) {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    await ctx.reply('❌ Unable to identify user');
    return;
  }

  try {
    // Check if wallet is linked
    const linkedAccount = await mcpClient.getLinkedAccount(telegramId.toString());

    if (!linkedAccount.isLinked || !linkedAccount.walletAddress) {
      await ctx.reply(
        '❌ **No Wallet Linked**\n\n' +
        'You need to link your website wallet to purchase credits.\n\n' +
        'Steps:\n' +
        '1. Visit https://hypebiscus.com\n' +
        '2. Connect your wallet\n' +
        '3. Go to Settings → Link Telegram\n' +
        '4. Scan the QR code or use the link code\n\n' +
        'Use `/link <CODE>` to link manually.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Generate website link
    const websiteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hypebiscus.com';
    const purchaseUrl = `${websiteUrl}/credits?wallet=${linkedAccount.walletAddress}`;

    await ctx.reply(
      '💳 **Purchase Credits**\n\n' +
      '**Pricing:**\n' +
      '• Starter: $10 → 1,000 credits (1,000 repositions)\n' +
      '• Power: $25 → 2,500 credits (2,500 repositions)\n' +
      '• Pro: $50 → 5,000 credits (5,000 repositions)\n\n' +
      '💰 **Price per credit:** $0.01 USDC\n' +
      '♾️ **Expiration:** Never expires\n\n' +
      '**To purchase:**\n' +
      `1. Visit: ${purchaseUrl}\n` +
      '2. Select a package\n' +
      '3. Pay with USDC via x402\n' +
      '4. Credits added instantly\n\n' +
      'Or click the button below:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🛒 Purchase Credits',
                url: purchaseUrl,
              },
            ],
            [
              {
                text: '🔄 Check Balance',
                callback_data: 'check_credits',
              },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error('Error handling topup:', error);
    await ctx.reply('❌ Failed to generate purchase link. Try again later.');
  }
}

/**
 * Handle inline button callback for checking credits
 */
export async function handleCheckCreditsCallback(ctx: Context) {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return;
  }

  await ctx.answerCbQuery('Checking credits...');
  await handleCreditsCommand(ctx);
}
