import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAsIntegrationsManager } from "@/lib/integrations/planningcenter/routeAuth";
import { getPeopleOverview } from "@/lib/integrations/planningcenter/peopleOverview";
import { PlanningCenterConnectionError } from "@/lib/integrations/planningcenter/errors";

/** Donor ↔ Planning Center person links: counts, the review list, and the latest bulk jobs. */
export async function GET() {
  return runAsIntegrationsManager(async (auth) => {
    const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId: auth.churchId } });
    if (!connection || connection.status !== "CONNECTED" || !connection.pcoOrganizationId) throw new PlanningCenterConnectionError("Connect Planning Center first.");
    return NextResponse.json(await getPeopleOverview(auth.churchId, connection.pcoOrganizationId));
  });
}
