// src/lib/api/formatters.ts
import { PoolsResponse, Pool } from './pools';

/**
 * Format pool data for display in the chat
 * @param searchTerm The search term used
 * @param data The pool data from the API response
 * @returns Formatted message string
 */
export const formatPoolData = (searchTerm: string, data: PoolsResponse): string => {
  let formattedMessage = `Here are the ${searchTerm.toUpperCase()} pools I found:\n\n`;
  
  if (data.groups && data.groups.length > 0) {
    // Include a note about the "Add Liquidity" buttons
    formattedMessage += `You can interact with these pools using the buttons below each pool listing.\n\n`;
    
    data.groups.forEach((group: { name: string; pairs: Pool[]; }) => {
      formattedMessage += `**${group.name} Pools**\n\n`;
      
      if (group.pairs && group.pairs.length > 0) {
        group.pairs.forEach((pair: Pool, index: number) => {
          formattedMessage += formatPoolPair(pair, index);
        });
      } else {
        formattedMessage += "No pairs found for this group.\n\n";
      }
    });
  } else {
    formattedMessage += `No ${searchTerm.toUpperCase()} pools found.`;
  }
  
  return formattedMessage;
};

/**
 * Format a single pool pair
 * @param pair The pool pair data
 * @param index The index for numbering
 * @returns Formatted string for the pair
 */
const formatPoolPair = (pair: Pool, index: number): string => {
  return `${index + 1}. Pool: ${pair.name}\n` +
    `   - Liquidity: $${formatCurrency(pair.liquidity)}\n` +
    `   - Current Price: $${formatNumber(pair.current_price, 2)}\n` +
    `   - APY: ${pair.apy.toFixed(2)}%\n` +
    `   - 24h Fees: $${pair.fees_24h.toFixed(2)}\n` +
    `   - 24h Volume: $${formatNumber(pair.trade_volume_24h, 2)}\n\n`;
};

/**
 * Format a number with specified decimal places and add thousands separators
 * @param value The number to format
 * @param decimalPlaces Number of decimal places
 * @returns Formatted number string
 */
export const formatNumber = (value: number, decimalPlaces = 0): string => {
  return value.toLocaleString(undefined, { 
    minimumFractionDigits: decimalPlaces, 
    maximumFractionDigits: decimalPlaces 
  });
};

/**
 * Format currency value from string to formatted number
 * @param value The string value to format
 * @returns Formatted currency string
 */
export const formatCurrency = (value: string): string => {
  return parseFloat(value).toLocaleString();
};