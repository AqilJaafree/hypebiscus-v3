// src/lib/api/chat.ts

interface MessageForAPI {
  role: string;
  content: string;
  timestamp?: Date;
}

interface Pool {
  name: string;
  address: string;
  liquidity: string;
  currentPrice: string;
  apy: string;
  fees24h: string;
  volume24h: string;
  binStep?: string;
  estimatedDailyEarnings?: string;
  investmentAmount?: string;
  riskLevel?: string;
  reasons?: string[];
  risks?: string[];
}

interface ChatAPIRequest {
  messages: MessageForAPI[];
  poolData?: Pool;
  portfolioStyle?: string;
}

/**
 * Custom error class for chat API operations
 */
export class ChatAPIError extends Error {
  constructor(
    message: string, 
    public readonly status?: number, 
    public readonly details?: string
  ) {
    super(message);
    this.name = 'ChatAPIError';
  }
}

/**
 * Enhanced error handling for API responses
 */
async function handleAPIError(response: Response): Promise<never> {
  let errorMessage = 'Failed to get response from API';
  let errorDetails: string | undefined;

  try {
    const errorData = await response.json();
    errorMessage = errorData.error || errorMessage;
    errorDetails = errorData.details;
    console.error('API error details:', errorData);
  } catch {
    try {
      errorDetails = await response.text();
    } catch {
      // Ignore text parsing errors
    }
  }

  throw new ChatAPIError(errorMessage, response.status, errorDetails);
}

/**
 * Handle streaming response from API
 */
async function handleStreamingResponse(
  response: Response,
  onStreamUpdate?: (chunk: string) => void
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      result += chunk;
      
      onStreamUpdate?.(chunk);
    }
    return result;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Format and validate request payload
 */
function createRequestPayload(
  messages: MessageForAPI[],
  poolData?: Pool,
  portfolioStyle?: string
): ChatAPIRequest {
  const formattedMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  return {
    messages: formattedMessages,
    poolData,
    portfolioStyle
  };
}

/**
 * Send message to chat API with improved error handling and type safety
 */
export async function fetchMessage(
  messages: MessageForAPI[],
  poolData?: Pool,
  portfolioStyle?: string,
  onStreamUpdate?: (chunk: string) => void
): Promise<string> {
  const payload = createRequestPayload(messages, poolData, portfolioStyle);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await handleAPIError(response);
    }

    // Handle streaming response
    if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
      return await handleStreamingResponse(response, onStreamUpdate);
    }

    // Handle traditional JSON response (fallback)
    const data = await response.json();

    return data.message || '';
  } catch (error) {
    if (error instanceof ChatAPIError) {
      throw error;
    }
    
    // Wrap unexpected errors
    throw new ChatAPIError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      undefined,
      error instanceof Error ? error.stack : undefined
    );
  }
}