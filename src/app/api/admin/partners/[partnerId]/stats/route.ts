import { NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partners/requirePartnerAdmin";
import { loadPartnerStats } from "@/lib/partners/loadPartnerStats";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A day like 2026-10-01 as the start of that day (UTC). */
const startOfDay = (value: string): Date | null => {
  if (!DATE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * What one partner's organizations processed and what WGC earned, for the admin's partner page.
 * `from` and `to` are days (both included), the way the Merchants directory takes dates; without
 * them the window is the current month so far. Super admins only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;
  const { partnerId } = await params;

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? startOfDay(fromParam) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastDay = toParam ? startOfDay(toParam) : startOfDay(now.toISOString().slice(0, 10));
  if (!from || !lastDay) return NextResponse.json({ error: "Dates must look like 2026-10-31." }, { status: 400 });
  if (from.getTime() > lastDay.getTime()) return NextResponse.json({ error: "The start date must not be after the end date." }, { status: 400 });

  const stats = await loadPartnerStats(partnerId, from, new Date(lastDay.getTime() + DAY_MS));
  if (!stats) return NextResponse.json({ error: "Partner not found." }, { status: 404 });
  return NextResponse.json(stats);
}
