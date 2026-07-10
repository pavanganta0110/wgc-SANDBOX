import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";

export async function GET() {
  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    select: { finixPaymentInstrumentId: true, churchId: true, donorId: true },
  });

  let updated = 0;
  let errors = 0;
  for (const i of instruments) {
    try {
      await syncPaymentInstrument(i.finixPaymentInstrumentId, {
        churchId: i.churchId ?? undefined,
        donorId: i.donorId ?? undefined,
      });
      updated++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ total: instruments.length, updated, errors });
}
