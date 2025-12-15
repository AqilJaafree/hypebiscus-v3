import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanGhostWallet() {
  try {
    // Find the ghost user (web-linked wallet)
    const ghostUserId = 'user-1765739704724-0npfc7';

    console.log('🔍 Looking for ghost wallet...');

    const wallet = await prisma.wallet.findUnique({
      where: { userId: ghostUserId },
      include: { user: true }
    });

    if (!wallet) {
      console.log('❌ Ghost wallet not found');
      return;
    }

    console.log('Found ghost wallet:');
    console.log('  Public Key:', wallet.publicKey);
    console.log('  User:', wallet.user?.username);
    console.log('');

    // Delete wallet first (due to foreign key constraints)
    await prisma.wallet.delete({
      where: { userId: ghostUserId }
    });
    console.log('✅ Deleted wallet');

    // Delete ghost user
    await prisma.user.delete({
      where: { id: ghostUserId }
    });
    console.log('✅ Deleted ghost user');

    console.log('');
    console.log('🎉 Ghost wallet cleaned! You can now import this wallet.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

cleanGhostWallet();
