/**
 * Position Health Badge Component
 * Displays the health status of a position with appropriate styling
 */

import type { PositionHealth } from '@/types/hybrid-sync';

interface PositionHealthBadgeProps {
  health: PositionHealth;
  size?: 'sm' | 'md' | 'lg';
}

export function PositionHealthBadge({ health, size = 'md' }: PositionHealthBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  };

  const statusConfig = {
    healthy: {
      label: 'Healthy',
      bgColor: 'bg-green-500/20',
      textColor: 'text-green-400',
      borderColor: 'border-green-500/50',
    },
    'at-edge': {
      label: 'At Edge',
      bgColor: 'bg-yellow-500/20',
      textColor: 'text-yellow-400',
      borderColor: 'border-yellow-500/50',
    },
    'out-of-range': {
      label: 'Out of Range',
      bgColor: 'bg-red-500/20',
      textColor: 'text-red-400',
      borderColor: 'border-red-500/50',
    },
  };

  const config = statusConfig[health.status];

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full border font-medium ${sizeClasses[size]} ${config.bgColor} ${config.textColor} ${config.borderColor}`}
      >
        {health.isInRange ? '✓' : '✗'} {config.label}
      </span>
      {!health.isInRange && (
        <span className="text-xs text-gray-500">
          {health.distanceFromActiveBin} bins out
        </span>
      )}
      {health.status === 'at-edge' && health.isInRange && (
        <span className="text-xs text-gray-500">
          {health.distanceFromActiveBin} bins from edge
        </span>
      )}
    </div>
  );
}
