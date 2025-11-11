"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Clock } from '@phosphor-icons/react';

interface MCPStatusIndicatorProps {
  status: 'connected' | 'disconnected' | 'checking';
  serverUrl?: string;
  toolCount?: number;
  error?: string;
}

export function MCPStatusIndicator({
  status,
  serverUrl,
  toolCount,
  error,
}: MCPStatusIndicatorProps) {
  const statusConfig = {
    connected: {
      icon: <CheckCircle size={24} className="text-green-500" weight="fill" />,
      text: 'Connected',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    disconnected: {
      icon: <XCircle size={24} className="text-red-500" weight="fill" />,
      text: 'Disconnected',
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    checking: {
      icon: <Clock size={24} className="text-yellow-500 animate-pulse" weight="fill" />,
      text: 'Checking...',
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
  };

  const config = statusConfig[status];

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">MCP Server Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${config.bgColor}`}>
            {config.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`font-semibold ${config.color}`}>
                {config.text}
              </span>
              {toolCount !== undefined && status === 'connected' && (
                <span className="text-sm text-gray-400">
                  ({toolCount} tools available)
                </span>
              )}
            </div>
            {serverUrl && status === 'connected' && (
              <p className="text-xs text-gray-500 font-mono">
                {serverUrl}
              </p>
            )}
            {error && status === 'disconnected' && (
              <p className="text-xs text-red-400 mt-1">
                {error}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
