import { clientIp, allow } from "@/lib/scorecard/rateLimit";
import { badBody, readJson, toResponse, tooMany } from "@/lib/scorecard/http";
import { handleScore } from "@/lib/scorecard/service";

export const maxDuration = 60; // the AI scoring call can take a while

/** Free AI scoring of the scorecard. Limited per visitor because every call costs money. */
export async function POST(req: Request) {
  if (!(await allow(clientIp(req), "score", 6))) return tooMany();
  const body = await readJson(req);
  if (body === null) return badBody();
  return toResponse(await handleScore(body));
}
