import { NextResponse } from "next/server";
import { endDonorSession } from "@/lib/donorPortal/donorAuth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = typeof body.slug === "string" ? body.slug : "";
  if (slug) await endDonorSession(slug);
  return NextResponse.json({ success: true });
}
