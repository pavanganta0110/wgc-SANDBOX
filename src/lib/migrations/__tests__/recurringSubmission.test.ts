import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  migrationJob: { create: vi.fn(), count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

import {
  MAX_OPEN_SUBMISSIONS,
  SubmissionError,
  createScheduleSubmission,
  findCardData,
  getScheduleSubmissionCsv,
  listScheduleSubmissions,
  luhnValid,
  markScheduleSubmissionUsed,
} from "../recurringSubmission";

const HEADER = "external_customer_id,donor_name,amount,frequency,next_charge_date,fund";
const GOOD = [HEADER, "C1,Jordan Ellis,25.00,monthly,2027-01-05,General Fund", "C2,Sam Rivera,50,weekly,2027-01-07,Missions"].join("\n");
const params = (csv: string) => ({ churchId: "ch1", userId: "u1", email: "owner@org.test", fileName: "ctg.csv", csv });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.migrationJob.count.mockResolvedValue(0);
  prismaMock.migrationJob.create.mockResolvedValue({ id: "sub1" });
});

describe("the card-number safety scan", () => {
  it("recognizes a real card number by its checksum, with spaces or dashes", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(findCardData(`${HEADER}\nC1,Jordan,25,monthly,2027-01-05,4111 1111 1111 1111`)).toContain("Row 2");
    expect(findCardData(`${HEADER}\nC1,Jordan,25,monthly,2027-01-05,5555-5555-5555-4444`)).toContain("looks like a card number");
  });

  it("refuses a column that holds card or bank numbers, whatever else is in the file", () => {
    for (const h of ["card_number", "Card Number", "CVV", "account_number", "routing_number", "PAN"]) {
      expect(findCardData(`external_customer_id,${h},amount\nC1,x,25`)).toContain("Card and bank numbers must never be sent");
    }
  });

  it("does not flag ordinary data: amounts, dates, short customer IDs, token IDs, last four", () => {
    expect(findCardData(GOOD)).toBeNull();
    expect(findCardData("external_customer_id,original_token_id,card_last4,amount\n1234567890,tok_abc123,4444,25.00")).toBeNull();
    expect(findCardData("external_customer_id,amount\n12345678901234567890,25")).toBeNull(); // 20 digits: not a card length
  });

  it("never repeats the number it found in its message", () => {
    const message = findCardData(`${HEADER}\nC1,Jordan,25,monthly,2027-01-05,4111111111111111`) ?? "";
    expect(message).not.toContain("4111");
  });
});

describe("sending a schedule", () => {
  it("stores a good file as a submitted job with its text and row count, and calls nothing else", async () => {
    const result = await createScheduleSubmission(params(GOOD));
    expect(result).toEqual({ id: "sub1", rowCount: 2 });
    const data = prismaMock.migrationJob.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ churchId: "ch1", sourceSystem: "CONTINUE_TO_GIVE", status: "SUBMITTED", fileName: "ctg.csv", totalRecords: 0 });
    expect(data.sourceDataJson).toMatchObject({ kind: "schedule_submission", scheduleCsv: GOOD, rowCount: 2, submittedByEmail: "owner@org.test" });
  });

  it.each([
    ["an empty file", ""],
    ["a file with card numbers", `${HEADER}\nC1,Jordan,25,monthly,2027-01-05,4111111111111111`],
    ["a file with a card column", "external_customer_id,card_number,amount,frequency,next_charge_date\nC1,x,25,monthly,2027-01-05"],
    ["a file missing the frequency column", "external_customer_id,amount,next_charge_date\nC1,25,2027-01-05"],
    ["a file with no data rows", HEADER],
  ])("refuses %s and saves nothing", async (_label, csv) => {
    await expect(createScheduleSubmission(params(csv))).rejects.toBeInstanceOf(SubmissionError);
    expect(prismaMock.migrationJob.create).not.toHaveBeenCalled();
  });

  it("refuses a file over 2 MB, and a merchant with too many files waiting", async () => {
    await expect(createScheduleSubmission(params(GOOD + "\n" + "x".repeat(2 * 1024 * 1024)))).rejects.toThrow("2 MB");
    prismaMock.migrationJob.count.mockResolvedValue(MAX_OPEN_SUBMISSIONS);
    await expect(createScheduleSubmission(params(GOOD))).rejects.toThrow("already several files");
    expect(prismaMock.migrationJob.create).not.toHaveBeenCalled();
  });
});

describe("what staff and the merchant can read", () => {
  it("lists files without their contents", async () => {
    prismaMock.migrationJob.findMany.mockResolvedValue([{ id: "a", fileName: "f.csv", status: "SUBMITTED", createdAt: new Date("2026-11-24"), sourceDataJson: { rowCount: 3, submittedByEmail: "o@x.test", scheduleCsv: "SECRET" } }]);
    const list = await listScheduleSubmissions("ch1");
    expect(list).toEqual([{ id: "a", fileName: "f.csv", status: "SUBMITTED", rowCount: 3, submittedByEmail: "o@x.test", createdAt: new Date("2026-11-24"), usedByJobId: null }]);
    expect(JSON.stringify(list)).not.toContain("SECRET");
    expect(prismaMock.migrationJob.findMany.mock.calls[0][0].where).toMatchObject({ churchId: "ch1", sourceSystem: "CONTINUE_TO_GIVE" });
  });

  it("returns a file's text only for its own organization", async () => {
    prismaMock.migrationJob.findFirst.mockResolvedValue({ fileName: "f.csv", sourceDataJson: { scheduleCsv: GOOD } });
    expect(await getScheduleSubmissionCsv("a", "ch1")).toEqual({ csv: GOOD, fileName: "f.csv" });
    expect(prismaMock.migrationJob.findFirst.mock.calls[0][0].where).toMatchObject({ id: "a", churchId: "ch1" });
    prismaMock.migrationJob.findFirst.mockResolvedValue(null);
    expect(await getScheduleSubmissionCsv("a", "other")).toBeNull();
  });

  it("marks a file used by an import and keeps its text", async () => {
    prismaMock.migrationJob.findFirst.mockResolvedValue({ sourceDataJson: { scheduleCsv: GOOD, rowCount: 2 } });
    await markScheduleSubmissionUsed("a", "ch1", "job9");
    const data = prismaMock.migrationJob.update.mock.calls[0][0].data;
    expect(data.status).toBe("SUBMISSION_USED");
    expect(data.sourceDataJson).toMatchObject({ scheduleCsv: GOOD, usedByJobId: "job9" });
  });
});
