import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Paths to protect
  const isProtectedPath = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  const isTestPath = pathname.startsWith('/api/test');

  if (isProtectedPath || isTestPath) {
    if (isTestPath && process.env.NODE_ENV !== 'production' && !process.env.TEST_WEBHOOK_SECRET) {
      // Allow unauthenticated test access in local dev if no secret configured
      return NextResponse.next();
    }

    const basicAuth = request.headers.get('authorization');
    
    if (basicAuth) {
      const authValue = basicAuth.split(' ')[1];
      const [user, pwd] = atob(authValue).split(':');

      const validUser = process.env.ADMIN_USERNAME;
      const validPwd = process.env.ADMIN_PASSWORD;

      // Reject authentication if admin credentials are not configured.
      // There is no fallback — leaving these unset must result in a hard
      // lockout, not a known default that could be guessed in production.
      if (!validUser || !validPwd) {
        return new NextResponse('Auth Required — Admin credentials not configured', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
        });
      }

      if (user === validUser && pwd === validPwd) {
        return NextResponse.next();
      }
    }

    return new NextResponse('Auth Required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/test/:path*'],
}
