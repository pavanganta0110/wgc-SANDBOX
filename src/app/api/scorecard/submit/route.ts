import { clientIp, allow } from "@/lib/scorecard/rateLimit";
import { badBody, readJson, toResponse, tooMany } from "@/lib/scorecard/http";
import { handleSubmit } from "@/lib/scorecard/service";

/** Saves a lead, beta feedback, or a purchase notice from the scorecard page. */
export async function POST(req: Request) {
  if (!(await allow(clientIp(req), "submit", 20))) return tooMany();
  const body = await readJson(req);
  if (body === null) return badBody();
  return toResponse(await handleSubmit(body));
}
