import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardStudentApi } from "@/lib/students/access";
import { normalizeTermLabel } from "@/lib/students/constants";

/** Turn Student Giving on/off for this organization and set the term the
 * public "who is this gift for?" picker credits gifts to. */
export async function POST(req: Request) {
  const guard = await guardStudentApi({ manage: true, allowDisabled: true });
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  const data: { studentGivingEnabled?: boolean; studentCurrentTerm?: string | null } = {};
  if (typeof body.enabled === "boolean") data.studentGivingEnabled = body.enabled;
  if (body.currentTerm !== undefined) {
    const term = normalizeTermLabel(body.currentTerm);
    if (body.currentTerm && !term) return NextResponse.json({ error: "Invalid term" }, { status: 400 });
    data.studentCurrentTerm = term;
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const church = await prisma.church.update({
    where: { id: guard.auth.churchId },
    data,
    select: { studentGivingEnabled: true, studentCurrentTerm: true },
  });
  return NextResponse.json({ settings: church });
}
