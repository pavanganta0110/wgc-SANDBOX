import { describe, it, expect } from "vitest";
import { scoreDonorMatch, findBestScoredMatch, type MatchCandidateDonor } from "@/lib/donors/donorMatchConfidence";

function donor(overrides: Partial<MatchCandidateDonor> = {}): MatchCandidateDonor {
  return {
    id: "existing-1",
    name: "John Smith",
    email: "john@example.com",
    normalizedEmail: "john@example.com",
    phone: "(555) 123-4567",
    normalizedPhone: "+15551234567",
    addressLine1: "123 Main St",
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    finixIdentityId: null,
    ...overrides,
  };
}

describe("scoreDonorMatch — MEDIUM confidence", () => {
  it("similar name + same address = MEDIUM", () => {
    const result = scoreDonorMatch(donor(), {
      name: "Jon Smith",
      addressLine1: "123 Main St",
      city: "Austin",
      postalCode: "78701",
    });
    expect(result.confidence).toBe("MEDIUM");
    expect(result.matchedFields).toContain("name");
    expect(result.matchedFields).toContain("address");
  });

  it("same name + partial (last 4) phone match = MEDIUM", () => {
    const result = scoreDonorMatch(donor(), {
      name: "John Smith",
      phone: "999-999-4567",
    });
    expect(result.confidence).toBe("MEDIUM");
    expect(result.matchedFields.some((f) => f.startsWith("phone"))).toBe(true);
  });

  it("same name + similar email (different domain, same local part) = MEDIUM", () => {
    const result = scoreDonorMatch(donor(), {
      name: "John Smith",
      email: "john@gmail.com",
    });
    expect(result.confidence).toBe("MEDIUM");
    expect(result.matchedFields.some((f) => f.startsWith("email"))).toBe(true);
  });
});

describe("scoreDonorMatch — LOW confidence never auto-merges", () => {
  it("name match alone, nothing corroborating = LOW, not MEDIUM", () => {
    const result = scoreDonorMatch(donor(), { name: "John Smith" });
    expect(result.confidence).toBe("LOW");
  });

  it("common name with a completely different address/phone/email stays LOW", () => {
    const result = scoreDonorMatch(donor(), {
      name: "John Smith",
      addressLine1: "999 Other Ave",
      city: "Denver",
      postalCode: "80202",
      phone: "111-222-3333",
      email: "totallydifferent@nowhere.com",
    });
    expect(result.confidence).toBe("LOW");
    expect(result.conflictingFields).toContain("address");
  });
});

describe("scoreDonorMatch — no match", () => {
  it("different name and nothing else in common = NONE", () => {
    const result = scoreDonorMatch(donor(), {
      name: "Completely Different Person",
      addressLine1: "999 Other Ave",
    });
    expect(result.confidence).toBe("NONE");
  });
});

describe("findBestScoredMatch", () => {
  it("picks the highest-scoring MEDIUM candidate and ignores LOW/NONE ones", () => {
    const candidates = [
      donor({ id: "low-match", addressLine1: "999 Other Ave", city: "Denver", postalCode: "80202", normalizedPhone: null, normalizedEmail: null }),
      donor({ id: "medium-match", addressLine1: "123 Main St", city: "Austin", postalCode: "78701" }),
      donor({ id: "no-match", name: "Totally Different", normalizedEmail: null, normalizedPhone: null, addressLine1: null }),
    ];
    const best = findBestScoredMatch(candidates, {
      name: "Jon Smith",
      addressLine1: "123 Main St",
      city: "Austin",
      postalCode: "78701",
    });
    expect(best?.donor.id).toBe("medium-match");
    expect(best?.match.confidence).toBe("MEDIUM");
  });

  it("returns null when no candidate reaches MEDIUM", () => {
    const candidates = [donor({ name: "Totally Different Name", addressLine1: null, normalizedPhone: null, normalizedEmail: null })];
    const best = findBestScoredMatch(candidates, { name: "John Smith" });
    expect(best).toBeNull();
  });
});
