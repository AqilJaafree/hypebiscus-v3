// Payment API - Handle subscription and credits purchases
import { NextRequest, NextResponse } from 'next/server';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, walletAddress, paymentTxSignature, creditsAmount, usdcAmountPaid } = body;

    console.log('Payment API received:', { action, walletAddress, creditsAmount });

    if (!action || !walletAddress || !paymentTxSignature) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    let result;

    if (action === 'create_subscription') {
      // TODO: Implement subscription creation via MCP
      result = {
        success: true,
        message: 'Subscription creation not yet implemented',
      };
    } else if (action === 'purchase_credits') {
      // Call MCP server directly (server-side call)
      console.log('Calling purchase_credits MCP tool...');

      const mcpRequest = {
        jsonrpc: '2.0',
        method: 'purchase_credits',
        params: {
          walletAddress,
          creditsAmount: creditsAmount,
          paymentTxSignature: paymentTxSignature,
          usdcAmountPaid: usdcAmountPaid,
        },
        id: Date.now(),
      };

      const mcpResponse = await fetch(MCP_SERVER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mcpRequest),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!mcpResponse.ok) {
        throw new Error(`MCP server returned ${mcpResponse.status}`);
      }

      const mcpData = await mcpResponse.json();

      if (mcpData.error) {
        throw new Error(mcpData.error.message || 'MCP server error');
      }

      // Parse the MCP protocol response
      const content = mcpData.result?.content?.[0]?.text;
      if (!content) {
        throw new Error('Empty response from MCP server');
      }

      const purchaseData = JSON.parse(content) as {
        success?: boolean;
        newBalance?: number;
        message?: string;
      };

      console.log('MCP purchase_credits result:', purchaseData);

      if (purchaseData.success) {
        result = {
          success: true,
          newBalance: purchaseData.newBalance,
          message: `Successfully added ${creditsAmount} credits`,
        };
      } else {
        throw new Error(purchaseData.message || 'Failed to record credits');
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Payment API Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Payment processing failed',
      },
      { status: 500 }
    );
  }
}
