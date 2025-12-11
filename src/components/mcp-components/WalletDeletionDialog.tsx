"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { mcpClient } from '@/lib/mcp-client';
import { showToast } from '@/lib/utils/showToast';
import { TrashIcon, WarningIcon, XIcon } from '@phosphor-icons/react';

interface WalletDeletionDialogProps {
  walletAddress: string;
  onDeleteSuccess?: () => void;
  onDeleteError?: (error: Error) => void;
}

export function WalletDeletionDialog({
  walletAddress,
  onDeleteSuccess,
  onDeleteError,
}: WalletDeletionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'warning' | 'confirm'>('warning');
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenDialog = () => {
    setIsOpen(true);
    setStep('warning');
    setConfirmText('');
  };

  const handleCloseDialog = () => {
    if (isDeleting) return; // Prevent closing while deleting
    setIsOpen(false);
    setStep('warning');
    setConfirmText('');
  };

  const handleProceedToConfirm = () => {
    setStep('confirm');
  };

  const handleConfirmDelete = async () => {
    // Verify confirmation text
    if (confirmText !== 'CONFIRM DELETE') {
      showToast.error('Invalid Confirmation', 'Please type "CONFIRM DELETE" exactly');
      return;
    }

    setIsDeleting(true);

    try {
      const result = await mcpClient.deleteWalletCompletely({
        walletAddress,
      });

      if (result.success) {
        showToast.success(
          'Wallet Deleted Successfully',
          'All wallet data has been permanently removed from the database.'
        );

        // Show deletion summary
        console.log('✅ Wallet Deletion Summary:');
        console.log(`   Wallet: ${result.walletAddress}`);
        console.log(`   User Link: ${result.deletedRecords.userLink ? 'Removed' : 'Not found'}`);
        console.log(`   Credits: ${result.deletedRecords.credits} records deleted`);
        console.log(`   Subscriptions: ${result.deletedRecords.subscriptions} records deleted`);
        console.log(`   Transactions: ${result.deletedRecords.creditTransactions} records deleted`);
        console.log(`   Position Links: ${result.deletedRecords.positionLinks} records deleted`);

        handleCloseDialog();

        if (onDeleteSuccess) {
          onDeleteSuccess();
        }

        // Reload page after 2 seconds to reflect changes
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        throw new Error('Deletion failed');
      }
    } catch (error) {
      console.error('Failed to delete wallet:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      showToast.error(
        'Deletion Failed',
        errorMessage
      );

      if (onDeleteError && error instanceof Error) {
        onDeleteError(error);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="border-t border-red-900/30 mt-6 pt-6">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <WarningIcon size={24} weight="fill" className="text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-500 mb-2">
              Danger Zone
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Permanently delete your wallet and all associated data from our database.
              This action cannot be undone.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleOpenDialog}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <TrashIcon size={16} className="mr-2" />
              Delete Wallet Data
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={handleCloseDialog}
      >
        {/* Dialog */}
        <div
          className="bg-gray-900 border border-red-900/50 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-red-900/30">
            <div className="flex items-center gap-3">
              <TrashIcon size={28} className="text-red-500" weight="fill" />
              <h2 className="text-2xl font-bold text-white">
                Delete Wallet Data
              </h2>
            </div>
            <button
              onClick={handleCloseDialog}
              disabled={isDeleting}
              className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <XIcon size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {step === 'warning' && (
              <>
                <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <WarningIcon size={24} weight="fill" className="text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-red-500 mb-2">
                        ⚠️ This is a DESTRUCTIVE operation!
                      </h3>
                      <p className="text-sm text-gray-300">
                        This action will PERMANENTLY DELETE all wallet-related data from our database.
                        This cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <h3 className="font-semibold text-white text-lg">
                    The following data will be PERMANENTLY DELETED:
                  </h3>

                  <ul className="space-y-3">
                    <li className="flex items-start gap-3 text-sm">
                      <span className="text-red-500 font-bold">•</span>
                      <div>
                        <strong className="text-white">Wallet Link:</strong>
                        <span className="text-gray-400 ml-2">
                          Your Telegram account will be unlinked from this wallet
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm">
                      <span className="text-red-500 font-bold">•</span>
                      <div>
                        <strong className="text-white">Credit Balance:</strong>
                        <span className="text-gray-400 ml-2">
                          All remaining credits will be lost
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm">
                      <span className="text-red-500 font-bold">•</span>
                      <div>
                        <strong className="text-white">Subscriptions:</strong>
                        <span className="text-gray-400 ml-2">
                          Any active subscription will be cancelled
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm">
                      <span className="text-red-500 font-bold">•</span>
                      <div>
                        <strong className="text-white">Transaction History:</strong>
                        <span className="text-gray-400 ml-2">
                          All credit purchase and usage records
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm">
                      <span className="text-red-500 font-bold">•</span>
                      <div>
                        <strong className="text-white">Position Links:</strong>
                        <span className="text-gray-400 ml-2">
                          Links between your positions and wallet
                        </span>
                      </div>
                    </li>
                    <li className="flex items-start gap-3 text-sm">
                      <span className="text-red-500 font-bold">•</span>
                      <div>
                        <strong className="text-white">Bot-Generated Wallet:</strong>
                        <span className="text-gray-400 ml-2">
                          Encrypted private keys (if wallet was bot-generated)
                        </span>
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-300">
                    <strong className="text-white">Note:</strong> This only removes data from our database.
                    Your wallet on the Solana blockchain and your actual positions will remain unchanged.
                    You can always re-link your wallet later, but your credit balance and history cannot be recovered.
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={handleCloseDialog}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleProceedToConfirm}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    I Understand, Continue
                  </Button>
                </div>
              </>
            )}

            {step === 'confirm' && (
              <>
                <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-red-500 mb-2 flex items-center gap-2">
                    <WarningIcon size={20} weight="fill" />
                    Final Confirmation Required
                  </h3>
                  <p className="text-sm text-gray-300">
                    To proceed with deletion, please type <strong className="text-white">CONFIRM DELETE</strong> exactly:
                  </p>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Confirmation Text
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type: CONFIRM DELETE"
                    disabled={isDeleting}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Must match exactly (case-sensitive)
                  </p>
                </div>

                <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-300">
                    <strong className="text-white">Wallet Address:</strong>
                  </p>
                  <p className="text-sm font-mono text-gray-400 break-all mt-1">
                    {walletAddress}
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep('warning')}
                    disabled={isDeleting}
                  >
                    Back
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting || confirmText !== 'CONFIRM DELETE'}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <TrashIcon size={16} className="mr-2" />
                        Delete Permanently
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
