import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { canManageFunds } from "@/lib/giving/fundPermissions";

/** The church's full Gift Designation catalog — active and archived, for
 * the "Manage Funds" admin UI. Public/giving-link-facing reads only ever
 * select active funds (see loadPublicGivingPageData.ts). */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!canManageFunds(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const funds = await prisma.fund.findMany({
    where: { churchId: auth.churchId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ funds });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!canManageFunds(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Fund name is required" }, { status: 400 });
  }

  const existing = await prisma.fund.findUnique({ where: { churchId_name: { churchId: auth.churchId, name } } });
  if (existing) {
    return NextResponse.json({ error: "A fund with this name already exists" }, { status: 409 });
  }

  const maxOrder = await prisma.fund.aggregate({ where: { churchId: auth.churchId }, _max: { displayOrder: true } });

  const fund = await prisma.fund.create({
    data: {
      churchId: auth.churchId,
      name,
      description: description || null,
      displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
    },
  });
  return NextResponse.json({ fund }, { status: 201 });
}
