import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/auth/sessionConstants'

// Team-access Checkpoint 2: routes under /merchant and /api/merchant that
// must stay reachable without a session — the pre-auth flows (login,
// invite/reset password) and their supporting API routes. Every other path
// under those two prefixes requires the session cookie to be present.
// This is a COARSE backstop only (cookie-presence check — middleware runs
// on the Edge runtime and cannot do the DB-backed authVersion/disabled
// check that getSession()/requireMerchantSession() do). Every sensitive
// route must still call one of those centralized helpers itself; this
// middleware existing does not remove that requirement.
const MERCHANT_PUBLIC_PREFIXES = [
  '/merchant/login',
  '/merchant/forgot-password',
  '/merchant/set-password',
  '/api/merchant/login',
  '/api/merchant/logout',
  '/api/merchant/forgot-password',
  '/api/merchant/set-password',
  '/api/merchant/validate-reset-token',
];

function isMerchantPublicPath(pathname: string): boolean {
  return MERCHANT_PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isMerchantPath = pathname.startsWith('/merchant') || pathname.startsWith('/api/merchant');
  if (isMerchantPath && !isMerchantPublicPath(pathname)) {
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!hasSession) {
      if (pathname.startsWith('/api/merchant')) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
      }
      const loginUrl = new URL('/merchant/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

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
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/test/:path*', '/merchant/:path*', '/api/merchant/:path*'],
}
