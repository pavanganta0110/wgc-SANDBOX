import { describe, it, expect, vi, beforeEach } from "vitest";

const recipientFindUnique = vi.fn();
const churchFindUnique = vi.fn();
const recordOptOut = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    givingCampaignRecipient: { findUnique: (...a: unknown[]) => recipientFindUnique(...a) },
    church: { findUnique: (...a: unknown[]) => churchFindUnique(...a) },
  },
}));
vi.mock("@/lib/giving/emailOptOut", () => ({ recordEmailOptOut: (...a: unknown[]) => recordOptOut(...a) }));
vi.mock("@/lib/giving/donationRateLimit", () => ({ checkDonationRateLimit: () => true }));

import { POST, GET } from "@/app/api/unsubscribe/[token]/route";

const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.clearAllMocks();
  recipientFindUnique.mockResolvedValue({ churchId: "churchA", campaignId: "c1", recipientEmail: "pat@example.com" });
  churchFindUnique.mockResolvedValue({ name: "Riverbend School" });
  recordOptOut.mockResolvedValue(undefined);
});

describe("POST /api/unsubscribe/[token]", () => {
  it("opts the address out of that recipient's own church only", async () => {
    const res = await POST(new Request("http://x", { method: "POST" }), ctx(TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, organizationName: "Riverbend School" });
    expect(recordOptOut).toHaveBeenCalledWith("churchA", "pat@example.com", "c1");
  });

  it("404s for an unknown token or a malformed one, without recording anything", async () => {
    recipientFindUnique.mockResolvedValue(null);
    expect((await POST(new Request("http://x", { method: "POST" }), ctx(TOKEN))).status).toBe(404);
    expect((await POST(new Request("http://x", { method: "POST" }), ctx("not a token!"))).status).toBe(404);
    expect(recordOptOut).not.toHaveBeenCalled();
  });
});

describe("GET /api/unsubscribe/[token]", () => {
  it("only redirects to the confirmation page — opening the link (or a mail scanner prefetching it) never unsubscribes anyone", async () => {
    const res = await GET(new Request("http://localhost/api/unsubscribe/" + TOKEN), ctx(TOKEN));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toContain(`/unsubscribe/${TOKEN}`);
    expect(recordOptOut).not.toHaveBeenCalled();
  });
});
