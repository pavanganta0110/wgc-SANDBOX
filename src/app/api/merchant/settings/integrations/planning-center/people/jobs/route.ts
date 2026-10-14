import { NextResponse } from "next/server";
import { z } from "zod";
import { runAsIntegrationsManager, parseJsonBody } from "@/lib/integrations/planningcenter/routeAuth";
import { startPeopleJob } from "@/lib/integrations/planningcenter/peopleJobs";

const bodySchema = z.object({ type: z.enum(["MATCH_DONORS", "IMPORT_PEOPLE"]) });

/** Starts a bulk job (or returns the one already running). Work happens in .../process. */
export async function POST(req: Request) {
  return runAsIntegrationsManager(async (auth) => {
    const body = await parseJsonBody(req, bodySchema);
    if (!body.ok) return body.response;
    const job = await startPeopleJob(auth.churchId, body.data.type, { userId: auth.userId, email: auth.email, role: auth.role, req });
    return NextResponse.json({ success: true, jobId: job.id, status: job.status });
  });
}
