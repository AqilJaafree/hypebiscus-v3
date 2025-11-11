import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { chatRateLimiter, getClientIP } from '@/lib/utils/rateLimiter';
import { validateChatRequest, validateRequestSize, ValidationError } from '@/lib/utils/validation';

// This handles POST requests to /api/chat
export async function POST(request: Request) {
  try {
    // Validate request size first
    validateRequestSize(request);
    
    // Rate limiting
    const clientIP = getClientIP(request);
    if (!chatRateLimiter.isAllowed(clientIP)) {
      const remainingTime = Math.ceil(chatRateLimiter.getRemainingTime(clientIP) / 1000);
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded', 
          message: `Too many requests. Please try again in ${remainingTime} seconds.` 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': remainingTime.toString(),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0'
          }
        }
      );
    }
    
    // Check if API key is configured
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('API route: ANTHROPIC_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate request structure and content
    let validatedData;
    try {
      validatedData = validateChatRequest(body);
    } catch (error) {
      if (error instanceof ValidationError) {
        return NextResponse.json(
          { 
            error: 'Validation failed', 
            message: error.message,
            field: error.field 
          },
          { status: 400 }
        );
      }
      throw error;
    }

    const { messages, poolData, portfolioStyle } = validatedData;

    // Format messages for Anthropic API
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Create system prompt based on whether pool data is present
    let systemPrompt = "You are a helpful assistant for Hypebiscus, a cryptocurrency app focused on DeFi, bridges, and wallets. Provide concise, accurate information about crypto topics, DLMMs, and help users navigate the platform. When appropriate, end your responses with 1-2 curiosity-provoking questions to encourage further conversation.";
    
    // If pool data is provided, enhance system prompt
    if (poolData) {
      systemPrompt += " When analyzing liquidity pools, provide detailed yet concise assessments of risks, benefits, and opportunities. Format your analysis in bullet points, with each key point on a new line. Separate your analysis into two clear sections: 1) Why this pool is suitable, and 2) Risk considerations. For each bullet point, focus on one specific advantage or risk factor. Avoid introductory phrases like 'Analyzing this pool...' or 'Key metrics to consider...' at the start of bullet points. Tailor your analysis to the user's selected portfolio style, explaining why specific parameters (like bin steps) are appropriate for their risk tolerance. Focus on bin step relevance, risk level, potential returns, and key metrics. End your analysis with 1-2 thought-provoking questions about their investment goals or risk preferences."
    }

    // Setup for streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const stream = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307', 
            max_tokens: 1024,
            system: systemPrompt,
            messages: (() => {
              const allMessages = [
                ...formattedMessages,
                // Add pool data as a virtual user message if provided
                ...(poolData ? [{
                  role: 'user' as const,
                  content: `I need you to analyze this ${portfolioStyle || 'general'} crypto liquidity pool and provide insights: ${JSON.stringify(poolData)}. 
                  Format your response in clear bullet points, with each point starting on a new line. First, provide a brief introduction (1-2 sentences). Then list 3-5 bullet points explaining why this pool is appropriate for a ${portfolioStyle || 'general'} investor. After that, list 2-3 bullet points about risk considerations. Discuss the bin step (${poolData.binStep}) relevance, evaluate the risk level, explain potential returns, and highlight key metrics. Each bullet point should be concise and focused on one specific advantage or consideration.`
                }] : [])
              ];
              
              // Ensure we always have at least one message for Anthropic API
              if (allMessages.length === 0) {
                allMessages.push({
                  role: 'user' as const,
                  content: 'Hello! I\'m interested in learning about DeFi and liquidity pools. Can you help me get started?'
                });
              }
              
              return allMessages;
            })(),
            stream: true,
          });

          // Process each chunk as it arrives
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
          controller.close();
        } catch (error) {
          console.error('API route: Error in streaming:', error instanceof Error ? error.message : 'Unknown error');
          controller.error(error);
        }
      }
    });

    // Return the streaming response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    // Log error without exposing sensitive details
    console.error('API route: Error calling Anthropic API:', error instanceof Error ? error.message : 'Unknown error');
    
    // Return generic error message to prevent information disclosure
    if (error instanceof ValidationError) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        message: error.message 
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      error: 'Internal server error', 
      message: 'Something went wrong processing your request. Please try again later.' 
    }, { status: 500 });
  }
}

// Add a simple GET handler for testing the route
export async function GET() {
  return NextResponse.json({ status: "API route is working" });
}