import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Global-admin-only, read-only. Answers "why does Resend say my API key is
 * invalid?" without ever revealing the key: it reports the shape of the key
 * the running deployment actually holds (present, length, prefix, stray
 * whitespace/quotes) and asks Resend to list the account's domains — a call
 * that sends no email — once with the value exactly as configured and once
 * trimmed. Nothing secret is returned.
 */
async function listDomains(key: string) {
  try {
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    const body = await res.json().catch(() => null);
    return {
      status: res.status,
      error: body?.message ?? body?.name ?? null,
      domains: Array.isArray(body?.data) ? body.data.map((d: { name: string; status: string }) => ({ name: d.name, status: d.status })) : null,
    };
  } catch (err) {
    return { status: 0, error: err instanceof Error ? err.message : "request failed", domains: null };
  }
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = process.env.RESEND_API_KEY ?? "";
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  const from = process.env.EMAIL_FROM || "WGC Payments <no-reply@wgcpayments.com>";
  const fromDomain = (from.match(/@([^>\s]+)/)?.[1] ?? "").toLowerCase();

  const asConfigured = raw ? await listDomains(raw) : null;
  const afterTrim = raw && trimmed !== raw ? await listDomains(trimmed) : null;

  return NextResponse.json({
    keyPresent: raw.length > 0,
    keyLength: raw.length,
    startsWithRe: raw.startsWith("re_"),
    hasLeadingOrTrailingWhitespace: raw !== raw.trim(),
    hasQuotes: /^["']|["']$/.test(raw.trim()),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    emailFrom: from,
    fromDomain,
    resendAsConfigured: asConfigured,
    resendAfterTrimmingAndUnquoting: afterTrim,
    fromDomainStatus: (asConfigured?.domains ?? afterTrim?.domains ?? []).find((d: { name: string }) => d.name === fromDomain)?.status ?? null,
  });
}
