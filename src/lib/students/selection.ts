/**
 * Server-side resolution of a donor's "who is this gift for?" choice on the
 * public giving page. A client-supplied studentId is only ever trusted after
 * checking it against the giving link's own church and rules — same stance
 * as fund resolution in the donate route. Never affects the Finix merchant
 * or settlement routing; it is reporting/ledger metadata only.
 */
import { prisma } from "@/lib/prisma";
import { isStudentGivenFor, normalizeTermLabel, type StudentGivenFor } from "./constants";

export interface StudentSelection {
  studentId: string | null;
  termLabel: string | null;
  givenFor: StudentGivenFor | null;
}

export const NO_STUDENT_SELECTION: StudentSelection = { studentId: null, termLabel: null, givenFor: null };

export class StudentSelectionError extends Error {}

interface LinkLike {
  churchId: string;
  studentSelectionEnabled: boolean;
  studentId: string | null;
  studentTermLabel: string | null;
}

export async function resolveStudentSelection(
  link: LinkLike,
  submitted: { studentId?: unknown; givenFor?: unknown } | undefined,
): Promise<StudentSelection> {
  const church = await prisma.church.findUnique({
    where: { id: link.churchId },
    select: { studentGivingEnabled: true, studentCurrentTerm: true },
  });
  if (!church?.studentGivingEnabled) return NO_STUDENT_SELECTION;

  // Per-student link: the student is fixed by the link, never by the client.
  if (link.studentId) {
    const student = await prisma.student.findFirst({
      where: { id: link.studentId, churchId: link.churchId, isActive: true },
      select: { id: true },
    });
    if (!student) throw new StudentSelectionError("This student is no longer accepting gifts through this link.");
    const termLabel = normalizeTermLabel(link.studentTermLabel) ?? church.studentCurrentTerm;
    if (!termLabel) throw new StudentSelectionError("This link isn't set up for a term yet.");
    const givenFor: StudentGivenFor = submitted?.givenFor === "SELF" ? "SELF" : "SPONSOR";
    return { studentId: student.id, termLabel, givenFor };
  }

  if (!link.studentSelectionEnabled) return NO_STUDENT_SELECTION;

  const givenFor = submitted?.givenFor;
  if (!isStudentGivenFor(givenFor)) {
    throw new StudentSelectionError("Please choose who this gift is for.");
  }
  const termLabel = church.studentCurrentTerm;
  if (givenFor === "GENERAL") {
    return { studentId: null, termLabel, givenFor };
  }
  if (!termLabel) throw new StudentSelectionError("The current term hasn't been set up yet.");
  if (typeof submitted?.studentId !== "string" || !submitted.studentId) {
    throw new StudentSelectionError("Please choose a student.");
  }
  const student = await prisma.student.findFirst({
    where: { id: submitted.studentId, churchId: link.churchId, isActive: true },
    select: { id: true },
  });
  if (!student) throw new StudentSelectionError("That student could not be found.");
  return { studentId: student.id, termLabel, givenFor };
}
