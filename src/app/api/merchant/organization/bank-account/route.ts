import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { resolveActiveBankAccount } from "@/lib/organization/bankAccountResolver";

export async function GET() {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await resolveActiveBankAccount(session.churchId);
  return NextResponse.json({ account });
}
