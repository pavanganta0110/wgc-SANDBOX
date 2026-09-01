import { describe, it, expect } from "vitest";
import { mapProviderOrderStatusToWgc } from "../mapper";

describe("mapProviderOrderStatusToWgc", () => {
  it("maps every ProviderOrderStatus to a WGC status/fulfillmentStatus pair", () => {
    expect(mapProviderOrderStatusToWgc("PENDING")).toEqual({ status: "SUBMITTED", fulfillmentStatus: "PENDING" });
    expect(mapProviderOrderStatusToWgc("IN_FULFILLMENT")).toEqual({ status: "IN_FULFILLMENT", fulfillmentStatus: "IN_PROGRESS" });
    expect(mapProviderOrderStatusToWgc("SHIPPED")).toEqual({ status: "SHIPPED", fulfillmentStatus: "FULFILLED" });
    expect(mapProviderOrderStatusToWgc("DELIVERED")).toEqual({ status: "DELIVERED", fulfillmentStatus: "FULFILLED" });
    expect(mapProviderOrderStatusToWgc("CANCELLED")).toEqual({ status: "CANCELLED", fulfillmentStatus: "CANCELLED" });
    expect(mapProviderOrderStatusToWgc("FAILED")).toEqual({ status: "FAILED", fulfillmentStatus: "FAILED" });
  });

  it("never returns a raw Printful-shaped status — always WGC's own closed vocabulary", () => {
    const wgcStatuses = new Set([
      "DRAFT", "PAYMENT_PENDING", "PAID", "FULFILLMENT_PENDING", "SUBMITTED", "IN_FULFILLMENT",
      "PARTIALLY_FULFILLED", "SHIPPED", "DELIVERED", "CANCELLED", "FAILED", "REFUNDED",
    ]);
    const inputs: any[] = ["DRAFT", "PENDING", "IN_FULFILLMENT", "PARTIALLY_FULFILLED", "FULFILLED", "SHIPPED", "DELIVERED", "CANCELLED", "FAILED"];
    for (const input of inputs) {
      const { status } = mapProviderOrderStatusToWgc(input);
      expect(wgcStatuses.has(status)).toBe(true);
    }
  });
});
