"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PaperPlaneRight } from '@phosphor-icons/react';

interface MCPQueryInputProps {
  onSubmit: (query: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const quickActions = [
  {
    label: 'Check Pool Health',
    query: 'Show me the current metrics for the main zBTC-SOL pool',
  },
  {
    label: 'My Positions',
    query: 'Get my active liquidity positions',
  },
  {
    label: 'Bin Distribution',
    query: 'Show the bin distribution for the main pool',
  },
  {
    label: 'Performance Stats',
    query: 'What is my wallet performance?',
  },
];

export function MCPQueryInput({
  onSubmit,
  disabled = false,
  placeholder = 'Ask about pools, positions, or metrics...',
}: MCPQueryInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !disabled) {
      onSubmit(query.trim());
      setQuery('');
    }
  };

  const handleQuickAction = (actionQuery: string) => {
    if (!disabled) {
      onSubmit(actionQuery);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="flex-1 px-4 py-3 rounded-xl bg-secondary border border-border text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <Button
              type="submit"
              disabled={disabled || !query.trim()}
              size="lg"
              className="px-6"
            >
              <PaperPlaneRight size={20} />
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="ghost"
                size="sm"
                onClick={() => handleQuickAction(action.query)}
                disabled={disabled}
                className="text-xs justify-start hover:bg-primary/10"
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
