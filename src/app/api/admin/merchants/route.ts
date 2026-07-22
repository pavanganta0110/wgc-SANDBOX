import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/audit";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    
    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10)));
    const offset = (page - 1) * pageSize;

    // Filters
    const status = searchParams.get("status");
    const onboardingStatus = searchParams.get("onboardingStatus");
    const merchantActivationStatus = searchParams.get("merchantActivationStatus");
    const hasOpenTickets = searchParams.get("hasOpenTickets") === "true";
    const hasDisabledUsers = searchParams.get("hasDisabledUsers") === "true";
    const hasPendingInvitations = searchParams.get("hasPendingInvitations") === "true";
    const createdDateStart = searchParams.get("createdDateStart");
    const createdDateEnd = searchParams.get("createdDateEnd");
    
    // Search
    const search = searchParams.get("q") || "";

    // Base WHERE conditions
    const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];

    if (status) {
      conditions.push(Prisma.sql`c."status" = ${status}`);
    }
    
    if (onboardingStatus) {
      conditions.push(Prisma.sql`oa."status" = ${onboardingStatus}`);
    }
    
    if (merchantActivationStatus) {
      conditions.push(Prisma.sql`fms."merchantState" = ${merchantActivationStatus}`);
    }
    
    if (createdDateStart) {
      conditions.push(Prisma.sql`c."createdAt" >= ${new Date(createdDateStart)}`);
    }
    
    if (createdDateEnd) {
      conditions.push(Prisma.sql`c."createdAt" <= ${new Date(createdDateEnd)}`);
    }

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(Prisma.sql`(
        c.name ILIKE ${searchPattern} OR
        u.name ILIKE ${searchPattern} OR
        u.email ILIKE ${searchPattern} OR
        c.id ILIKE ${searchPattern} OR
        EXISTS (SELECT 1 FROM "User" u2 WHERE u2."churchId" = c.id AND u2.email ILIKE ${searchPattern}) OR
        EXISTS (SELECT 1 FROM "GivingLink" gl WHERE gl."churchId" = c.id AND gl.name ILIKE ${searchPattern})
      )`);
    }

    if (hasOpenTickets) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "SupportTicket" st WHERE st."churchId" = c.id AND st.status NOT IN ('RESOLVED', 'CLOSED')
      )`);
    }
    if (hasDisabledUsers) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "User" u2 WHERE u2."churchId" = c.id AND u2."disabledAt" IS NOT NULL
      )`);
    }
    if (hasPendingInvitations) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "User" u2 WHERE u2."churchId" = c.id AND u2."passwordHash" IS NULL AND u2."setPasswordTokenHash" IS NOT NULL
      )`);
    }

    const whereClause = Prisma.join(conditions, " AND ");

    // Get Total Count
    const countQuery = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT c.id) as count
      FROM "Church" c
      LEFT JOIN "User" u ON c."primaryOwnerUserId" = u.id
      LEFT JOIN "OnboardingApplication" oa ON c."onboardingApplicationId" = oa.id
      LEFT JOIN "FinixMerchantSnapshot" fms ON c."finixMerchantId" = fms."finixMerchantId"
      WHERE ${whereClause}
    `;
    
    const totalCount = Number(countQuery[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / pageSize);

    // Get Data
    const merchants = await prisma.$queryRaw<any[]>`
      SELECT 
        c.id,
        c.name,
        c.status,
        c."primaryOwnerUserId",
        u.name AS "primaryOwnerName",
        u.email AS "primaryOwnerEmail",
        c."createdAt",
        c."updatedAt" AS "lastActivity",
        oa.status AS "onboardingStatus",
        fms."merchantState" AS "merchantActivationStatus",
        (SELECT COUNT(*) FROM "User" u2 WHERE u2."churchId" = c.id) AS "usersCount",
        (SELECT COUNT(*) FROM "User" u2 WHERE u2."churchId" = c.id AND u2."disabledAt" IS NULL) AS "activeUsersCount",
        (SELECT COUNT(*) FROM "User" u2 WHERE u2."churchId" = c.id AND u2."disabledAt" IS NOT NULL) AS "disabledUsersCount",
        (SELECT COUNT(*) FROM "User" u2 WHERE u2."churchId" = c.id AND u2."passwordHash" IS NULL AND u2."setPasswordTokenHash" IS NOT NULL) AS "pendingInvitesCount",
        (SELECT COUNT(*) FROM "GivingLink" gl WHERE gl."churchId" = c.id) AS "givingPagesCount",
        (SELECT COUNT(*) FROM "Donor" d WHERE d."churchId" = c.id) AS "donorsCount",
        (SELECT COUNT(*) FROM "Payment" p WHERE p."churchId" = c.id) AS "transactionsCount",
        (SELECT COUNT(*) FROM "FinixSubscription" fs WHERE fs."churchId" = c.id AND fs.state = 'ACTIVE') AS "activeRecurringCount",
        (SELECT COUNT(*) FROM "SupportTicket" st WHERE st."churchId" = c.id AND st.status NOT IN ('RESOLVED', 'CLOSED')) AS "openTicketsCount"
      FROM "Church" c
      LEFT JOIN "User" u ON c."primaryOwnerUserId" = u.id
      LEFT JOIN "OnboardingApplication" oa ON c."onboardingApplicationId" = oa.id
      LEFT JOIN "FinixMerchantSnapshot" fms ON c."finixMerchantId" = fms."finixMerchantId"
      WHERE ${whereClause}
      ORDER BY c."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    // Format output since raw counts come back as BigInt in Prisma pg
    const data = merchants.map(m => ({
      id: m.id,
      name: m.name,
      status: m.status,
      primaryOwner: m.primaryOwnerUserId ? {
        id: m.primaryOwnerUserId,
        name: m.primaryOwnerName,
        email: m.primaryOwnerEmail
      } : null,
      createdAt: m.createdAt,
      lastActivity: m.lastActivity,
      onboardingStatus: m.onboardingStatus,
      merchantActivationStatus: m.merchantActivationStatus,
      counts: {
        users: Number(m.usersCount),
        active: Number(m.activeUsersCount),
        disabled: Number(m.disabledUsersCount),
        pendingInvites: Number(m.pendingInvitesCount),
        givingPages: Number(m.givingPagesCount),
        donors: Number(m.donorsCount),
        transactions: Number(m.transactionsCount),
        activeRecurring: Number(m.activeRecurringCount),
        openTickets: Number(m.openTicketsCount),
      }
    }));

    await createAuditLog({ action: "ADMIN_MERCHANTS_LISTED", actorEmail: session.email });

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages
      }
    });

  } catch (error) {
    console.error("Error fetching merchants:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
