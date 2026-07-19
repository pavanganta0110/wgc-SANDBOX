import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveGivingLinkStatus } from "@/lib/givingLinks/status";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildGivingLinkScope } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  // Team-access Checkpoint 4: was gated on the legacy church_admin-only
  // check (broken since Checkpoint 2) and exported the entire church's
  // giving links unconditionally — a FUNDRAISER hitting this endpoint
  // directly would have gotten every other fundraiser's links too. Now
  // uses the same requireMerchantSession + resolveViewScope +
  // buildGivingLinkScope pipeline as the list route, so export scope is
  // always identical to whatever the requester is allowed to see in the
  // dashboard (test 31: "CSV export scope matches dashboard scope").
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const viewScope = await resolveViewScope(auth);
  const scope = buildGivingLinkScope(auth, viewScope);

  const links = await prisma.givingLink.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
  });

  const header = [
    "Link ID",
    "Internal Name",
    "Public Title",
    "Status",
    "Amount Type",
    "Link Type",
    "Created",
    "Expires",
    "Total Attempts",
    "Successful Donations",
    "Gross Collected",
    "Refunded",
    "Returned",
    "Net Collected",
  ];
  const lines = [header.join(",")];

  for (const l of links) {
    const netCents = l.totalCollectedCents - l.refundedCents - l.returnedCents;
    lines.push(
      [
        csvEscape(l.id),
        csvEscape(l.internalName),
        csvEscape(l.publicTitle),
        csvEscape(resolveGivingLinkStatus(l)),
        csvEscape(l.amountType || ""),
        csvEscape(l.linkType || ""),
        csvEscape(l.createdAt.toISOString()),
        csvEscape(l.expiresAt ? l.expiresAt.toISOString() : "No expiration"),
        csvEscape(String(l.totalAttempts)),
        csvEscape(String(l.successfulDonations)),
        csvEscape(formatCents(l.totalCollectedCents)),
        csvEscape(formatCents(l.refundedCents)),
        csvEscape(formatCents(l.returnedCents)),
        csvEscape(formatCents(netCents)),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="giving-links.csv"`,
    },
  });
}
