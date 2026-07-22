import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { loadAdminTicketSummary } from "@/lib/support/adminTicketQueue";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    totalInquiries,
    newInquiries,
    contactedInquiries,
    totalDocuments,
    underReviewDocuments,
    approvedDocuments,
    recentInquiries,
    recentDocuments,
    recentTickets,
    ticketSummary,
  ] = await Promise.all([
    prisma.contactInquiry.count(),
    prisma.contactInquiry.count({ where: { status: "NEW" } }),
    prisma.contactInquiry.count({ where: { status: "CONTACTED" } }),
    prisma.onboardingInternalDocument.count({ where: { isCurrent: true } }),
    prisma.onboardingInternalDocument.count({ where: { isCurrent: true, status: "UNDER_REVIEW" } }),
    prisma.onboardingInternalDocument.count({ where: { isCurrent: true, status: "VERIFIED_BY_WGC" } }),
    prisma.contactInquiry.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, firstName: true, lastName: true, company: true, status: true, createdAt: true },
    }),
    prisma.onboardingInternalDocument.findMany({
      where: { isCurrent: true },
      orderBy: { uploadedAt: "desc" },
      take: 5,
      select: {
        id: true,
        originalFilename: true,
        status: true,
        uploadedAt: true,
        onboardingApplication: { select: { organizationName: true } },
      },
    }),
    prisma.supportTicket.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, ticketNumber: true, subject: true, status: true, priority: true, updatedAt: true },
    }),
    loadAdminTicketSummary(),
  ]);

  return NextResponse.json({
    inquiries: { total: totalInquiries, new: newInquiries, contacted: contactedInquiries },
    documents: { total: totalDocuments, underReview: underReviewDocuments, approved: approvedDocuments },
    tickets: ticketSummary,
    recentInquiries,
    recentDocuments,
    recentTickets,
  });
}
