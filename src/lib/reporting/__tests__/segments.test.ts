import { describe, it, expect } from "vitest";
import { donorMatchesSegment, percentChange } from "../segments";
import type { DonorReportRow } from "../types";

function row(overrides: Partial<DonorReportRow> = {}): DonorReportRow {
  return {
    donorId: "d1",
    donorName: "Jane Donor",
    firstName: "Jane",
    lastName: "Donor",
    email: "jane@example.com",
    phone: null,
    companyName: null,
    address: null,
    city: null,
    state: null,
    postalCode: null,
    firstDonationDate: null,
    lastDonationDate: null,
    donationCount: 0,
    averageDonationCents: 0,
    largestDonationCents: 0,
    smallestDonationCents: 0,
    ytdGivingCents: 0,
    previousYearGivingCents: 0,
    periodGivingCents: 0,
    lifetimeGivingCents: 0,
    cardGivingCents: 0,
    achGivingCents: 0,
    externalGivingCents: 0,
    cashGivingCents: 0,
    checkGivingCents: 0,
    inKindValueCents: 0,
    refundedAmountCents: 0,
    returnedAmountCents: 0,
    isRecurringDonor: false,
    recurringAmountCents: 0,
    givingFrequency: null,
    givingPage: null,
    fund: null,
    purpose: null,
    attributedUserName: null,
    ...overrides,
  };
}

const now = new Date("2026-08-25T00:00:00Z");
const periodRange = { from: new Date("2026-01-01"), to: new Date("2026-08-25") };

describe("donorMatchesSegment", () => {
  it("LAPSED: classifies a donor whose last gift is older than the configured window", () => {
    const justUnder = row({ lastDonationDate: new Date("2026-06-01") }); // ~85 days before "now"
    const justOver = row({ lastDonationDate: new Date("2026-05-01") }); // ~116 days before "now"
    expect(donorMatchesSegment(justUnder, "LAPSED", { lapsedDays: 90 }, periodRange, now)).toBe(false);
    expect(donorMatchesSegment(justOver, "LAPSED", { lapsedDays: 90 }, periodRange, now)).toBe(true);
  });

  it("LAPSED: a donor with no donation history at all is never classified as lapsed (nothing to have lapsed from)", () => {
    expect(donorMatchesSegment(row({ lastDonationDate: null }), "LAPSED", { lapsedDays: 30 }, periodRange, now)).toBe(false);
  });

  it("MAJOR_DONOR: applies the threshold to whichever basis is selected, not always the same figure", () => {
    const donor = row({ periodGivingCents: 40000, ytdGivingCents: 60000, previousYearGivingCents: 120000, lifetimeGivingCents: 500000 });
    expect(donorMatchesSegment(donor, "MAJOR_DONOR", { majorDonorThresholdCents: 50000, majorDonorBasis: "PERIOD" }, periodRange, now)).toBe(false);
    expect(donorMatchesSegment(donor, "MAJOR_DONOR", { majorDonorThresholdCents: 50000, majorDonorBasis: "YTD" }, periodRange, now)).toBe(true);
    expect(donorMatchesSegment(donor, "MAJOR_DONOR", { majorDonorThresholdCents: 500000, majorDonorBasis: "LIFETIME" }, periodRange, now)).toBe(true);
  });

  it("NEW: a donor's first-ever gift falling inside the selected period", () => {
    expect(donorMatchesSegment(row({ firstDonationDate: new Date("2026-03-01") }), "NEW", undefined, periodRange, now)).toBe(true);
    expect(donorMatchesSegment(row({ firstDonationDate: new Date("2025-03-01") }), "NEW", undefined, periodRange, now)).toBe(false);
  });

  it("RETURNING: had history before the period AND gave again during it", () => {
    const returned = row({ firstDonationDate: new Date("2024-01-01"), periodGivingCents: 100 });
    const historyButNoNewGift = row({ firstDonationDate: new Date("2024-01-01"), periodGivingCents: 0 });
    expect(donorMatchesSegment(returned, "RETURNING", undefined, periodRange, now)).toBe(true);
    expect(donorMatchesSegment(historyButNoNewGift, "RETURNING", undefined, periodRange, now)).toBe(false);
  });

  it("EXTERNAL_ONLY: has offline giving and zero processed card/ACH", () => {
    expect(donorMatchesSegment(row({ cashGivingCents: 500 }), "EXTERNAL_ONLY", undefined, periodRange, now)).toBe(true);
    expect(donorMatchesSegment(row({ cashGivingCents: 500, cardGivingCents: 100 }), "EXTERNAL_ONLY", undefined, periodRange, now)).toBe(false);
  });

  it("NO_EMAIL / NO_ADDRESS", () => {
    expect(donorMatchesSegment(row({ email: null }), "NO_EMAIL", undefined, periodRange, now)).toBe(true);
    expect(donorMatchesSegment(row({ email: "a@b.com" }), "NO_EMAIL", undefined, periodRange, now)).toBe(false);
    expect(donorMatchesSegment(row({ address: null, city: null, state: null, postalCode: null }), "NO_ADDRESS", undefined, periodRange, now)).toBe(true);
    expect(donorMatchesSegment(row({ city: "Austin" }), "NO_ADDRESS", undefined, periodRange, now)).toBe(false);
  });
});

describe("percentChange", () => {
  it("computes a standard percentage change", () => {
    expect(percentChange(100, 150)).toBe(50);
    expect(percentChange(100, 50)).toBe(-50);
  });

  it("never divides by zero: 0 -> 0 is a defined 0% change, 0 -> nonzero is undefined (null), not Infinity", () => {
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(0, 500)).toBeNull();
  });
});
