import { PublicKey } from '@solana/web3.js';
import { WalletLinkingCard } from '@/components/mcp-components/WalletLinkingCard';
import { WalletDeletionDialog } from '@/components/mcp-components/WalletDeletionDialog';
import { showToast } from '@/lib/utils/showToast';

interface TelegramLinkTabProps {
  connected: boolean;
  publicKey: PublicKey | null;
}

export function TelegramLinkTab({ connected, publicKey }: TelegramLinkTabProps) {
  return (
    <div className="max-w-4xl mx-auto">
      <WalletLinkingCard
        onLinkSuccess={() => {
          showToast.success('Success!', 'Your wallet has been linked to Telegram');
        }}
        onLinkError={(error) => {
          showToast.error('Link Failed', error.message);
        }}
      />

      {/* Wallet Deletion Section */}
      {connected && publicKey && (
        <div className="mt-8">
          <WalletDeletionDialog
            walletAddress={publicKey.toBase58()}
            onDeleteSuccess={() => {
              showToast.success('Wallet Deleted', 'All wallet data has been removed');
            }}
            onDeleteError={(error) => {
              showToast.error('Deletion Failed', error.message);
            }}
          />
        </div>
      )}
    </div>
  );
}
