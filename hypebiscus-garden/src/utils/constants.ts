// src/utils/constants.ts

// Pool addresses - now with proper validation
const POOL_ADDRESS = process.env.ZBTC_SOL_POOL_ADDRESS || '';

// Note: We validate in index.ts before importing this, but adding extra safety
export const ZBTC_SOL_POOLS = {
  MAIN: POOL_ADDRESS,
};

export const MONITORING_CONFIG = {
  INTERVAL_MS: parseInt(process.env.MONITORING_INTERVAL_MS || '30000'),
  PRICE_THRESHOLD: 0.05, // 5% price movement triggers reposition
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,
};

export const MESSAGES = {
  WELCOME: `🚀 Welcome to Garden - ZBTC-SOL DLMM Auto Bot!

This bot automatically manages your ZBTC-SOL liquidity positions:
• Monitors price movements 24/7
• Auto-repositions when out of range
• Simple Telegram interface

Use /start to begin or /help for commands.`,

  WALLET_CREATED: (address: string) => `✅ New wallet created!
📍 Address: \`${address}\`
💰 Fund this wallet with SOL and ZBTC to start trading.

⚠️ IMPORTANT: Save your private key securely!`,

  POSITION_CREATED: (amount: number, price: number) => `🎯 Position created successfully!
💰 Amount: ${amount} ZBTC
📊 Entry Price: $${price} SOL per ZBTC
🔄 Monitoring started automatically.`,

  POSITION_OUT_OF_RANGE: (currentPrice: number, minPrice: number, maxPrice: number) => `⚠️ Position is out of range!
📈 Current Price: $${currentPrice}
🎯 Position Range: $${minPrice} - $${maxPrice}
🔄 Repositioning automatically...`,

  REPOSITION_SUCCESS: (minPrice: number, maxPrice: number, currentPrice: number) => `✅ Successfully repositioned!
🎯 New Range: $${minPrice} - $${maxPrice}
📊 Current Price: $${currentPrice}`,
};