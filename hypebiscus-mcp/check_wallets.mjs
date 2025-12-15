import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkWallets() {
  try {
    // Find all wallets
    const wallets = await prisma.wallet.findMany({
      include: {
        user: true
      }
    });

    console.log('📊 Total wallets in database:', wallets.length);
    console.log('');

    wallets.forEach((w, i) => {
      console.log(`Wallet ${i + 1}:`);
      console.log('  Public Key:', w.publicKey.substring(0, 20) + '...');
      console.log('  User ID:', w.userId);
      console.log('  Telegram ID:', w.user?.telegramId || 'N/A');
      console.log('  Username:', w.user?.username || 'N/A');
      console.log('  Created:', w.createdAt);
      console.log('');
    });

    // Check your specific user
    const yourUserId = '6a85e906-4704-47c7-a93e-0e46821b9cd7';
    const yourWallet = await prisma.wallet.findUnique({
      where: { userId: yourUserId }
    });

    console.log('🔍 Your account (userId:', yourUserId, '):');
    if (yourWallet) {
      console.log('  ✅ Has wallet:', yourWallet.publicKey.substring(0, 20) + '...');
    } else {
      console.log('  ❌ No wallet found');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkWallets();
