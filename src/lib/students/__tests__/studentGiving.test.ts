import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  church: { findUnique: vi.fn() },
  student: { findFirst: vi.fn(), findMany: vi.fn() },
  studentTermCharge: { findMany: vi.fn() },
  payment: { findMany: vi.fn() },
  externalDonation: { findMany: vi.fn() },
  finixRefundOrReversal: { findMany: vi.fn() },
  bankReturn: { findMany: vi.fn() },
  donor: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { computeStudentStatus } from "../constants";
import { parseDollarsToCents, parseStudentImport } from "../importPlan";
import { resolveStudentSelection, resolveStaffStudentSelection, StudentSelectionError } from "../selection";
import { loadTermLedger } from "../ledger";

describe("computeStudentStatus", () => {
  it("classifies credit against the charge", () => {
    expect(computeStudentStatus(null, 5000)).toBe("NO_CHARGE");
    expect(computeStudentStatus(420000, 0)).toBe("UNFUNDED");
    expect(computeStudentStatus(420000, 100000)).toBe("PARTIAL");
    expect(computeStudentStatus(420000, 420000)).toBe("FULLY_CREDITED");
    expect(computeStudentStatus(420000, 450000)).toBe("OVER_FUNDED");
  });
});

describe("parseDollarsToCents", () => {
  it("parses common money formats and rejects junk", () => {
    expect(parseDollarsToCents("$4,200.50")).toBe(420050);
    expect(parseDollarsToCents("4200")).toBe(420000);
    expect(parseDollarsToCents("12.5")).toBe(1250);
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
  });
});

describe("parseStudentImport", () => {
  it("reads a roster with charges and flags bad rows", () => {
    const csv = [
      "Student ID,First Name,Last Name,Email,Term,Charge",
      "1001,Jane,Doe,jane@example.com,Fall 2026,$4200",
      "1002,John,Smith,,Fall 2026,abc",
      ",No,Id,,,",
      "1001,Jane,Doe,,Fall 2026,4200",
    ].join("\n");
    const { rows, fatalError } = parseStudentImport(csv);
    expect(fatalError).toBeUndefined();
    expect(rows[0]).toMatchObject({ studentNumber: "1001", chargeCents: 420000, termLabel: "Fall 2026", errors: [] });
    expect(rows[1].errors[0]).toMatch(/Invalid charge/);
    expect(rows[2].errors).toContain("Missing Student ID");
    expect(rows[3].errors).toContain("Duplicate Student ID + term in this file");
  });

  it("uses the default term and a single Name column", () => {
    const { rows } = parseStudentImport("ID,Name,Amount\n7,\"Doe, Jane\",100", "Spring 2027");
    expect(rows[0]).toMatchObject({ firstName: "Jane", lastName: "Doe", termLabel: "Spring 2027", chargeCents: 10000, errors: [] });
  });

  it("rejects files without a Student ID column", () => {
    expect(parseStudentImport("First Name,Last Name\nA,B").fatalError).toMatch(/Student ID/);
  });
});

describe("resolveStudentSelection", () => {
  beforeEach(() => vi.clearAllMocks());
  const link = { churchId: "c1", studentSelectionEnabled: true, studentId: null, studentTermLabel: null };

  it("does nothing when the organization has the feature off", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ studentGivingEnabled: false, studentCurrentTerm: "Fall 2026" });
    expect(await resolveStudentSelection(link, { givenFor: "SPONSOR", studentId: "s1" })).toEqual({ studentId: null, termLabel: null, givenFor: null });
  });

  it("requires a choice on a picker link and never trusts another church's student", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ studentGivingEnabled: true, studentCurrentTerm: "Fall 2026" });
    await expect(resolveStudentSelection(link, {})).rejects.toBeInstanceOf(StudentSelectionError);
    prismaMock.student.findFirst.mockResolvedValue(null);
    await expect(resolveStudentSelection(link, { givenFor: "SPONSOR", studentId: "other-church" })).rejects.toBeInstanceOf(StudentSelectionError);
    expect(prismaMock.student.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "c1" }) }));
  });

  it("accepts a valid student and the general fund", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ studentGivingEnabled: true, studentCurrentTerm: "Fall 2026" });
    prismaMock.student.findFirst.mockResolvedValue({ id: "s1" });
    expect(await resolveStudentSelection(link, { givenFor: "SELF", studentId: "s1" })).toEqual({ studentId: "s1", termLabel: "Fall 2026", givenFor: "SELF" });
    expect(await resolveStudentSelection(link, { givenFor: "GENERAL" })).toEqual({ studentId: null, termLabel: "Fall 2026", givenFor: "GENERAL" });
  });

  it("fixes the student from a per-student link regardless of what the client sends", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ studentGivingEnabled: true, studentCurrentTerm: "Fall 2026" });
    prismaMock.student.findFirst.mockResolvedValue({ id: "linked" });
    const locked = { ...link, studentSelectionEnabled: false, studentId: "linked", studentTermLabel: "Spring 2027" };
    expect(await resolveStudentSelection(locked, { givenFor: "SPONSOR", studentId: "attacker" })).toEqual({
      studentId: "linked",
      termLabel: "Spring 2027",
      givenFor: "SPONSOR",
    });
  });
});

describe("loadTermLedger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts only settled gifts, nets refunds, and keeps pending separate", async () => {
    prismaMock.student.findMany.mockResolvedValue([
      { id: "s1", studentNumber: "1001", firstName: "Jane", lastName: "Doe", email: null, isActive: true },
      { id: "s2", studentNumber: "1002", firstName: "John", lastName: "Smith", email: null, isActive: true },
    ]);
    prismaMock.studentTermCharge.findMany.mockResolvedValue([
      { studentId: "s1", amountCents: 100000 },
      { studentId: "s2", amountCents: 50000 },
    ]);
    prismaMock.payment.findMany.mockResolvedValue([
      { id: "p1", studentId: "s1", studentTermLabel: "Fall 2026", studentGivenFor: "SPONSOR", createdAt: new Date(), donorId: "d1", isAnonymous: false, paymentMethodType: "PAYMENT_CARD", amountCents: 60000, donationAmountCents: 60000, status: "SUCCEEDED", finixTransferId: "T1" },
      { id: "p2", studentId: "s1", studentTermLabel: "Fall 2026", studentGivenFor: "SELF", createdAt: new Date(), donorId: "d2", isAnonymous: false, paymentMethodType: "BANK_ACCOUNT", amountCents: 10000, donationAmountCents: 10000, status: "PENDING", finixTransferId: "T2" },
      { id: "p3", studentId: "s2", studentTermLabel: "Fall 2026", studentGivenFor: "SPONSOR", createdAt: new Date(), donorId: "d1", isAnonymous: false, paymentMethodType: "PAYMENT_CARD", amountCents: 50000, donationAmountCents: 50000, status: "SUCCEEDED", finixTransferId: "T3" },
    ]);
    prismaMock.externalDonation.findMany.mockResolvedValue([
      { id: "e1", studentId: "s1", studentTermLabel: "Fall 2026", studentGivenFor: "SPONSOR", donationDate: new Date(), donorId: null, isAnonymous: false, paymentMethod: "CHECK", donationAmountCents: 40000, depositStatus: "CLEARED" },
      { id: "e2", studentId: "s1", studentTermLabel: "Fall 2026", studentGivenFor: "SPONSOR", donationDate: new Date(), donorId: null, isAnonymous: false, paymentMethod: "CHECK", donationAmountCents: 99900, depositStatus: "RETURNED" },
    ]);
    // s2's whole gift was refunded.
    prismaMock.finixRefundOrReversal.findMany.mockResolvedValue([{ finixOriginalTransferId: "T3", amountCents: 50000 }]);
    prismaMock.bankReturn.findMany.mockResolvedValue([]);
    prismaMock.donor.findMany.mockResolvedValue([{ id: "d1", name: "Pat", email: null }, { id: "d2", name: "Sam", email: null }]);

    const rows = await loadTermLedger({ churchId: "c1", termLabel: "Fall 2026" });
    const jane = rows.find((r) => r.studentId === "s1")!;
    expect(jane.creditedCents).toBe(100000); // 60,000 online + 40,000 check; RETURNED check excluded
    expect(jane.pendingCents).toBe(10000);
    expect(jane.balanceCents).toBe(0);
    expect(jane.status).toBe("FULLY_CREDITED");
    expect(jane.sponsorCents).toBe(100000);
    expect(jane.selfCents).toBe(0); // the pending $100 self-paid gift isn't counted yet
    const john = rows.find((r) => r.studentId === "s2")!;
    expect(john.creditedCents).toBe(0);
    expect(john.status).toBe("UNFUNDED");
  });
});

describe("resolveStaffStudentSelection (Take a Payment)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is a no-op when no student was chosen", async () => {
    expect(await resolveStaffStudentSelection("c1", {})).toEqual({ studentId: null, termLabel: null, givenFor: null });
    expect(prismaMock.church.findUnique).not.toHaveBeenCalled();
  });

  it("refuses when the feature is off, no term is set, or the student isn't this church's", async () => {
    prismaMock.church.findUnique.mockResolvedValueOnce({ studentGivingEnabled: false, studentCurrentTerm: "Fall 2026" });
    await expect(resolveStaffStudentSelection("c1", { studentId: "s1" })).rejects.toBeInstanceOf(StudentSelectionError);
    prismaMock.church.findUnique.mockResolvedValueOnce({ studentGivingEnabled: true, studentCurrentTerm: null });
    await expect(resolveStaffStudentSelection("c1", { studentId: "s1" })).rejects.toBeInstanceOf(StudentSelectionError);
    prismaMock.church.findUnique.mockResolvedValueOnce({ studentGivingEnabled: true, studentCurrentTerm: "Fall 2026" });
    prismaMock.student.findFirst.mockResolvedValueOnce(null);
    await expect(resolveStaffStudentSelection("c1", { studentId: "other-church" })).rejects.toBeInstanceOf(StudentSelectionError);
    expect(prismaMock.student.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "c1" }) }));
  });

  it("returns the student, the org's current term, and sponsor vs self", async () => {
    prismaMock.church.findUnique.mockResolvedValue({ studentGivingEnabled: true, studentCurrentTerm: "Fall 2026" });
    prismaMock.student.findFirst.mockResolvedValue({ id: "s1" });
    expect(await resolveStaffStudentSelection("c1", { studentId: "s1", givenFor: "SELF" })).toEqual({ studentId: "s1", termLabel: "Fall 2026", givenFor: "SELF" });
    expect(await resolveStaffStudentSelection("c1", { studentId: "s1" })).toEqual({ studentId: "s1", termLabel: "Fall 2026", givenFor: "SPONSOR" });
  });
});
