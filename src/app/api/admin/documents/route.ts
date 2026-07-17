import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: any = { isCurrent: true };
  if (status && status !== "ALL") where.status = status;

  const documents = await prisma.onboardingInternalDocument.findMany({
    where,
    orderBy: { uploadedAt: "desc" },
    include: {
      onboardingApplication: {
        select: { id: true, organizationName: true, contactName: true, contactEmail: true },
      },
    },
  });

  return NextResponse.json({ documents });
}
