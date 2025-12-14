import { WalletIcon, LinkIcon } from '@phosphor-icons/react';

interface TabNavigationProps {
  activeTab: 'positions' | 'link';
  onTabChange: (tab: 'positions' | 'link') => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="flex gap-4">
      <button
        type="button"
        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
          activeTab === 'positions'
            ? 'bg-primary text-white'
            : 'bg-gray-800 text-gray-400 hover:text-white'
        }`}
        onClick={() => onTabChange('positions')}
      >
        <WalletIcon size={20} />
        Positions
      </button>
      <button
        type="button"
        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
          activeTab === 'link'
            ? 'bg-primary text-white'
            : 'bg-gray-800 text-gray-400 hover:text-white'
        }`}
        onClick={() => onTabChange('link')}
      >
        <LinkIcon size={20} />
        Link Telegram
      </button>
    </div>
  );
}
