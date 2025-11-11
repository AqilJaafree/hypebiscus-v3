import { TokenListProvider, TokenInfo } from '@solana/spl-token-registry';
import { useEffect, useState } from 'react';

export const useTokenData = () => {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);

  useEffect(() => {
    const fetchTokenData = async () => {
      const tokenList = await new TokenListProvider().resolve();
      const filteredTokens = tokenList.filterByChainId(101).getList();
      setTokens(filteredTokens);
    };

    fetchTokenData();
  }, []);

  return tokens;
};