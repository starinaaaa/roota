import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  if (!request.cookies.get('cart_session')) {
    response.cookies.set('cart_session', crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/catalog/:path*',
    '/product/:path*',
    '/cart/:path*',
    '/checkout/:path*',
  ],
}
