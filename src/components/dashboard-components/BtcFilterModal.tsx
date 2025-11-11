"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BtcFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFilter: (filter: string) => void;
}

type BtcFilterOption = {
  id: string;
  title: string;
  description: string;
  icon: string;
};

const BtcFilterModal: React.FC<BtcFilterModalProps> = ({
  isOpen,
  onClose,
  onSelectFilter,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  const filterOptions: BtcFilterOption[] = [
    {
      id: "wbtc-sol",
      title: "wBTC",
      description: "Wrapped Bitcoin - most established and liquid BTC pools on Solana.",
      icon: "₿",
    },
    {
      id: "zbtc-sol",
      title: "zBTC",
      description: "Zeus Bitcoin - native Bitcoin bridged through Zeus Network.",
      icon: "⚡",
    },
    {
      id: "cbbtc-sol",
      title: "cbBTC",
      description: "Coinbase Bitcoin - institutional-grade Bitcoin backed by Coinbase.",
      icon: "🏛️",
    },
  ];

  const handleFilterSelect = (filterId: string) => {
    setSelectedFilter(filterId);
  };

  const handleConfirm = () => {
    if (selectedFilter) {
      onSelectFilter(selectedFilter);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent aria-describedby="btc-filter-description">
        <DialogTitle className="text-center text-2xl font-bold">
          Choose Bitcoin Token Type
        </DialogTitle>
        <DialogDescription id="btc-filter-description" className="text-center text-sub-text">
          Select your preferred Bitcoin token type to find the most relevant liquidity pools for your investment strategy.
        </DialogDescription>
        
        {/* Modal Content */}
        <div className='pt-8'>  
          {/* Subtitle */}
          <div className="mb-6 flex flex-col items-start ">
            <h3 className="text-md white mb-2">Select Your Preferred Bitcoin Token</h3>
            <p className="text-sm text-sub-text">
              Focus on specific Bitcoin token types to find the most relevant
              liquidity pools for your investment strategy.
            </p>
          </div>
          
          {/* Options */}
          <div className="space-y-3 mb-8">
            {filterOptions.map((filter) => {
              const isSelected = selectedFilter === filter.id;
              
              return (
                <div
                  key={filter.id}
                  className={`cursor-pointer rounded-2xl border px-5 py-4 transition-all ${
                    isSelected ? "bg-primary border-primary" : "bg-transparent border-primary"
                  }`}
                  onClick={() => handleFilterSelect(filter.id)}
                  role="radio"
                  aria-checked={isSelected}
                  aria-labelledby={`filter-${filter.id}-title`}
                  aria-describedby={`filter-${filter.id}-desc`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleFilterSelect(filter.id);
                    }
                  }}
                >
                  <div className="flex items-center">
                    <div className="flex-1">
                      <div className="flex items-start gap-2">
                        <span className="mr-3 text-2xl" aria-hidden="true">{filter.icon}</span>
                        <div>
                          <h3 id={`filter-${filter.id}-title`} className="font-medium text-white">
                            {filter.title}
                          </h3>
                          <p id={`filter-${filter.id}-desc`} className="text-sm text-white mt-2">
                            {filter.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Continue Button */}
          <Button
            variant="default"
            onClick={handleConfirm}
            disabled={!selectedFilter}
            className="w-full"
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BtcFilterModal;