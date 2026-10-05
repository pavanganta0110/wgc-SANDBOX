import { describe, it, expect, vi, beforeEach } from "vitest";

let session: Record<string, unknown>;
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: async () => session }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const logFindFirst = vi.fn();
const registrationFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    orgEmailLog: { findFirst: (...a: unknown[]) => logFindFirst(...a) },
    eventRegistration: { findFirst: (...a: unknown[]) => registrationFindFirst(...a) },
  },
}));
const sendConfirmation = vi.fn();
const resendNotice = vi.fn();
vi.mock("@/lib/eventRegistration/eventEmails", () => ({
  sendRegistrationConfirmationEmail: (...a: unknown[]) => sendConfirmation(...a),
  resendEventNotice: (...a: unknown[]) => resendNotice(...a),
}));
vi.mock("@/lib/giving/generateReceipt", () => ({}));
vi.mock("@/lib/donations/sendExternalDonationReceiptEmail", () => ({}));
vi.mock("@/lib/donors/generateStatement", () => ({}));
vi.mock("@/lib/invoices/invoiceEmails", () => ({}));
vi.mock("@/lib/invoices/invoicePublicToken", () => ({}));
vi.mock("@/lib/subscriptions/setupLinkToken", () => ({}));
vi.mock("@/lib/email", () => ({ sendWgcEmail: vi.fn(), parseAdditionalRecipients: () => [] }));
const uploadImage = vi.fn();
vi.mock("@/lib/storage/logoStorage", () => ({ uploadPublicCampaignImage: (...a: unknown[]) => uploadImage(...a) }));

const resendReq = () => new Request("http://x", { method: "POST", body: "{}" });
const ctx = { params: Promise.resolve({ id: "log1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  session = { userId: "u1", email: "a@a.com", churchId: "churchA", rawRole: "owner", role: "owner", permissionsJson: null, authVersion: 1 };
});

describe("resending event emails from Email Logs", () => {
  async function post() {
    const { POST } = await import("@/app/api/merchant/email-logs/[id]/resend/route");
    return POST(resendReq(), ctx);
  }

  it("resends a confirmation after re-checking the registration belongs to this church", async () => {
    logFindFirst.mockResolvedValue({ category: "EVENT_CONFIRMATION", relatedEntityType: "EventRegistration", relatedEntityId: "r1", recipientEmail: "p@x.com" });
    registrationFindFirst.mockResolvedValue({ id: "r1" });
    sendConfirmation.mockResolvedValue(true);
    expect((await post()).status).toBe(200);
    expect(registrationFindFirst).toHaveBeenCalledWith({ where: { id: "r1", churchId: "churchA" }, select: { id: true } });
    expect(sendConfirmation).toHaveBeenCalledWith("r1", { force: true, resendByUserId: "u1" });
  });

  it("refuses another church's registration", async () => {
    logFindFirst.mockResolvedValue({ category: "EVENT_CONFIRMATION", relatedEntityType: "EventRegistration", relatedEntityId: "foreign", recipientEmail: "p@x.com" });
    registrationFindFirst.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(sendConfirmation).not.toHaveBeenCalled();
  });

  it("resends a reminder to the same address, scoped to the church", async () => {
    logFindFirst.mockResolvedValue({ category: "EVENT_REMINDER", relatedEntityType: "EventRegistration", relatedEntityId: "r1", recipientEmail: "kid@x.com", recipientName: "Kid Lee" });
    resendNotice.mockResolvedValue({ ok: true });
    expect((await post()).status).toBe(200);
    expect(resendNotice).toHaveBeenCalledWith({ churchId: "churchA", kind: "reminder", registrationId: "r1", to: "kid@x.com", recipientName: "Kid Lee", userId: "u1" });
  });

  it("explains that test emails can't be resent", async () => {
    logFindFirst.mockResolvedValue({ category: "EVENT_THANK_YOU", relatedEntityType: "Event", relatedEntityId: "e1", recipientEmail: "me@x.com" });
    const res = await post();
    expect(res.status).toBe(400);
    expect(resendNotice).not.toHaveBeenCalled();
  });
});

describe("event cover image upload", () => {
  const uploadReq = (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return new Request("http://x", { method: "POST", body: fd });
  };

  it("stores an image under the signed-in church's own folder", async () => {
    uploadImage.mockResolvedValue("https://cdn.example/cover.png");
    const { POST } = await import("@/app/api/merchant/events/image-upload/route");
    const res = await POST(uploadReq(new File([new Uint8Array(10)], "My Cover.png", { type: "image/png" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ imageUrl: "https://cdn.example/cover.png" });
    expect(uploadImage.mock.calls[0][0]).toMatch(/^churchA\/events\/\d+_My_Cover\.png$/);
  });

  it("rejects non-images and oversized files, and roles without event management", async () => {
    const { POST } = await import("@/app/api/merchant/events/image-upload/route");
    expect((await POST(uploadReq(new File(["x"], "a.html", { type: "text/html" })))).status).toBe(400);
    expect((await POST(uploadReq(new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" })))).status).toBe(400);
    expect(uploadImage).not.toHaveBeenCalled();
    session = { ...session, rawRole: "viewer", role: "viewer" };
    expect((await POST(uploadReq(new File([new Uint8Array(10)], "a.png", { type: "image/png" })))).status).toBe(403);
  });
});
