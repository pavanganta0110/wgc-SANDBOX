/**
 * src/app/wgc-open/route.ts
 *
 * The one endpoint behind the single GHL menu link. In GHL add ONE Custom Menu Link / Custom Page,
 * opened inside GHL, pointing at:
 *
 *   https://YOUR-NEXT-APP/wgc-open?location={{location.id}}&email={{user.email}}&name={{user.name}}&org={{location.name}}&key=YOUR_OPEN_KEY
 *
 * Each click it (1) asks GHL what role this person has in THIS location, then (2) asks WGC Payments for a
 * fresh signed link (valid 15 minutes, opens a dashboard once) and redirects the browser there.
 * The role is never read from the link, so there is no admin list to maintain and a person can be an
 * admin in one location and a regular user in another.
 *
 * Set these in .env / Vercel (server only, never NEXT_PUBLIC_):
 *   WGC_BASE_URL     https://www.wgcpaymentssandbox.com  (sandbox)  or  https://www.wgcpayments.com
 *   WGC_API_KEY      your WGC partner key, wgc_ptr_...   (one key serves all your organizations)
 *   OPEN_KEY         a long random string, also put in the GHL link as &key=...
 *   GHL_TOKEN        a GHL Private Integration (or OAuth) token with the users.readonly scope that can read
 *                    the users of every location you serve (an agency-level token)
 *   GHL_COMPANY_ID   your GHL agency/company id
 *
 * WGC side: add your GHL origin to EMBED_PARTNER_FRAME_ANCESTORS so the browser can show WGC inside GHL.
 *
 * Security note. The email in the link still comes from the browser, so someone who can read a link could
 * change `email` to another person's address in the same location and be opened as them (WGC refuses people
 * with MFA, and an owner opens as a reduced administrator, but it cannot tell a forged email from a real one).
 * Before real customers, use GHL's signed user data (the marketplace-app custom page passes an encrypted user
 * payload you decrypt with your app's shared secret) so the email cannot be edited at all.
 *
 * Checked against GHL's "Search Users" docs (GET /users/search, Version 2023-02-21): the exact `roles` values
 * and how an agency token treats `locationId` are not fully spelled out, so test one admin, one regular user
 * and one stranger in the sandbox before relying on it.
 */

export const dynamic = "force-dynamic"; // never cache: each link works once

const page = (status: number, title: string, message: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>
     <body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#334155;text-align:center">
     <h1 style="font-size:1.4rem;color:#0f172a">${title}</h1><p>${message}</p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );

/** Constant-time string compare, so the open key can't be guessed byte by byte. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface GhlUser {
  email?: string;
  deleted?: boolean;
  roles?: { type?: string; role?: string; locationIds?: string[] };
}

type Lookup = { ok: true; role: "admin" | "member" | null } | { ok: false; reason: string };

/**
 * This person's role in this location, from GHL:
 *   "admin"  - a GHL admin of the location (or an agency admin)
 *   "member" - any other user with access to the location
 *   null     - not a user of this location (no access)
 * Never guesses: if GHL can't be reached or answers badly, the caller gets { ok: false } and nobody is let in.
 */
async function roleInGhl(location: string, email: string): Promise<Lookup> {
  const token = process.env.GHL_TOKEN;
  const companyId = process.env.GHL_COMPANY_ID;
  if (!token || !companyId) return { ok: false, reason: "GHL_TOKEN or GHL_COMPANY_ID is not set" };

  const call = async (url: URL): Promise<{ status: number; ok: boolean; json: { users?: GhlUser[]; message?: unknown } | null } | null> => {
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, version: "2023-02-21" }, signal: AbortSignal.timeout(8000) });
      const json = (await res.json().catch(() => null)) as { users?: GhlUser[]; message?: unknown } | null;
      return { status: res.status, ok: res.ok, json };
    } catch {
      return null;
    }
  };
  const said = (json: { message?: unknown } | null) =>
    typeof json?.message === "string" ? json.message : Array.isArray(json?.message) ? json.message.join(", ") : "";

  const search = new URL("https://services.leadconnectorhq.com/users/search");
  search.searchParams.set("companyId", companyId);
  search.searchParams.set("locationId", location);
  search.searchParams.set("query", email); // matches name, email or phone; we re-check the email exactly below
  search.searchParams.set("limit", "25");

  let result = await call(search);
  if (!result) return { ok: false, reason: "GHL did not answer in time" };

  const companyRefused = (r: { ok: boolean; json: { message?: unknown } | null }) => !r.ok && /company/i.test(said(r.json));
  let discovered = "";

  // The company number we were given is not the one GHL ties to this token (the "Relationship Number" in the
  // agency settings is not always the API's company id). Ask GHL which company this location belongs to, and
  // search again with that. Needs the token to have the locations.readonly scope.
  if (companyRefused(result)) {
    try {
      const res = await fetch(`https://services.leadconnectorhq.com/locations/${encodeURIComponent(location)}`, {
        headers: { authorization: `Bearer ${token}`, version: "2021-07-28" },
        signal: AbortSignal.timeout(8000),
      });
      const loc = (await res.json().catch(() => null)) as { location?: { companyId?: string }; companyId?: string; message?: unknown } | null;
      const found = loc?.location?.companyId ?? loc?.companyId;
      if (res.ok && typeof found === "string" && found) {
        search.searchParams.set("companyId", found);
        const again = await call(search);
        if (again) result = again;
      } else {
        discovered = ` (and ${res.status} reading the location's company: ${said(loc).slice(0, 120) || "no company id in the answer"})`;
      }
    } catch {
      discovered = " (and GHL did not answer when reading the location's company)";
    }
  }

  // A token made inside one sub-account cannot search by company. GHL's older "users of this location" call
  // works for such a token, so try it as a last resort.
  if (companyRefused(result)) {
    const legacy = new URL("https://services.leadconnectorhq.com/users/");
    legacy.searchParams.set("locationId", location);
    const second = await call(legacy);
    if (second?.ok) result = second;
    else if (second) return { ok: false, reason: `GHL answered ${result.status}: ${said(result.json).slice(0, 160)}${discovered} (and ${second.status} on the location user list: ${said(second.json).slice(0, 100)})` };
  }

  if (!result.ok) {
    // GHL's own status and message (never our token) so a wrong token, company id or scope is easy to tell apart.
    const m = said(result.json);
    return { ok: false, reason: `GHL answered ${result.status}${m ? `: ${m.slice(0, 200)}` : ""}` };
  }
  const json = result.json;
  if (!json || !Array.isArray(json.users)) return { ok: false, reason: "GHL sent an unexpected answer" };

  const user = json.users.find((u) => !u.deleted && (u.email ?? "").trim().toLowerCase() === email);
  if (!user) return { ok: true, role: null };

  const roles = user.roles ?? {};
  // An account (sub-account) user must actually have this location; agency users have access to all of them.
  if (roles.type !== "agency" && Array.isArray(roles.locationIds) && roles.locationIds.length > 0 && !roles.locationIds.includes(location)) {
    return { ok: true, role: null };
  }
  return { ok: true, role: roles.role === "admin" ? "admin" : "member" };
}

export async function GET(req: Request): Promise<Response> {
  const env = {
    WGC_BASE_URL: process.env.WGC_BASE_URL ?? "",
    WGC_API_KEY: process.env.WGC_API_KEY ?? "",
    OPEN_KEY: process.env.OPEN_KEY ?? "",
  };
  if (!env.WGC_BASE_URL || !env.WGC_API_KEY || !env.OPEN_KEY || !process.env.GHL_TOKEN || !process.env.GHL_COMPANY_ID) {
    return page(500, "Not set up", "This link is not configured yet.");
  }

  const q = new URL(req.url).searchParams;
  if (!sameSecret(q.get("key") ?? "", env.OPEN_KEY)) return page(403, "Not allowed", "This link is not valid.");

  const location = (q.get("location") ?? "").trim().slice(0, 120);
  const email = (q.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  if (!location || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    // Shows what arrived (never the key) so a link where GHL did not fill in a merge field is easy to spot.
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    const show = (v: string) => (v ? esc(v) : "(empty)");
    return page(
      400,
      "Missing details",
      `We couldn't tell which account or person is opening this. Close it and try again.<br><br><small>location: ${show(location)}<br>email: ${show(email)}</small>`
    );
  }

  const found = await roleInGhl(location, email);
  if (!found.ok) {
    console.error("GHL role lookup failed:", found.reason);
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    return page(502, "Couldn't check your access", `We couldn't confirm your access just now. Please try again in a moment.<br><br><small>${esc(found.reason)}</small>`);
  }
  if (!found.role) return page(403, "No access", "Your login doesn't have access to this account.");

  const body = {
    reference: location, // your id for this organization: the SAME value on every call, or the org looks new each time
    email,
    role: found.role,
    // These only prefill the application form for an administrator the first time.
    organizationName: (q.get("org") ?? "").trim().slice(0, 200) || undefined,
    contactName: (q.get("name") ?? "").trim().slice(0, 200) || undefined,
    contactEmail: email,
  };

  let res: Response;
  try {
    res = await fetch(`${env.WGC_BASE_URL}/api/v1/partner/embed-links`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.WGC_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return page(502, "WGC Payments is unavailable", "We couldn't reach WGC Payments just now. Please try again in a moment.");
  }

  const json = (await res.json().catch(() => ({}))) as { data?: { url?: string }; error?: { code?: string; message?: string } };

  if (res.ok && json.data?.url) {
    // 303 so the browser GETs the signed WGC link. Never cache it: it only works once.
    return new Response(null, { status: 303, headers: { location: json.data.url, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }

  // The same organization was already registered under a different reference. Show it, don't hide it.
  if (res.status === 409 && json.error?.code === "reference_mismatch") {
    return page(409, "This account is already set up", "It was registered under a different account id. Please contact support so they can fix the link.");
  }
  if (res.status === 429) return page(429, "Please wait a moment", "Too many people opened this at once. Try again in a few seconds.");

  console.error("WGC embed-links failed", res.status, json.error?.message);
  return page(502, "Couldn't open WGC Payments", "Something went wrong opening your account. Please try again, or contact support.");
}
