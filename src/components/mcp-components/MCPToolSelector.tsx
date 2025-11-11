"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChartLineUp,
  Wallet,
  ListBullets,
  ChartBar,
  Info,
  CirclesThreePlus,
  GridNine,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import type { MCPTool } from '@/lib/services/mcpClient';

interface MCPToolSelectorProps {
  tools: MCPTool[];
  onToolSelect: (toolName: string) => void;
  disabled?: boolean;
}

const toolIcons: Record<string, React.ReactNode> = {
  get_pool_metrics: <ChartLineUp size={20} />,
  get_user_by_wallet: <Wallet size={20} />,
  get_user_positions: <ListBullets size={20} />,
  get_wallet_performance: <ChartBar size={20} />,
  get_position_details: <Info size={20} />,
  get_dlmm_position: <CirclesThreePlus size={20} />,
  get_bin_distribution: <GridNine size={20} />,
  calculate_rebalance: <ArrowsClockwise size={20} />,
};

const toolLabels: Record<string, string> = {
  get_pool_metrics: 'Pool Metrics',
  get_user_by_wallet: 'User Info',
  get_user_positions: 'User Positions',
  get_wallet_performance: 'Wallet Performance',
  get_position_details: 'Position Details',
  get_dlmm_position: 'DLMM Position',
  get_bin_distribution: 'Bin Distribution',
  calculate_rebalance: 'Rebalance Check',
};

export function MCPToolSelector({
  tools,
  onToolSelect,
  disabled = false,
}: MCPToolSelectorProps) {
  if (tools.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Available MCP Tools</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tools.map((tool) => (
            <Button
              key={tool.name}
              variant="outline"
              size="sm"
              onClick={() => onToolSelect(tool.name)}
              disabled={disabled}
              className="flex flex-col items-center justify-center h-auto py-3 px-2 gap-2"
              title={tool.description}
            >
              <div className="text-primary">
                {toolIcons[tool.name] || <Info size={20} />}
              </div>
              <span className="text-xs text-center leading-tight">
                {toolLabels[tool.name] || tool.name}
              </span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
