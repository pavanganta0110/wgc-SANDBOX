import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: Request) {
  const session = await getSession();

  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state") || undefined;
  const last4 = searchParams.get("last4") || undefined;
  const buyer = searchParams.get("buyer") || undefined;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const transfers = await prisma.finixTransfer.findMany({
    where: {
      churchId: session.churchId,
      // See the same OR-in-null fix in transactions/payments/page.tsx —
      // NOT: { subtype: { contains: "RETURN" } } alone excludes every
      // null-subtype row too under SQL's three-valued logic.
      OR: [{ subtype: null }, { NOT: { subtype: { contains: "RETURN" } } }],
      ...(state ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
  });

  const instrumentIds = transfers
    .map((t) => t.finixPaymentInstrumentId)
    .filter((id): id is string => Boolean(id));
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({
        where: { finixPaymentInstrumentId: { in: instrumentIds } },
      })
    : [];
  const instrumentMap = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const rows = transfers.filter((t) => {
    const instrument = instrumentMap.get(t.finixPaymentInstrumentId ?? "");
    if (last4) {
      const l4 = instrument?.cardLast4 || instrument?.bankLast4;
      if (l4 !== last4) return false;
    }
    if (buyer) {
      const name = instrument?.accountHolderName || "";
      if (!name.toLowerCase().includes(buyer.toLowerCase())) return false;
    }
    return true;
  });

  const header = ["ID", "Created", "Donor", "Amount", "State", "Instrument Type", "Last Four"];
  const lines = [header.join(",")];

  for (const t of rows) {
    const instrument = instrumentMap.get(t.finixPaymentInstrumentId ?? "");
    lines.push(
      [
        csvEscape(t.finixTransferId),
        csvEscape(t.createdAtFinix ? t.createdAtFinix.toISOString() : ""),
        csvEscape(instrument?.accountHolderName || ""),
        csvEscape(formatCents(t.amountCents ?? 0)),
        csvEscape(t.state || "UNKNOWN"),
        csvEscape(instrument?.cardBrand || (instrument?.bankLast4 ? "Bank Account" : "Unknown")),
        csvEscape(instrument?.cardLast4 || instrument?.bankLast4 || ""),
      ].join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="payments.csv"`,
    },
  });
}
