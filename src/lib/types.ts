export interface TokenPrices {
  SOL: number;
  USDC: number;
  USDT: number;
  ETH: number;
  ZEUS?: number;
  L3?: number;
  BONK?: number;
  // Add an index signature to allow any token symbol
  [tokenSymbol: string]: number | undefined;
}

export interface TokenBalance {
  tokenSymbol: string;
  tokenBalance: number;
  tokenLogoURI: string;
  tokenMint?: string;
}