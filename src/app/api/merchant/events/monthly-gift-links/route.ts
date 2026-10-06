import { NextResponse } from "next/server";
import { guardEventsRoute } from "@/lib/eventRegistration/merchantGuard";
import { listMonthlyGiftLinkOptions } from "@/lib/eventRegistration/eventGivingLink";

/** GET -> { links: [{ id, publicSlug, name }] }: this organization's own giving pages an event's monthly gift can use. */
export async function GET() {
  const guard = await guardEventsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ links: await listMonthlyGiftLinkOptions(guard.auth.churchId) });
}
