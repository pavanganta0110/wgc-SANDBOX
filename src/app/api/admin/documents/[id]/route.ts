import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const document = await prisma.onboardingInternalDocument.findUnique({
    where: { id },
    include: {
      onboardingApplication: {
        select: { id: true, organizationName: true, contactName: true, contactEmail: true },
      },
    },
  });
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  return NextResponse.json({ document });
}
