import { describe, it, expect } from "vitest";
import {
  buildRecurringPreview,
  daysBetween,
  parseAmountToCents,
  parseDateString,
  parseFrequency,
  parseMappingCsv,
  parseScheduleCsv,
  recurringFingerprint,
} from "../recurringImport";

const TODAY = "2026-11-24";
const MAPPING = ["external_customer_id,original_token_id,identity_id,instrument_id", "C1,tokA,IDa,PIa", "C2,tokB,IDb,PIb", "C3,tokC1,IDc,PIc1", "C3,tokC2,IDc,PIc2"].join("\n");
const HEADER = "external_customer_id,original_token_id,donor_name,donor_email,amount,frequency,next_charge_date,fund";
const preview = (scheduleRows: string[], over: Partial<Parameters<typeof buildRecurringPreview>[0]> = {}) =>
  buildRecurringPreview({ churchId: "ch1", scheduleCsv: [HEADER, ...scheduleRows].join("\n"), mappingCsv: MAPPING, fundMap: { "general fund": "fund1" }, alreadyImported: new Set(), today: TODAY, ...over });

describe("parsing", () => {
  it("reads dollars, dates and frequencies in the forms platforms export", () => {
    expect(parseAmountToCents("25")).toBe(2500);
    expect(parseAmountToCents("$1,250.50")).toBe(125050);
    expect(parseAmountToCents("25.555")).toBeNull();
    expect(parseAmountToCents("twenty")).toBeNull();
    expect(parseDateString("2027-01-05")).toBe("2027-01-05");
    expect(parseDateString("1/5/2027")).toBe("2027-01-05");
    expect(parseDateString("13/45/2027")).toBeNull();
    expect(parseDateString("2027-02-30")).toBeNull();
    expect(parseFrequency("Monthly")).toBe("MONTHLY");
    expect(parseFrequency("annually")).toBe("YEARLY");
    expect(parseFrequency("biweekly")).toBeNull();
    expect(daysBetween("2026-11-24", "2026-11-25")).toBe(1);
  });

  it("finds the mapping columns under different names, and keeps a blank Finix row as a failed one", () => {
    const { rows, errors } = parseMappingCsv("Customer ID,Token ID,Identity_ID,Payment Instrument ID\nC1,t1,IDx,PIx\nC2,t2,,\n");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ externalCustomerId: "C1", originalTokenId: "t1", finixIdentityId: "IDx", finixInstrumentId: "PIx" });
    expect(rows[0].failedReason).toBeUndefined();
    expect(rows[1]).toMatchObject({ externalCustomerId: "C2", failedReason: "Finix did not import this card." });
  });

  it("reads Finix's own output file: its header names, failed rows with their reason, and expired cards", () => {
    const finixFile = [
      "import_reference_number,finix_instrument_id,finix_identity_id,finix_application_id,successful,external_customer_id,external_token_id,customer_email,instrument_last_four,card_brand,expiration_month,expiration_year,error_msg,is_expired",
      "REF1,PIgood,IDgood,APPx,true,C1,tokA,a@x.org,4444,VISA,12,2030,,false",
      "REF1,,,APPx,false,C2,tokB,b@x.org,,,,,Card number failed validation,false",
      "REF1,PIold,IDold,APPx,true,C3,tokC,c@x.org,1111,VISA,1,2020,,true",
    ].join("\n");
    const { rows, errors } = parseMappingCsv(finixFile);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ externalCustomerId: "C1", originalTokenId: "tokA", finixIdentityId: "IDgood", finixInstrumentId: "PIgood" });
    expect(rows[1]).toMatchObject({ externalCustomerId: "C2", failedReason: "Card number failed validation" });
    expect(rows[2]).toMatchObject({ expired: true });

    const schedule = ["external_customer_id,external_token_id,amount,frequency,next_charge_date", "C1,tokA,10,monthly,2026-12-05", "C2,tokB,10,monthly,2026-12-05", "C3,tokC,10,monthly,2026-12-05"].join("\n");
    const result = buildRecurringPreview({ churchId: "ch1", scheduleCsv: schedule, mappingCsv: finixFile, fundMap: {}, alreadyImported: new Set(), today: TODAY });
    expect(result.rows[0].status).toBe("WARNING"); // no fund is only a warning
    expect(result.rows[1]).toMatchObject({ status: "INVALID" });
    expect(result.rows[1].messages.join(" ")).toContain("Card number failed validation");
    expect(result.rows[2].messages.join(" ")).toContain("expired");
  });

  it("reports missing columns instead of guessing", () => {
    expect(parseMappingCsv("a,b\n1,2").errors.length).toBeGreaterThan(0);
    expect(parseScheduleCsv("external_customer_id,amount\nC1,5").errors.join(" ")).toContain("frequency");
  });
});

describe("validation", () => {
  it("accepts a good row and computes the trial length", () => {
    const { rows, counts } = preview(["C1,tokA,Jordan Ellis,j@x.org,25.00,monthly,2026-12-05,General Fund"]);
    expect(rows[0]).toMatchObject({ status: "VALID", finixInstrumentId: "PIa", finixIdentityId: "IDa", amountCents: 2500, frequency: "MONTHLY", trialDays: 11, fundId: "fund1" });
    expect(counts).toMatchObject({ total: 1, VALID: 1, INVALID: 0 });
  });

  it("rejects a customer that is not in the mapping file", () => {
    const { rows } = preview(["C9,tokZ,Nobody,n@x.org,25.00,monthly,2026-12-05,General Fund"]);
    expect(rows[0].status).toBe("INVALID");
    expect(rows[0].messages.join(" ")).toContain("No match in the mapping file");
  });

  it("needs the token when a customer has more than one saved card, and picks the right one with it", () => {
    expect(preview(["C3,,Sam,s@x.org,10.00,monthly,2026-12-05,General Fund"]).rows[0].status).toBe("INVALID");
    expect(preview(["C3,tokC2,Sam,s@x.org,10.00,monthly,2026-12-05,General Fund"]).rows[0]).toMatchObject({ status: "VALID", finixInstrumentId: "PIc2" });
    expect(preview(["C3,tokNope,Sam,s@x.org,10.00,monthly,2026-12-05,General Fund"]).rows[0].status).toBe("INVALID");
  });

  it("never lets a first charge fall on or before today", () => {
    for (const date of ["2026-11-24", "2026-11-01"]) {
      const row = preview([`C1,tokA,J,j@x.org,25.00,monthly,${date},General Fund`]).rows[0];
      expect(row.status).toBe("INVALID");
      expect(row.messages.join(" ")).toContain("at least tomorrow");
    }
    expect(preview(["C1,tokA,J,j@x.org,25.00,monthly,2026-11-25,General Fund"]).rows[0]).toMatchObject({ status: "VALID", trialDays: 1 });
    expect(preview(["C1,tokA,J,j@x.org,25.00,monthly,2028-11-25,General Fund"]).rows[0].status).toBe("INVALID");
  });

  it("checks amount and frequency", () => {
    expect(preview(["C1,tokA,J,j@x.org,0.50,monthly,2026-12-05,General Fund"]).rows[0].status).toBe("INVALID");
    expect(preview(["C1,tokA,J,j@x.org,60000,monthly,2026-12-05,General Fund"]).rows[0].status).toBe("INVALID");
    expect(preview(["C1,tokA,J,j@x.org,10,fortnightly,2026-12-05,General Fund"]).rows[0].status).toBe("INVALID");
  });

  it("holds a row whose fund is not matched, and lists the fund so staff can match it", () => {
    const result = preview(["C1,tokA,J,j@x.org,25.00,monthly,2026-12-05,Missions"]);
    expect(result.rows[0].status).toBe("INVALID");
    expect(result.unmatchedFunds).toEqual(["Missions"]);
    expect(preview(["C1,tokA,J,j@x.org,25.00,monthly,2026-12-05,Missions"], { fundMap: { missions: "fund2" } }).rows[0]).toMatchObject({ status: "VALID", fundId: "fund2" });
  });

  it("warns, but still allows, a row with no fund", () => {
    const row = preview(["C1,tokA,J,j@x.org,25.00,monthly,2026-12-05,"]).rows[0];
    expect(row.status).toBe("WARNING");
    expect(row.messages.join(" ")).toContain("No fund");
  });

  it("flags repeats inside the file and rows already imported", () => {
    const line = "C1,tokA,J,j@x.org,25.00,monthly,2026-12-05,General Fund";
    const twice = preview([line, line]);
    expect(twice.rows.map((r) => r.status)).toEqual(["VALID", "DUPLICATE"]);
    const done = new Set([recurringFingerprint("ch1", { externalCustomerId: "C1", originalTokenId: "tokA", amountCents: 2500, frequency: "MONTHLY" })]);
    expect(preview([line], { alreadyImported: done }).rows[0].status).toBe("DUPLICATE");
  });

  it("warns when two rows would charge the same card the same amount twice a period", () => {
    const rows = preview(["C1,tokA,J,j@x.org,25.00,monthly,2026-12-05,General Fund", "C1,tokA,J,j@x.org,25.00,monthly,2026-12-20,General Fund"]).rows;
    expect(rows[0].status).toBe("VALID");
    expect(["DUPLICATE", "WARNING"]).toContain(rows[1].status);
  });

  it("reports a file-level problem with no rows", () => {
    const result = buildRecurringPreview({ churchId: "ch1", scheduleCsv: "x,y\n1,2", mappingCsv: MAPPING, fundMap: {}, alreadyImported: new Set(), today: TODAY });
    expect(result.rows).toEqual([]);
    expect(result.fileErrors.length).toBeGreaterThan(0);
  });
});
