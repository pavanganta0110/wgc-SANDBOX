import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  const session = await getSession();

  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const primaryContactEmail =
    typeof body.primaryContactEmail === "string" ? body.primaryContactEmail.trim() : undefined;

  if (!name && !primaryContactEmail) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.church.update({
    where: { id: session.churchId },
    data: {
      ...(name ? { name } : {}),
      ...(primaryContactEmail ? { primaryContactEmail } : {}),
    },
  });

  return NextResponse.json({ success: true });
}
