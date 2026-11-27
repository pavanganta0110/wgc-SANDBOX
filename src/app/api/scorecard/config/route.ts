import { NextResponse } from "next/server";
import { scorecardConfig } from "@/lib/scorecard/config";

/**
 * What the scorecard pages need to know that differs between the sandbox and live: the slug of the giving link that
 * takes the $100. Public, and nothing secret: the slug is already in the page's address when someone pays.
 */
export async function GET() {
  return NextResponse.json({ givingLinkSlug: scorecardConfig().givingLinkSlug }, { headers: { "cache-control": "no-store" } });
}
