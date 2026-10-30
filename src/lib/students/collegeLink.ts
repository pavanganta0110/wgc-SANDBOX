import { prisma } from "@/lib/prisma";

/** A link that can serve as "the giving link for all students". */
export const COLLEGE_LINK_ELIGIBLE = {
  status: "ACTIVE",
  studentId: null,
  fundSelectionEnabled: false,
} as const;

/**
 * The organization's chosen all-students link: the one saved on the church if
 * it is still an active student-picker link, otherwise the oldest such link.
 */
export async function findCollegeLink(churchId: string) {
  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { studentGivingLinkId: true } });
  const where = { churchId, studentSelectionEnabled: true, studentId: null, status: "ACTIVE" } as const;
  if (church?.studentGivingLinkId) {
    const chosen = await prisma.givingLink.findFirst({ where: { ...where, id: church.studentGivingLinkId } });
    if (chosen) return chosen;
  }
  return prisma.givingLink.findFirst({ where, orderBy: { createdAt: "asc" } });
}
