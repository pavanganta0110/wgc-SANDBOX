import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";
import { isValidEmail, normalizeEmail } from "@/lib/donors/donorContact";
import { logDashboardAction } from "@/lib/dashboardAudit";

async function authorize() {
  try {
    const auth = await requireMerchantSession();
    const permissions = getDonorPermissions(auth.rawRole);
    if (!permissions.canView || !permissions.canSendStatements) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    return { auth };
  } catch (err) {
    if (isAuthError(err)) return { response: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
}

/** GET — this church's unsubscribed addresses (newest first). ?format=csv downloads them. */
export async function GET(req: Request) {
  const a = await authorize();
  if ("response" in a) return a.response;
  const rows = await prisma.emailOptOut.findMany({ where: { churchId: a.auth.churchId }, orderBy: { createdAt: "desc" }, take: 5000 });

  if (new URL(req.url).searchParams.get("format") === "csv") {
    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: "Email", value: (r) => r.normalizedEmail },
      { header: "Unsubscribed On", value: (r) => r.createdAt.toISOString().slice(0, 10) },
      { header: "How", value: (r) => (r.source === "UNSUBSCRIBE_LINK" ? "Unsubscribe link" : "Added by your team") },
    ];
    return csvResponse(buildCsvExport(rows, columns).replace(/\n/g, "\r\n"), "unsubscribed-emails.csv");
  }
  return NextResponse.json({ unsubscribed: rows.map((r) => ({ id: r.id, email: r.normalizedEmail, source: r.source, createdAt: r.createdAt.toISOString() })) });
}

/**
 * POST { email } — add an address to the do-not-email list by hand (e.g. someone
 * replied "please remove me"). There is deliberately no way for a merchant to
 * REMOVE an address: only the person can opt back in, so an unsubscribe is
 * never quietly undone.
 */
export async function POST(req: Request) {
  const a = await authorize();
  if ("response" in a) return a.response;
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  await prisma.emailOptOut.upsert({
    where: { churchId_normalizedEmail: { churchId: a.auth.churchId, normalizedEmail: normalizeEmail(email)! } },
    create: { churchId: a.auth.churchId, normalizedEmail: normalizeEmail(email)!, source: "MERCHANT_ADDED" },
    update: {},
  });
  await logDashboardAction({
    churchId: a.auth.churchId,
    actorUserId: a.auth.userId,
    actorEmail: a.auth.email,
    actorRole: a.auth.rawRole,
    action: "giving_campaign.unsubscribe_added",
    entityType: "EmailOptOut",
    req,
  });
  return NextResponse.json({ success: true });
}
