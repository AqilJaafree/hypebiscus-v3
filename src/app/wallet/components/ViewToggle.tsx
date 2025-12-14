import { SquaresFourIcon, TableIcon } from '@phosphor-icons/react';

interface ViewToggleProps {
  viewMode: 'table' | 'card';
  onViewModeChange: (mode: 'table' | 'card') => void;
}

export function ViewToggle({ viewMode, onViewModeChange }: ViewToggleProps) {
  return (
    <div className="inline-flex gap-4" role="group">
      <button
        type="button"
        className={`text-sm flex items-center gap-2 ${
          viewMode === 'table' ? 'font-semibold' : 'font-normal'
        }`}
        onClick={() => onViewModeChange('table')}
      >
        <TableIcon size={21} /> Table
      </button>
      <button
        type="button"
        className={`text-sm flex items-center gap-2 ${
          viewMode === 'card' ? 'font-semibold' : 'font-normal'
        }`}
        onClick={() => onViewModeChange('card')}
      >
        <SquaresFourIcon size={21} /> Card
      </button>
    </div>
  );
}
