import { describe, it, expect } from "vitest";
import { computeRegistrationTotals, MIN_CHARGE_CENTS } from "@/lib/eventRegistration/pricing";

const event = { priceCents: 5000, priceMode: "PER_ATTENDEE", registrationFmvCents: null, allowOptionalDonation: false };
const addOns = [
  { id: "shirt", name: "T-shirt", priceCents: 2500, fmvCents: 2500, maxQuantity: 4, isActive: true },
  { id: "sponsor", name: "Sponsorship", priceCents: 10000, fmvCents: 2000, maxQuantity: 1, isActive: true },
  { id: "retired", name: "Retired", priceCents: 1000, fmvCents: null, maxQuantity: 1, isActive: false },
];

function price(over: Partial<Parameters<typeof computeRegistrationTotals>[0]> = {}) {
  return computeRegistrationTotals({ event, attendeeCount: 1, addOns, selections: [], donationCents: 0, ...over });
}

describe("free registration", () => {
  it("totals $0 and needs no payment", () => {
    const r = price({ event: { ...event, priceCents: 0 }, attendeeCount: 3 });
    expect(r.ok && r.totals.totalCents).toBe(0);
  });

  it("stays free even with several attendees", () => {
    const r = price({ event: { ...event, priceCents: 0 }, attendeeCount: 10 });
    expect(r.ok && r.totals.registrationAmountCents).toBe(0);
  });
});

describe("registration price", () => {
  it("multiplies by attendees when priced per attendee", () => {
    const r = price({ attendeeCount: 4 });
    expect(r.ok && r.totals.registrationAmountCents).toBe(20000);
  });

  it("charges once when priced per registration", () => {
    const r = price({ event: { ...event, priceMode: "PER_REGISTRATION" }, attendeeCount: 4 });
    expect(r.ok && r.totals.registrationAmountCents).toBe(5000);
  });

  it("requires at least one attendee", () => {
    expect(price({ attendeeCount: 0 }).ok).toBe(false);
  });
});

describe("paid add-ons", () => {
  it("adds quantity x price for each selected add-on", () => {
    const r = price({ attendeeCount: 2, selections: [{ addOnId: "shirt", quantity: 3 }, { addOnId: "sponsor", quantity: 1 }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totals.addOnsAmountCents).toBe(7500 + 10000);
      expect(r.totals.totalCents).toBe(10000 + 17500);
      expect(r.totals.addOnLines.map((l) => l.lineTotalCents)).toEqual([7500, 10000]);
    }
  });

  it("rejects an add-on that was deactivated or never existed", () => {
    expect(price({ selections: [{ addOnId: "retired", quantity: 1 }] }).ok).toBe(false);
    expect(price({ selections: [{ addOnId: "nope", quantity: 1 }] }).ok).toBe(false);
  });

  it("rejects quantities over the max, below one, or fractional", () => {
    expect(price({ selections: [{ addOnId: "sponsor", quantity: 2 }] }).ok).toBe(false);
    expect(price({ selections: [{ addOnId: "shirt", quantity: 0 }] }).ok).toBe(false);
    expect(price({ selections: [{ addOnId: "shirt", quantity: 1.5 }] }).ok).toBe(false);
  });

  it("rejects the same add-on selected twice", () => {
    expect(price({ selections: [{ addOnId: "shirt", quantity: 1 }, { addOnId: "shirt", quantity: 1 }] }).ok).toBe(false);
  });

  it("can make a free event paid", () => {
    const r = price({ event: { ...event, priceCents: 0 }, selections: [{ addOnId: "shirt", quantity: 1 }] });
    expect(r.ok && r.totals.totalCents).toBe(2500);
  });
});

describe("optional donation", () => {
  it("adds a donation only when the event allows it", () => {
    expect(price({ donationCents: 2500 }).ok).toBe(false);
    const r = price({ event: { ...event, allowOptionalDonation: true }, donationCents: 2500 });
    expect(r.ok && r.totals.totalCents).toBe(7500);
    expect(r.ok && r.totals.donationAmountCents).toBe(2500);
  });

  it("rejects negative or fractional donations", () => {
    const e = { ...event, allowOptionalDonation: true };
    expect(price({ event: e, donationCents: -100 }).ok).toBe(false);
    expect(price({ event: e, donationCents: 10.5 }).ok).toBe(false);
  });

  it("makes a free event payable when only a donation is given", () => {
    const r = price({ event: { ...event, priceCents: 0, allowOptionalDonation: true }, donationCents: 1000 });
    expect(r.ok && r.totals.totalCents).toBe(1000);
  });
});

describe("tax receipt split (quid pro quo)", () => {
  it("treats the whole registration price as benefit when no value was set", () => {
    const r = price();
    expect(r.ok && r.totals.benefitValueCents).toBe(5000);
    expect(r.ok && r.totals.contributionCents).toBe(0);
  });

  it("records only the amount above the stated value as a contribution; donations and sponsorship excess are contribution", () => {
    const r = price({
      event: { ...event, registrationFmvCents: 3000, allowOptionalDonation: true },
      attendeeCount: 2,
      selections: [{ addOnId: "sponsor", quantity: 1 }],
      donationCents: 500,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totals.totalCents).toBe(10000 + 10000 + 500);
      expect(r.totals.benefitValueCents).toBe(6000 + 2000);
      expect(r.totals.contributionCents).toBe(20500 - 8000);
    }
  });

  it("never lets the stated value exceed the price", () => {
    const r = price({ event: { ...event, registrationFmvCents: 999999 } });
    expect(r.ok && r.totals.benefitValueCents).toBe(5000);
  });
});

describe("limits", () => {
  it("rejects a positive total below the $1.00 minimum charge", () => {
    const r = price({ event: { ...event, priceCents: 50 } });
    expect(MIN_CHARGE_CENTS).toBe(100);
    expect(r.ok).toBe(false);
  });

  it("rejects an absurdly large total", () => {
    expect(price({ event: { ...event, priceCents: 90_000_000 }, attendeeCount: 5 }).ok).toBe(false);
  });
});
