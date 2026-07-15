// NACHA standard ACH return reason codes.
export const ACH_RETURN_REASON_CODES: Record<string, string> = {
  R01: "Insufficient Funds",
  R02: "Account Closed",
  R03: "No Account/Unable to Locate Account",
  R04: "Invalid Account Number",
  R05: "Unauthorized Debit to Consumer Account",
  R06: "Returned per ODFI's Request",
  R07: "Authorization Revoked",
  R08: "Payment Stopped",
  R09: "Uncollected Funds",
  R10: "Customer Advises Unauthorized",
  R11: "Customer Advises Entry Not in Accordance with the Terms",
  R12: "Branch Sold to Another DFI",
  R13: "Invalid ACH Routing Number",
  R14: "Representative Payee Deceased or Unable to Continue in that Capacity",
  R15: "Beneficiary or Account Holder Deceased",
  R16: "Account Frozen",
  R17: "File Record Edit Criteria",
  R20: "Non-Transaction Account",
  R23: "Credit Entry Refused by Receiver",
  R24: "Duplicate Entry",
  R29: "Corporate Customer Advises Not Authorized",
};

export function describeAchReturnReason(reasonCode: string | null | undefined): string {
  if (!reasonCode) return "Unknown";
  const code = reasonCode.toUpperCase();
  return ACH_RETURN_REASON_CODES[code] || "Unknown";
}

export function formatAchReturnReason(reasonCode: string | null | undefined): string {
  if (!reasonCode) return "Unknown";
  const code = reasonCode.toUpperCase();
  const description = ACH_RETURN_REASON_CODES[code];
  return description ? `${code}: ${description}` : code;
}
