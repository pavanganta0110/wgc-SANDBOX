import { NextResponse } from "next/server";
import { formatCents } from "@/lib/format";
import { formatPersonName } from "@/lib/formatPersonName";
import { loadGivingLinkAttempts } from "@/lib/givingLinks/attempts";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { normalizeMerchantRole, ROLE_PERMISSIONS } from "@/lib/auth/roles";

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  // Team-access Checkpoint 4C: this route was legacy-role-gated (only the
  // pre-Checkpoint-1 "church_admin" string, which locked out every
  // owner/admin created since) and, separately, loadGivingLinkAttempts has
  // no per-user attribution filter today — per the established fallback
  // policy for resources that can't yet be reliably row-scoped, this stays
  // organization-wide-only (OWNER/ADMIN with export+all-transactions
  // permission), FUNDRAISER/VIEWER denied entirely.
  const normalized = normalizeMerchantRole(auth.rawRole);
  const base = normalized ? ROLE_PERMISSIONS[normalized] : null;
  if (!base?.canExportReports || !base.canViewAllTransactions) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const givingLinkId = searchParams.get("givingLinkId") || undefined;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const rows = await loadGivingLinkAttempts(auth.churchId, { givingLinkId, dateFilter, take: 5000 });

  const header = [
    "Attempt ID",
    "Giving Link",
    "Donor",
    "Email",
    "Amount",
    "Fee",
    "Total",
    "State",
    "Payment Method",
    "Last Four",
    "Created",
    "Updated",
    "Transfer ID",
    "Fund/Campaign",
  ];
  const lines = [header.join(",")];

  for (const { payment, givingLink, transfer, instrument, donor } of rows) {
    lines.push(
      [
        csvEscape(payment.id),
        csvEscape(givingLink?.internalName || ""),
        csvEscape(formatPersonName(donor?.name, instrument?.accountHolderName)),
        csvEscape(donor?.email || ""),
        csvEscape(formatCents(payment.donationAmountCents ?? payment.amountCents)),
        csvEscape(formatCents(payment.feeCoveredCents ?? 0)),
        csvEscape(formatCents(payment.amountCents)),
        csvEscape((transfer?.state || payment.status || "").toUpperCase()),
        csvEscape(payment.paymentMethodType || ""),
        csvEscape(instrument?.cardLast4 || instrument?.bankLast4 || ""),
        csvEscape(payment.createdAt.toISOString()),
        csvEscape(payment.updatedAt.toISOString()),
        csvEscape(payment.finixTransferId || ""),
        csvEscape(payment.fundName || ""),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="donation-attempts.csv"`,
    },
  });
}
