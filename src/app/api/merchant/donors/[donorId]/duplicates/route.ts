import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { findPossibleDuplicates } from "@/lib/donors/donorMerge";

export async function GET(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canMerge) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const candidates = await findPossibleDuplicates(donorId, session.churchId);
  return NextResponse.json({ candidates });
}
