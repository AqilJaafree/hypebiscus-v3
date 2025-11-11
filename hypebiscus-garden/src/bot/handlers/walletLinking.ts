// Wallet Linking Handlers - QR Code scanning and link commands
import { Context } from 'telegraf';
import { Message } from 'telegraf/types';
import axios from 'axios';
// @ts-ignore - No type definitions available
import Jimp from 'jimp';
// @ts-ignore - No type definitions available
import QrCode from 'qrcode-reader';
import { createHmac } from 'crypto';
import { mcpClient } from '../../utils/mcpClient';

// Environment configuration
const WALLET_LINK_SECRET = process.env.WALLET_LINK_SECRET || 'your-secret-key-here';

/**
 * Handle QR code photo messages
 * Downloads the photo, parses QR code, verifies signature, and links wallet
 */
export async function handleQRCodePhoto(ctx: Context) {
  if (!ctx.message || !('photo' in ctx.message)) {
    return;
  }

  const photos = ctx.message.photo;
  if (!photos || photos.length === 0) {
    return;
  }

  try {
    await ctx.reply('📸 Scanning QR code...');

    // Get the highest resolution photo
    const photo = photos[photos.length - 1];

    // Get file link from Telegram
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    // Download image
    const response = await axios.get(fileLink.href, {
      responseType: 'arraybuffer',
    });

    // Parse QR code
    // @ts-ignore - Jimp type definitions incomplete
    const image = await Jimp.read(Buffer.from(response.data));
    const qr = new QrCode();

    const qrData = await new Promise<string>((resolve, reject) => {
      qr.callback = (err: Error | null, value: { result?: string }) => {
        if (err) {
          reject(err);
        } else if (value?.result) {
          resolve(value.result);
        } else {
          reject(new Error('No QR code found'));
        }
      };
      qr.decode(image.bitmap);
    });

    // Parse QR data (should be JSON)
    let qrJson: {
      type: string;
      wallet: string;
      token: string;
      expiresAt: string;
      signature: string;
    };

    try {
      qrJson = JSON.parse(qrData);
    } catch (error) {
      await ctx.reply('❌ Invalid QR code format');
      return;
    }

    // Validate QR code type
    if (qrJson.type !== 'hypebiscus_wallet_link') {
      await ctx.reply('❌ This is not a Hypebiscus wallet linking QR code');
      return;
    }

    // Verify HMAC signature
    const message = `${qrJson.token}:${qrJson.wallet}:${qrJson.expiresAt}`;
    const expectedSignature = createHmac('sha256', WALLET_LINK_SECRET)
      .update(message)
      .digest('hex');

    if (qrJson.signature !== expectedSignature) {
      await ctx.reply('❌ Invalid QR code signature. Please generate a new link from the website.');
      return;
    }

    // Check expiration
    const expiresAt = new Date(qrJson.expiresAt);
    if (expiresAt < new Date()) {
      await ctx.reply('❌ This link token has expired. Please generate a new one from the website.');
      return;
    }

    // Call MCP server to link wallet
    const result = await mcpClient.linkWalletByFullToken(
      qrJson.token,
      qrJson.wallet,
      ctx.from!.id.toString(),
      qrJson.expiresAt,
      qrJson.signature
    );

    // Success message
    await ctx.reply(
      `✅ Wallet linked successfully!\n\n` +
      `🔗 Wallet: \`${result.linkedAccount.walletAddress.substring(0, 8)}...${result.linkedAccount.walletAddress.substring(result.linkedAccount.walletAddress.length - 8)}\`\n\n` +
      `You can now use auto-reposition features and view your positions from Telegram!`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error handling QR code:', error);

    if (error instanceof Error) {
      if (error.message.includes('No QR code found')) {
        await ctx.reply('❌ No QR code detected in the image. Please try again with a clearer photo.');
      } else if (error.message.includes('already linked')) {
        await ctx.reply('❌ ' + error.message);
      } else if (error.message.includes('expired')) {
        await ctx.reply('❌ This link token has expired. Please generate a new one from the website.');
      } else {
        await ctx.reply('❌ Failed to process QR code. Please try again or use the /link command with a code.');
      }
    } else {
      await ctx.reply('❌ An unknown error occurred. Please try again.');
    }
  }
}

/**
 * Handle /link <CODE> command
 * Links wallet using 8-character short token
 */
export async function handleLinkCommand(ctx: Context) {
  if (!ctx.message || !('text' in ctx.message)) {
    return;
  }

  const args = ctx.message.text.split(' ');

  // Check if code was provided
  if (args.length < 2) {
    await ctx.reply(
      '💡 *How to link your wallet:*\n\n' +
      '1️⃣ Go to the Hypebiscus website\n' +
      '2️⃣ Connect your wallet\n' +
      '3️⃣ Click "Link Telegram Account"\n' +
      '4️⃣ Copy the 8-character code\n' +
      '5️⃣ Send it here: `/link YOUR-CODE`\n\n' +
      'Example: `/link AB2C3D4E`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const shortToken = args[1].toUpperCase().trim();

  // Validate format (8 characters)
  if (shortToken.length !== 8) {
    await ctx.reply('❌ Invalid code format. The code must be exactly 8 characters.\n\nExample: `/link AB2C3D4E`', {
      parse_mode: 'Markdown'
    });
    return;
  }

  // Validate characters
  const validChars = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;
  if (!validChars.test(shortToken)) {
    await ctx.reply('❌ Invalid code format. Please copy the code exactly as shown on the website.');
    return;
  }

  try {
    await ctx.reply('🔗 Linking your wallet...');

    // Call MCP server to link wallet
    const result = await mcpClient.linkWalletByShortToken(
      shortToken,
      ctx.from!.id.toString()
    );

    // Success message
    await ctx.reply(
      `✅ Wallet linked successfully!\n\n` +
      `🔗 Wallet: \`${result.linkedAccount.walletAddress.substring(0, 8)}...${result.linkedAccount.walletAddress.substring(result.linkedAccount.walletAddress.length - 8)}\`\n\n` +
      `You can now:\n` +
      `• View your positions: /positions\n` +
      `• Check wallet status: /linked\n` +
      `• Enable auto-reposition: /settings\n` +
      `• Unlink wallet: /unlink`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error linking wallet:', error);

    if (error instanceof Error) {
      if (error.message.includes('Invalid, expired, or already used')) {
        await ctx.reply(
          '❌ Invalid or expired code.\n\n' +
          'This code may have:\n' +
          '• Already been used\n' +
          '• Expired (codes last 5 minutes)\n' +
          '• Been typed incorrectly\n\n' +
          'Please generate a new code from the website.'
        );
      } else if (error.message.includes('already linked')) {
        await ctx.reply(
          '❌ This Telegram account is already linked to a wallet.\n\n' +
          'Use /unlink first if you want to link a different wallet.'
        );
      } else {
        await ctx.reply('❌ ' + error.message);
      }
    } else {
      await ctx.reply('❌ An unknown error occurred. Please try again.');
    }
  }
}

/**
 * Handle /linked command
 * Shows current wallet linking status
 */
export async function handleLinkedCommand(ctx: Context) {
  try {
    const telegramId = ctx.from!.id;
    const telegramUsername = ctx.from!.username;

    console.log(`[/linked] Checking link for Telegram ID: ${telegramId}, Username: @${telegramUsername || 'Unknown'}`);

    const account = await mcpClient.getLinkedAccount(telegramId.toString());

    console.log(`[/linked] Query result:`, JSON.stringify(account, null, 2));

    if (account.isLinked && account.walletAddress) {
      await ctx.reply(
        `✅ *Wallet Linked*\n\n` +
        `🔗 Wallet: \`${account.walletAddress.substring(0, 8)}...${account.walletAddress.substring(account.walletAddress.length - 8)}\`\n` +
        `📅 Linked: ${account.linkedAt ? new Date(account.linkedAt).toLocaleString() : 'Unknown'}\n\n` +
        `🆔 Your Telegram ID: \`${telegramId}\`\n\n` +
        `Commands:\n` +
        `• /positions - View your positions\n` +
        `• /settings - Configure auto-reposition\n` +
        `• /unlink - Unlink wallet`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(
        `❌ *No Wallet Linked*\n\n` +
        `🆔 Your Telegram ID: \`${telegramId}\`\n` +
        `👤 Username: @${telegramUsername || 'Not set'}\n\n` +
        `Link your wallet to access:\n` +
        `• Position tracking\n` +
        `• Auto-reposition features\n` +
        `• Performance analytics\n\n` +
        `Use /link to get started!`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('Error checking linked account:', error);
    await ctx.reply('❌ Failed to check wallet status. Please try again.');
  }
}

/**
 * Handle /unlink command
 * Removes wallet link from Telegram account
 */
export async function handleUnlinkCommand(ctx: Context) {
  try {
    // Check if wallet is linked first
    const account = await mcpClient.getLinkedAccount(ctx.from!.id.toString());

    if (!account.isLinked) {
      await ctx.reply('ℹ️ No wallet is currently linked to your account.');
      return;
    }

    // Confirm unlink
    await ctx.reply(
      `⚠️ Are you sure you want to unlink your wallet?\n\n` +
      `This will:\n` +
      `• Disable auto-reposition features\n` +
      `• Remove cross-platform sync\n` +
      `• Require re-linking to access features\n\n` +
      `Send /confirm_unlink to proceed.`
    );

  } catch (error) {
    console.error('Error initiating unlink:', error);
    await ctx.reply('❌ Failed to unlink wallet. Please try again.');
  }
}

/**
 * Handle /confirm_unlink command
 * Actually performs the unlink action
 */
export async function handleConfirmUnlinkCommand(ctx: Context) {
  try {
    await mcpClient.unlinkWallet(ctx.from!.id.toString());

    await ctx.reply(
      `✅ Wallet unlinked successfully!\n\n` +
      `You can link a new wallet anytime using /link`
    );

  } catch (error) {
    console.error('Error unlinking wallet:', error);
    await ctx.reply('❌ Failed to unlink wallet. Please try again.');
  }
}

/**
 * Handle deep link /start link_<CODE>
 * Auto-links wallet when user clicks deep link from website
 */
export async function handleStartLink(ctx: Context) {
  if (!ctx.message || !('text' in ctx.message)) {
    return;
  }

  const args = ctx.message.text.split(' ');

  // Check if it's a link deep link
  if (args.length < 2 || !args[1].startsWith('link_')) {
    return false; // Not a link deep link, let other handlers process it
  }

  const shortToken = args[1].substring(5).toUpperCase().trim(); // Remove "link_" prefix

  // Validate format
  if (shortToken.length !== 8) {
    await ctx.reply('❌ Invalid link code. Please generate a new link from the website.');
    return true;
  }

  try {
    await ctx.reply('🔗 Linking your wallet...');

    // Call MCP server to link wallet
    const result = await mcpClient.linkWalletByShortToken(
      shortToken,
      ctx.from!.id.toString()
    );

    // Success message
    await ctx.reply(
      `✅ Wallet linked successfully!\n\n` +
      `🔗 Wallet: \`${result.linkedAccount.walletAddress.substring(0, 8)}...${result.linkedAccount.walletAddress.substring(result.linkedAccount.walletAddress.length - 8)}\`\n\n` +
      `Welcome to Hypebiscus! 🎉\n\n` +
      `Available commands:\n` +
      `• /positions - View your positions\n` +
      `• /linked - Check wallet status\n` +
      `• /settings - Configure auto-reposition\n` +
      `• /help - See all commands`,
      { parse_mode: 'Markdown' }
    );

    return true; // Handled successfully

  } catch (error) {
    console.error('Error linking wallet via deep link:', error);

    if (error instanceof Error) {
      if (error.message.includes('Invalid, expired, or already used')) {
        await ctx.reply(
          '❌ This link has expired or was already used.\n\n' +
          'Please generate a new link from the website and try again.'
        );
      } else if (error.message.includes('already linked')) {
        await ctx.reply(
          '❌ Your Telegram account is already linked to a wallet.\n\n' +
          'Use /linked to see your current wallet, or /unlink to link a different one.'
        );
      } else {
        await ctx.reply('❌ ' + error.message);
      }
    } else {
      await ctx.reply('❌ Failed to link wallet. Please try again or use /link with a code.');
    }

    return true; // Handled (even if error)
  }
}
