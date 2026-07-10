import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveGivingLinkStatus } from "@/lib/givingLinks/status";

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const links = await prisma.givingLink.findMany({
    where: { churchId: session.churchId },
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
