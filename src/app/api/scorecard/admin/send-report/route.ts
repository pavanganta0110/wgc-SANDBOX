import { toResponse } from "@/lib/scorecard/http";
import { handleAdminSend } from "@/lib/scorecard/service";

export const maxDuration = 60;

/** The "payment checked, send it" link in Collin's notification email. Signed; GET only shows a confirm button. */
async function handle(req: Request) {
  const q = new URL(req.url).searchParams;
  return toResponse(await handleAdminSend({ id: q.get("id"), t: q.get("t"), method: req.method }));
}
export const GET = handle;
export const POST = handle;
