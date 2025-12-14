import { ChartLineUpIcon, WalletIcon } from '@phosphor-icons/react';

export function NoPositionsState() {
  return (
    <div className="rounded-lg shadow-sm p-8 text-center">
      <ChartLineUpIcon className="w-12 h-12 text-white mx-auto mb-4" />
      <h3 className="text-lg font-medium text-white mb-2">No Positions Found</h3>
      <p className="text-sub-text">You don&apos;t have any LB pair positions yet.</p>
    </div>
  );
}

export function WalletNotConnectedState() {
  return (
    <div className="rounded-lg shadow-sm p-8 text-center">
      <WalletIcon className="w-12 h-12 text-white mx-auto mb-4" />
      <h3 className="text-lg font-medium text-white mb-2">Connect Your Wallet</h3>
      <p className="text-sub-text">
        Please connect your wallet to view your LB pair positions.
      </p>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="rounded-lg shadow-sm p-8 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      <p className="text-sub-text">Loading positions...</p>
    </div>
  );
}

export function PnLLoadingIndicator() {
  return (
    <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-3 mb-4">
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        <span className="text-blue-500 text-sm">Loading PnL data...</span>
      </div>
    </div>
  );
}
