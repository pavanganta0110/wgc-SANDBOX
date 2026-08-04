import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";

const HEADERS = [
  "donor_first_name",
  "donor_last_name",
  "donor_email",
  "donor_phone",
  "donor_address",
  "amount",
  "donation_date",
  "payment_method",
  "fund",
  "campaign",
  "reference_number",
  "tax_deductible",
  "deductible_amount",
  "goods_or_services_provided",
  "goods_or_services_value",
  "anonymous",
  "notes",
  "send_receipt",
];

const SAMPLE_ROWS = [
  [
    "Jane",
    "Smith",
    "jane.smith@example.com",
    "555-123-4567",
    "123 Main St, Springfield, IL 62704",
    "125.00",
    "2026-01-15",
    "CHECK",
    "General Fund",
    "",
    "1042",
    "yes",
    "",
    "no",
    "",
    "no",
    "Check received at Sunday service",
    "yes",
  ],
  ["", "", "", "", "", "50.00", "2026-01-20", "CASH", "Missions", "Spring Drive", "", "yes", "", "no", "", "yes", "Given anonymously in the offering plate", "no"],
];

/** Downloads a blank starter CSV with the columns the import expects and two
 * example rows — nothing here is stored or transmitted anywhere else. */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canImportExternalDonations");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const lines = [HEADERS.join(","), ...SAMPLE_ROWS.map((row) => row.map((v) => (v.includes(",") ? `"${v}"` : v)).join(","))];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="external-donations-import-template.csv"',
    },
  });
}
