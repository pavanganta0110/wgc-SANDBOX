import { describe, it, expect } from "vitest";
import { exceedsHistoricalAccountLimit, PAYOUT_ACCOUNT_MAX_STORED_HISTORICAL_ACCOUNTS } from "@/lib/organization/payoutAccountLimits";

describe("exceedsHistoricalAccountLimit", () => {
  it("is false at or under the configured threshold", () => {
    expect(exceedsHistoricalAccountLimit(0)).toBe(false);
    expect(exceedsHistoricalAccountLimit(PAYOUT_ACCOUNT_MAX_STORED_HISTORICAL_ACCOUNTS)).toBe(false);
  });

  it("is true once the count exceeds the configured threshold — this is informational only and must never trigger deletion", () => {
    expect(exceedsHistoricalAccountLimit(PAYOUT_ACCOUNT_MAX_STORED_HISTORICAL_ACCOUNTS + 1)).toBe(true);
  });
});
