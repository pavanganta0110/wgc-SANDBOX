import type { APIRequestContext } from "@playwright/test";

/**
 * Logs in through the REAL /api/merchant/login (or /api/admin/login) route
 * — same request the login form itself submits — using an
 * APIRequestContext tied to a BrowserContext (`context.request`, not a
 * detached `request` fixture) so the Set-Cookie session cookie lands in
 * that context's cookie jar and is sent automatically by every later
 * `page.goto()`/`page.request` call in the same context.
 */
export async function loginAsMerchant(request: APIRequestContext, email: string, password: string) {
  const res = await request.post("/api/merchant/login", {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`Merchant login failed (${res.status()}): ${await res.text()}`);
  }
}

export async function loginAsAdmin(request: APIRequestContext, email: string, password: string) {
  const res = await request.post("/api/admin/login", {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`Admin login failed (${res.status()}): ${await res.text()}`);
  }
}
