import { clientIp, allow } from "@/lib/scorecard/rateLimit";
import { badBody, readJson, toResponse, tooMany } from "@/lib/scorecard/http";
import { handlePurchase } from "@/lib/scorecard/service";

export const maxDuration = 60; // writing the report runs after the response but counts toward this

/** Called by the success page with the lead and the Finix transfer id. Confirms payment, then writes and emails the report. */
export async function POST(req: Request) {
  if (!(await allow(clientIp(req), "purchase", 10))) return tooMany();
  const body = (await readJson(req)) as { lead_id?: unknown; transfer_id?: unknown; fields?: unknown } | null;
  if (body === null || typeof body !== "object") return badBody();
  return toResponse(await handlePurchase({ lead_id: body.lead_id, transfer_id: body.transfer_id, fields: body.fields }));
}
