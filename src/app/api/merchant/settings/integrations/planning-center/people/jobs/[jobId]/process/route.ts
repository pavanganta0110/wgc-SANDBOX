import { NextResponse } from "next/server";
import { runAsIntegrationsManager } from "@/lib/integrations/planningcenter/routeAuth";
import { processPeopleJob } from "@/lib/integrations/planningcenter/peopleJobs";

export const maxDuration = 60;

/** Does one bounded chunk of a bulk job. The UI calls this until the job is COMPLETED. */
export async function POST(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  return runAsIntegrationsManager(async (auth) => {
    const job = await processPeopleJob(auth.churchId, jobId);
    return NextResponse.json({
      success: true,
      job: {
        id: job.id, type: job.type, status: job.status, totalCount: job.totalCount, processedCount: job.processedCount, linkedCount: job.linkedCount,
        reviewCount: job.reviewCount, noMatchCount: job.noMatchCount, createdCount: job.createdCount, skippedCount: job.skippedCount, failedCount: job.failedCount, lastError: job.lastError,
      },
    });
  });
}
