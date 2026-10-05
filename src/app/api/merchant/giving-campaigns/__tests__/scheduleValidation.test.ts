import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/donors/donorPermissions", () => ({ getDonorPermissions: () => ({ canView: true, canSendStatements: true }) }));
vi.mock("@/lib/auth/permissions", () => ({ hasPermission: () => true }));
vi.mock("@/lib/giving/campaignTemplate", () => ({ generateCampaignTrackingToken: () => "tok" }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sms/sendText", () => ({ isSmsConfigured: () => true }));
vi.mock("@/lib/billing/smsAddonSubscriptionService", () => ({ isSmsAddonActive: vi.fn().mockResolvedValue(true) }));
const resolveAudience = vi.fn();
vi.mock("@/lib/giving/campaignAudience", async (orig) => ({
  ...(await orig<typeof import("@/lib/giving/campaignAudience")>()),
  resolveCampaignAudience: (...a: unknown[]) => resolveAudience(...a),
}));
const linkFindFirst = vi.fn();
const campaignCreate = vi.fn();
const recipientCreateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    givingLink: { findFirst: (...a: unknown[]) => linkFindFirst(...a) },
    givingCampaign: { create: (...a: unknown[]) => campaignCreate(...a) },
    givingCampaignRecipient: { createMany: (...a: unknown[]) => recipientCreateMany(...a) },
  },
}));

import { POST } from "@/app/api/merchant/giving-campaigns/route";

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const body = (over: Record<string, unknown> = {}) => ({
  name: "Capital update", givingLinkId: "link1", channel: "EMAIL", emailSubject: "Update", emailBodyTemplate: "Hi {{firstName}} {{link}}",
  audience: { source: "ALL_DONORS" }, schedule: { repeat: "MONTHLY", startsOn: future(2) }, ...over,
});
const post = (b: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(b), headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ churchId: "churchA", userId: "u1", email: "a@a.com", rawRole: "owner" });
  linkFindFirst.mockResolvedValue({ id: "link1" });
  campaignCreate.mockResolvedValue({ id: "series1" });
  resolveAudience.mockResolvedValue({ ok: true, recipients: [{ donorId: "d1", email: "a@x.com", phone: null, name: "A" }] });
});

describe("creating a repeating campaign", () => {
  it("saves a SCHEDULED series with the audience RULE (not a recipient list) and sends nothing now", async () => {
    const res = await post(body());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ scheduled: true, currentAudienceCount: 1 });
    const data = campaignCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ churchId: "churchA", status: "SCHEDULED", repeatInterval: "MONTHLY", audienceJson: { source: "ALL_DONORS" } });
    expect(data.nextRunAt).toBeInstanceOf(Date);
    expect(recipientCreateMany).not.toHaveBeenCalled();
  });

  it("allows scheduling before anyone matches yet (a future month may have recipients)", async () => {
    resolveAudience.mockResolvedValue({ ok: true, recipients: [] });
    expect((await post(body())).status).toBe(201);
  });

  it("rejects text campaigns, hand-picked donor lists, past dates and bad end dates", async () => {
    expect((await post(body({ channel: "TEXT", textBodyTemplate: "hi" }))).status).toBe(400);
    expect((await post(body({ audience: { source: "SELECTED" }, donorIds: ["d1"] }))).status).toBe(400);
    expect((await post(body({ schedule: { repeat: "MONTHLY", startsOn: "2020-01-01" } }))).status).toBe(400);
    expect((await post(body({ schedule: { repeat: "MONTHLY", startsOn: "garbage" } }))).status).toBe(400);
    expect((await post(body({ schedule: { repeat: "MONTHLY", startsOn: future(10), endsOn: future(3) } }))).status).toBe(400);
    expect((await post(body({ schedule: { repeat: "WEEKLY", startsOn: future(2) } }))).status).toBe(400);
    expect(campaignCreate).not.toHaveBeenCalled();
  });

  it("without a schedule it still sends once as before", async () => {
    campaignCreate.mockResolvedValue({ id: "once1" });
    const res = await post(body({ schedule: undefined }));
    expect(res.status).toBe(201);
    expect((await res.json()).scheduled).toBeUndefined();
    expect(recipientCreateMany).toHaveBeenCalledTimes(1);
  });
});
