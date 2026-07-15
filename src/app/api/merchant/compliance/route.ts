import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { reconcileComplianceFormsForChurch, resolveComplianceStatus } from "@/lib/finix/sync/complianceForms";

export async function GET() {
  const session = await getSession();
  if (!session || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await reconcileComplianceFormsForChurch(session.churchId);

  const form = await prisma.complianceForm.findFirst({
    where: { churchId: session.churchId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    form,
    status: resolveComplianceStatus(form ? { state: form.state, dueAt: form.dueAt } : null),
  });
}
