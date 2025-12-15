/**
 * Premium Chat API Client
 *
 * Handles requests to the premium chat endpoint which:
 * - Uses Claude Opus (better model)
 * - Requires 1 credit per request OR active subscription
 * - Provides deeper, more detailed analysis
 */

export interface PremiumChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PremiumChatOptions {
  messages: PremiumChatMessage[];
  poolData?: Record<string, unknown>;
  portfolioStyle?: string;
  walletAddress: string;
  onChunk?: (chunk: string) => void;
}

/**
 * Fetch premium AI analysis (requires credits or subscription)
 */
export async function fetchPremiumMessage(
  messages: PremiumChatMessage[],
  walletAddress: string,
  poolData?: Record<string, unknown>,
  portfolioStyle?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const response = await fetch('/api/chat/premium', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      poolData,
      portfolioStyle,
      walletAddress,
    }),
  });

  // Handle payment required
  if (response.status === 402) {
    const data = await response.json();
    throw new Error(data.message || 'Payment required');
  }

  // Handle other errors
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  // Handle streaming response
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  if (!reader) {
    throw new Error('No response body');
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    fullResponse += chunk;

    if (onChunk) {
      onChunk(chunk);
    }
  }

  return fullResponse;
}

/**
 * Check if premium feature is available for wallet
 */
export async function checkPremiumAccess(walletAddress: string): Promise<{
  hasAccess: boolean;
  accessType?: 'subscription' | 'credits';
  creditsRemaining?: number;
  subscriptionDaysRemaining?: number;
}> {
  try {
    // Check via MCP client
    const [subscription, credits] = await Promise.all([
      fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'check_subscription',
            arguments: { walletAddress },
          },
          id: Date.now(),
        }),
      }).then(r => r.json()),
      fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'get_credit_balance',
            arguments: { walletAddress },
          },
          id: Date.now() + 1,
        }),
      }).then(r => r.json()),
    ]);

    const subText = subscription.result?.content?.[0]?.text;
    const sub = subText ? JSON.parse(subText) : null;

    const creditsText = credits.result?.content?.[0]?.text;
    const creds = creditsText ? JSON.parse(creditsText) : null;

    if (sub?.isActive) {
      return {
        hasAccess: true,
        accessType: 'subscription',
        subscriptionDaysRemaining: sub.daysRemaining,
      };
    }

    if (creds?.balance > 0) {
      return {
        hasAccess: true,
        accessType: 'credits',
        creditsRemaining: creds.balance,
      };
    }

    return { hasAccess: false };
  } catch (error) {
    console.error('Failed to check premium access:', error);
    return { hasAccess: false };
  }
}
