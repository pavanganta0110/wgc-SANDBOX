import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const page = await prisma.givingPage.findFirst({
    where: { id, churchId: session.churchId },
    include: { givingPagePersons: true }
  });
  if (!page) {
    return NextResponse.json({ error: "Giving page not found" }, { status: 404 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.logoUrl === "string") data.logoUrl = body.logoUrl || null;
  if (typeof body.headline === "string") data.headline = body.headline || null;
  if (typeof body.description === "string") data.description = body.description || null;
  if (typeof body.primaryColorHex === "string") data.primaryColorHex = body.primaryColorHex;
  if (Array.isArray(body.suggestedAmountsCents)) data.suggestedAmountsJson = body.suggestedAmountsCents;
  if (typeof body.allowRecurring === "boolean") data.allowRecurring = body.allowRecurring;
  if (typeof body.allowFeeCoverage === "boolean") data.allowFeeCoverage = body.allowFeeCoverage;

  let newGivingPageType = page.givingPageType;
  if (body.givingPageType === "PERSON" || body.givingPageType === "ORGANIZATION") {
    data.givingPageType = body.givingPageType;
    newGivingPageType = body.givingPageType;
  }

  const personIds = Array.isArray(body.personIds) ? (body.personIds as string[]) : null;

  if (newGivingPageType === "PERSON" && personIds && personIds.length === 0) {
    return NextResponse.json({ error: "At least one person must be selected for a Person Giving Page" }, { status: 400 });
  }

  if (newGivingPageType === "PERSON" && personIds) {
    const people = await prisma.organizationPerson.findMany({
      where: {
        id: { in: personIds },
        churchId: session.churchId,
        isActive: true,
      },
    });
    // It's possible to keep an inactive person if they were already on the page?
    // Let's just check if they are in the DB and belong to the church.
    const validPeople = await prisma.organizationPerson.findMany({
      where: {
        id: { in: personIds },
        churchId: session.churchId,
      },
    });
    if (validPeople.length !== personIds.length) {
      return NextResponse.json({ error: "One or more selected people are invalid or belong to another organization" }, { status: 400 });
    }

    // Check if new additions are inactive
    const existingPersonIds = page.givingPagePersons.map(p => p.personId);
    const newPersonIds = personIds.filter((id: string) => !existingPersonIds.includes(id));
    const inactiveNew = validPeople.some(p => newPersonIds.includes(p.id) && !p.isActive);
    if (inactiveNew) {
      return NextResponse.json({ error: "Only active people may be newly added to a Giving Page." }, { status: 400 });
    }
  }

  // Update inside a transaction to handle relations
  const updated = await prisma.$transaction(async (tx) => {
    // If we passed personIds, sync them
    if (personIds !== null) {
      if (newGivingPageType === "ORGANIZATION") {
        await tx.givingPagePerson.deleteMany({ where: { givingPageId: id } });
      } else {
        await tx.givingPagePerson.deleteMany({ where: { givingPageId: id } });
        if (personIds.length > 0) {
          await tx.givingPagePerson.createMany({
            data: personIds.map((personId: string, index: number) => ({
              givingPageId: id,
              personId,
              displayOrder: index,
            }))
          });
        }
      }
    } else if (newGivingPageType === "ORGANIZATION") {
      // If changed to organization but personIds not provided, clear them
      await tx.givingPagePerson.deleteMany({ where: { givingPageId: id } });
    }

    return await tx.givingPage.update({
      where: { id },
      data,
      include: {
        givingPagePersons: {
          include: { person: true },
          orderBy: { displayOrder: 'asc' },
        }
      }
    });
  });

  return NextResponse.json({ page: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const page = await prisma.givingPage.findFirst({ where: { id, churchId: session.churchId } });
  if (!page) {
    return NextResponse.json({ error: "Giving page not found" }, { status: 404 });
  }
  if (page.isDefault) {
    return NextResponse.json({ error: "Disable your default giving page instead of deleting it" }, { status: 400 });
  }

  await prisma.givingPage.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
