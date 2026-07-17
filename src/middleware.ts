import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'crypto'

const SESSION_COOKIE_NAME = 'wgc_session';

// Public admin auth pages — reachable without a session, everything else
// under /admin and /api/admin requires one. Deliberately duplicates the
// signature-only half of src/lib/auth/session.ts's verifySessionToken
// rather than importing it, since that file now imports the Prisma client
// (for getAdminSession's DB-backed invalidation check), which isn't
// Edge-middleware-safe. Full DB-backed checks (disabled account,
// password-changed-since-issued) happen in getAdminSession() at the page
// level; this is the fast, stateless first gate.
const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/forgot-password', '/admin/reset-password', '/admin/accept-invite'];

// The login/forgot-password APIs must themselves be reachable without a
// session — otherwise nobody could ever log in. validate-reset-token and
// set-password are shared with the merchant flow and live under
// /api/merchant, so they're outside this middleware's /api/admin matcher.
const PUBLIC_ADMIN_API_PATHS = ['/api/admin/login', '/api/admin/forgot-password'];

function verifyAdminSessionCookie(token: string | undefined): boolean {
  if (!token) return false;
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) return false;

  const [payloadB64, signatureB64] = token.split('.');
  if (!payloadB64 || !signatureB64) return false;

  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadB64).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(signatureB64, 'base64url');
  } catch {
    return false;
  }
  if (expectedSignature.length !== actualSignature.length || !crypto.timingSafeEqual(expectedSignature, actualSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return false;
    return payload.role === 'wgc_admin' || payload.role === 'wgc_super_admin';
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isAdminPagePath = pathname.startsWith('/admin');
  const isAdminApiPath = pathname.startsWith('/api/admin');
  const isTestPath = pathname.startsWith('/api/test');

  if (isTestPath) {
    if (process.env.NODE_ENV !== 'production' && !process.env.TEST_WEBHOOK_SECRET) {
      // Allow unauthenticated test access in local dev if no secret configured
      return NextResponse.next();
    }
    // No admin session concept applies to /api/test — leave its own auth
    // (TEST_WEBHOOK_SECRET, checked by the route itself) as the gate.
    return NextResponse.next();
  }

  if (isAdminPagePath && PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  if (isAdminApiPath && PUBLIC_ADMIN_API_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  if (isAdminPagePath || isAdminApiPath) {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const authed = verifyAdminSessionCookie(token);

    if (!authed) {
      if (isAdminApiPath) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// Node's crypto module is used above (HMAC + timingSafeEqual) — requires
// the Node.js middleware runtime rather than the Edge default.
export const runtime = 'nodejs';

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/test/:path*'],
}
