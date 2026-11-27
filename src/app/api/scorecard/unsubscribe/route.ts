import { toResponse } from "@/lib/scorecard/http";
import { handleUnsubscribe } from "@/lib/scorecard/service";

/** The unsubscribe link in every follow-up email. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return toResponse(await handleUnsubscribe({ id: q.get("id"), t: q.get("t") }));
}
