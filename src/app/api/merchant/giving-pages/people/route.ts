import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const people = await prisma.organizationPerson.findMany({
    where: { churchId: session.churchId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ people });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!displayName) {
    return NextResponse.json({ error: "Display name is required" }, { status: 400 });
  }

  const person = await prisma.organizationPerson.create({
    data: {
      churchId: session.churchId,
      displayName,
      firstName: body.firstName || null,
      lastName: body.lastName || null,
      title: body.title || null,
      ministryOrDepartment: body.ministryOrDepartment || null,
      publicDescription: body.publicDescription || null,
      profileImageUrl: body.profileImageUrl || null,
      isActive: body.isActive ?? true,
      displayOrder: body.displayOrder ?? 0,
    },
  });

  return NextResponse.json({ person });
}
