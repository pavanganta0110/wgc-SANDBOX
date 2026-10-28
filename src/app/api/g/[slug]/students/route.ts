import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkDonationRateLimit } from "@/lib/giving/donationRateLimit";

/**
 * Public student search for the giving page's "who is this gift for?" picker.
 * Returns first/last name and an opaque id only — never a student number or
 * email. Requires 2+ characters, is rate limited, and returns nothing unless
 * this link has the picker turned on for an organization with Student Giving
 * enabled (so a plain giving link can't be used to enumerate a roster).
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!checkDonationRateLimit(`students:${ip}:${slug}`)) {
    return NextResponse.json({ students: [] }, { status: 429 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ students: [] });

  const link = await prisma.givingLink.findUnique({
    where: { publicSlug: slug },
    select: { churchId: true, studentSelectionEnabled: true, studentId: true },
  });
  if (!link || !link.studentSelectionEnabled || link.studentId) return NextResponse.json({ students: [] });

  const church = await prisma.church.findUnique({ where: { id: link.churchId }, select: { studentGivingEnabled: true } });
  if (!church?.studentGivingEnabled) return NextResponse.json({ students: [] });

  const terms = q.split(/\s+/).slice(0, 3);
  const students = await prisma.student.findMany({
    where: {
      churchId: link.churchId,
      isActive: true,
      AND: terms.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: "insensitive" as const } },
          { lastName: { contains: t, mode: "insensitive" as const } },
        ],
      })),
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 15,
  });
  return NextResponse.json({
    students: students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim() })),
  });
}
