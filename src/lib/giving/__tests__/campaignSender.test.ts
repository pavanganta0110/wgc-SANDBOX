import { describe, it, expect, vi, beforeEach } from "vitest";

const campaignFindFirst = vi.fn();
const churchFindUnique = vi.fn();
const recipientFindMany = vi.fn();
const recipientUpdate = vi.fn();
const recipientCount = vi.fn();
const campaignUpdate = vi.fn();
const isOptedOut = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    givingCampaign: { findFirst: (...a: unknown[]) => campaignFindFirst(...a), update: (...a: unknown[]) => campaignUpdate(...a) },
    church: { findUnique: (...a: unknown[]) => churchFindUnique(...a) },
    givingCampaignRecipient: {
      findMany: (...a: unknown[]) => recipientFindMany(...a),
      update: (...a: unknown[]) => recipientUpdate(...a),
      count: (...a: unknown[]) => recipientCount(...a),
    },
  },
}));
vi.mock("@/lib/giving/emailOptOut", () => ({ isEmailOptedOut: (...a: unknown[]) => isOptedOut(...a) }));
vi.mock("@/lib/email", () => ({ sendWgcEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/lib/sms/sendText", () => ({ sendText: vi.fn() }));

import { sendCampaignChunk, unsubscribeFooterHtml } from "@/lib/giving/campaignSender";

const campaign = { id: "c1", churchId: "churchA", channel: "EMAIL", status: "DRAFT", emailSubject: "Update for {{firstName}}", emailBodyTemplate: "Hi {{firstName}}, give: {{link}}", textBodyTemplate: null };
const recipient = (over: Record<string, unknown> = {}) => ({ id: "r1", campaignId: "c1", donorId: "d1", recipientEmail: "pat@example.com", recipientName: "Pat Lee", trackingToken: "abc123def456abc123def456", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  campaignFindFirst.mockResolvedValue(campaign);
  churchFindUnique.mockResolvedValue({ name: "Riverbend School", logoUrl: null, primaryColor: "#123456", statementSenderName: null });
  recipientFindMany.mockResolvedValue([recipient()]);
  recipientUpdate.mockResolvedValue({});
  recipientCount.mockResolvedValue(0);
  campaignUpdate.mockImplementation(async ({ data }: { data: object }) => ({ ...campaign, ...data }));
  isOptedOut.mockResolvedValue(false);
  sendEmail.mockResolvedValue({ success: true });
});

describe("sendCampaignChunk", () => {
  it("adds an unsubscribe link and one-click List-Unsubscribe headers to every email", async () => {
    await sendCampaignChunk({ campaignId: "c1", churchId: "churchA", actorUserId: "u1" });
    const sent = sendEmail.mock.calls[0][0];
    expect(sent.bodyHtml).toContain("/unsubscribe/abc123def456abc123def456");
    expect(sent.bodyHtml).toContain("Riverbend School");
    expect(sent.headers["List-Unsubscribe"]).toContain("/api/unsubscribe/abc123def456abc123def456");
    expect(sent.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.subject).toBe("Update for Pat");
  });

  it("skips anyone who has unsubscribed — marked Skipped, never emailed", async () => {
    isOptedOut.mockResolvedValue(true);
    await sendCampaignChunk({ campaignId: "c1", churchId: "churchA", actorUserId: null });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recipientUpdate).toHaveBeenCalledWith({ where: { id: "r1" }, data: { sendStatus: "SKIPPED", sendError: "Unsubscribed" } });
    expect(isOptedOut).toHaveBeenCalledWith("churchA", "pat@example.com");
  });

  it("marks sent and failed sends and finishes the campaign when nobody is left pending", async () => {
    sendEmail.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: "bounced" });
    recipientFindMany.mockResolvedValue([recipient(), recipient({ id: "r2", recipientEmail: "x@y.com", trackingToken: "ff00ff00ff00ff00ff00ff00" })]);
    const r = await sendCampaignChunk({ campaignId: "c1", churchId: "churchA", actorUserId: null });
    expect(r).toMatchObject({ done: true, sent: 1, failed: 1, processed: 2 });
    expect(campaignUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: expect.objectContaining({ status: "SENT" }) });
  });

  it("is scoped to the church and returns null for a campaign that isn't theirs", async () => {
    campaignFindFirst.mockResolvedValue(null);
    expect(await sendCampaignChunk({ campaignId: "c1", churchId: "churchB", actorUserId: null })).toBeNull();
    expect(campaignFindFirst).toHaveBeenCalledWith({ where: { id: "c1", churchId: "churchB" } });
  });

  it("escapes the organization name in the footer", () => {
    expect(unsubscribeFooterHtml('<b>Bad</b> & Co', "https://x.test/u/1")).not.toContain("<b>Bad</b>");
  });
});
