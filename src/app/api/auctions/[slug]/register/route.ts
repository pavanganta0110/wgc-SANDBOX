import { NextResponse } from "next/server";
import { loadPublicAuction } from "../_load";
import { requestBidderCode } from "@/lib/auctions/registration";

/** Step 1 of registering (and of signing back in): sends a code to the email. The answer is the same whether or not the email was known. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auction = await loadPublicAuction(slug);
  if (!auction || auction.status === "SETTLED") return NextResponse.json({ error: "Registration is closed." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const result = await requestBidderCode({ auction, name: body.name, email: body.email, phone: body.phone });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
