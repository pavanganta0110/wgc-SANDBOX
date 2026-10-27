import { describe, expect, it } from "vitest";
import { matchesCampaignExportFilter, parseCampaignExportFilter } from "@/lib/giving-campaigns-export";

const d = new Date("2026-10-26");
const paid = { sendStatus: "SENT", clickedAt: d, paidAt: d };
const clickedOnly = { sendStatus: "SENT", clickedAt: d, paidAt: null };
const sentOnly = { sendStatus: "SENT", clickedAt: null, paidAt: null };
const failed = { sendStatus: "FAILED", clickedAt: null, paidAt: null };
const skipped = { sendStatus: "SKIPPED", clickedAt: null, paidAt: null };

describe("campaign export filters", () => {
  it("paid only includes recipients who paid", () => {
    const rows = [paid, clickedOnly, sentOnly, failed, skipped].filter((r) => matchesCampaignExportFilter(r, "paid"));
    expect(rows).toEqual([paid]);
  });
  it("clicked-not-paid excludes paid and unclicked", () => {
    expect([paid, clickedOnly, sentOnly].filter((r) => matchesCampaignExportFilter(r, "clicked-not-paid"))).toEqual([clickedOnly]);
  });
  it("not-paid is sent-but-unpaid only (not failed/unsubscribed)", () => {
    expect([paid, clickedOnly, sentOnly, failed, skipped].filter((r) => matchesCampaignExportFilter(r, "not-paid"))).toEqual([clickedOnly, sentOnly]);
  });
  it("failed and unsubscribed map to their send status", () => {
    expect(matchesCampaignExportFilter(failed, "failed")).toBe(true);
    expect(matchesCampaignExportFilter(skipped, "unsubscribed")).toBe(true);
    expect(matchesCampaignExportFilter(paid, "failed")).toBe(false);
  });
  it("unknown filter falls back to everyone", () => {
    expect(parseCampaignExportFilter("bogus")).toBe("all");
    expect(parseCampaignExportFilter(null)).toBe("all");
  });
});
