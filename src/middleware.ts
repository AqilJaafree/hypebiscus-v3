import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Handle CORS preflight requests for API routes
  if (request.method === 'OPTIONS' && request.nextUrl.pathname.startsWith('/api/')) {
    const response = new NextResponse(null, { status: 200 })
    
    // Set CORS headers for preflight
    const origin = request.headers.get('origin')
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? ['https://your-domain.com'] // Replace with your production domain
      : ['http://localhost:3000', 'http://127.0.0.1:3000']
    
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
    }
    
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.set('Access-Control-Max-Age', '86400')
    
    return response
  }

  // Add security headers to all responses
  const response = NextResponse.next()
  
  // Content Security Policy (CSP) - Updated for Jupiter Plugin
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://plugin.jup.ag;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' data: https: blob:;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src 'self' https://api.mainnet-beta.solana.com https://solana-mainnet.g.alchemy.com https://sly-virulent-owl.solana-mainnet.quiknode.pro https://lineage-liquid-774f.mainnet.rpcpool.com https://plugin.jup.ag https://lite-api.jup.ag https://dlmm-api.meteora.ag https://cdn.jsdelivr.net https://mainnet.helius-rpc.com https://fonts.googleapis.com https://datapi.jup.ag https://ultra-api.jup.ag https://quote-api.jup.ag https://price.jup.ag https://api.defidive.com https://devnet.magicblock.app wss: wss://devnet.magicblock.app;
    frame-src 'none';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim()

  response.headers.set('Content-Security-Policy', cspHeader)
  
  // Additional security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}