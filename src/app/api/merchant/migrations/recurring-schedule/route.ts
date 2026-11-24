import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { SubmissionError, createScheduleSubmission, listScheduleSubmissions } from "@/lib/migrations/recurringSubmission";

async function authorize() {
  try {
    const auth = await requireMerchantSession();
    if (!hasPermission(auth, "canManageMigrations")) return { response: NextResponse.json({ error: "You do not have access to the Migration Center." }, { status: 403 }) };
    return { auth };
  } catch (err) {
    if (isAuthError(err)) return { response: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
}

/** The files this organization has sent WGC (without their contents). */
export async function GET() {
  const result = await authorize();
  if ("response" in result) return result.response;
  return NextResponse.json({ submissions: await listScheduleSubmissions(result.auth.churchId) });
}

/**
 * The merchant sends WGC the recurring-gift schedule they exported from their previous platform. It must not
 * contain card or bank numbers: the file is checked and refused if it does. WGC staff pick it up in the admin
 * Migration tab. Nothing is sent to Finix from here.
 */
export async function POST(req: Request) {
  const result = await authorize();
  if ("response" in result) return result.response;
  const { auth } = result;
  if (auth.impersonation) return NextResponse.json({ error: "A schedule cannot be sent while viewing as the merchant." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const scheduleCsv = typeof body.scheduleCsv === "string" ? body.scheduleCsv : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : null;
  try {
    const created = await createScheduleSubmission({ churchId: auth.churchId, userId: auth.userId, email: auth.email, fileName, csv: scheduleCsv, role: auth.rawRole });
    return NextResponse.json({ id: created.id, rowCount: created.rowCount });
  } catch (err) {
    if (err instanceof SubmissionError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
