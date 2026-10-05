import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const mockPrisma = {
  systemIncident: { findUnique: vi.fn(), findMany: vi.fn() },
  systemAlert: { create: vi.fn(), findFirst: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockSendWgcEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendWgcEmail: (...args: unknown[]) => mockSendWgcEmail(...args) }));

const mockGetAlertEmailRecipient = vi.fn();
const mockGetAlertSmsRecipient = vi.fn();
const mockIsSmsAlertingConfigured = vi.fn();
vi.mock("../alertRecipients", () => ({
  getAlertEmailRecipient: () => mockGetAlertEmailRecipient(),
  getAlertSmsRecipient: () => mockGetAlertSmsRecipient(),
  isSmsAlertingConfigured: () => mockIsSmsAlertingConfigured(),
}));

async function loadModule() {
  vi.resetModules();
  return import("../alertEngine");
}

const BASE_INCIDENT = {
  id: "inc_1",
  title: "Finix Payment Processing Degraded",
  service: "Finix",
  severity: "CRITICAL",
  status: "OPEN",
  occurrenceCount: 12,
  affectedMerchantCount: 3,
  startedAt: new Date(Date.now() - 10 * 60 * 1000),
  lastSeenAt: new Date(),
  resolvedAt: null as Date | null,
};

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.systemAlert.create.mockResolvedValue({ id: "alert_1" });
  mockGetAlertEmailRecipient.mockReturnValue("ops@wgcpayments.com");
  mockGetAlertSmsRecipient.mockReturnValue("+15555550100");
  mockIsSmsAlertingConfigured.mockReturnValue(true);
  mockSendWgcEmail.mockResolvedValue({ success: true, data: { id: "resend_msg_1" } });
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token_test";
  process.env.WGC_ALERT_SMS_FROM_NUMBER = "+15555550199";
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sid: "SM_test_1" }) }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("notifyIncidentChange — channel planning by severity", () => {
  it("CRITICAL sends dashboard + email + SMS", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue(BASE_INCIDENT);
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "INITIAL");

    const channels = mockPrisma.systemAlert.create.mock.calls.map((c) => c[0].data.channel);
    expect(channels).toEqual(expect.arrayContaining(["DASHBOARD", "EMAIL", "SMS"]));
    expect(mockSendWgcEmail).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("ERROR sends dashboard + email, never SMS", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ ...BASE_INCIDENT, severity: "ERROR" });
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "INITIAL");

    const channels = mockPrisma.systemAlert.create.mock.calls.map((c) => c[0].data.channel);
    expect(channels).toEqual(expect.arrayContaining(["DASHBOARD", "EMAIL"]));
    expect(channels).not.toContain("SMS");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("WARNING sends dashboard + email per the default warning-email policy, never SMS", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ ...BASE_INCIDENT, severity: "WARNING" });
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "INITIAL");

    const channels = mockPrisma.systemAlert.create.mock.calls.map((c) => c[0].data.channel);
    expect(channels).toContain("EMAIL");
    expect(channels).not.toContain("SMS");
  });

  it("INFO only ever reaches dashboard/history — no email, no SMS", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ ...BASE_INCIDENT, severity: "INFO" });
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "INITIAL");

    const channels = mockPrisma.systemAlert.create.mock.calls.map((c) => c[0].data.channel);
    expect(channels).toEqual(["DASHBOARD"]);
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("notifyIncidentChange — channel independence", () => {
  it("never emails about a Resend incident (that channel is what's broken) but still dashboards/SMS it", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ ...BASE_INCIDENT, service: "Resend" });
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "INITIAL");

    expect(mockSendWgcEmail).not.toHaveBeenCalled();
    const channels = mockPrisma.systemAlert.create.mock.calls.map((c) => c[0].data.channel);
    expect(channels).toContain("DASHBOARD");
    expect(channels).toContain("SMS");
    expect(channels).not.toContain("EMAIL");
  });

  it("never SMSes about a Twilio incident but still dashboards/emails it", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ ...BASE_INCIDENT, service: "Twilio" });
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "INITIAL");

    expect(global.fetch).not.toHaveBeenCalled();
    const channels = mockPrisma.systemAlert.create.mock.calls.map((c) => c[0].data.channel);
    expect(channels).toContain("DASHBOARD");
    expect(channels).toContain("EMAIL");
    expect(channels).not.toContain("SMS");
  });
});

describe("notifyIncidentChange — delivery-failure isolation", () => {
  it("a Twilio/SMS send failure does not block the email from being sent and recorded SENT", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Twilio is down")) as unknown as typeof fetch;
    mockPrisma.systemIncident.findUnique.mockResolvedValue(BASE_INCIDENT);
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "INITIAL");

    const emailCall = mockPrisma.systemAlert.create.mock.calls.find((c) => c[0].data.channel === "EMAIL");
    const smsCall = mockPrisma.systemAlert.create.mock.calls.find((c) => c[0].data.channel === "SMS");
    expect(emailCall?.[0].data.deliveryStatus).toBe("SENT");
    expect(smsCall?.[0].data.deliveryStatus).toBe("FAILED");
  });

  it("a Resend/email send failure does not block the SMS from being sent and recorded SENT", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: false, error: "Resend API error" });
    mockPrisma.systemIncident.findUnique.mockResolvedValue(BASE_INCIDENT);
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "INITIAL");

    const emailCall = mockPrisma.systemAlert.create.mock.calls.find((c) => c[0].data.channel === "EMAIL");
    const smsCall = mockPrisma.systemAlert.create.mock.calls.find((c) => c[0].data.channel === "SMS");
    expect(emailCall?.[0].data.deliveryStatus).toBe("FAILED");
    expect(smsCall?.[0].data.deliveryStatus).toBe("SENT");
  });

  it("both channels failing at once never throws — the incident still exists, both failures are recorded", async () => {
    mockSendWgcEmail.mockRejectedValue(new Error("email exploded"));
    global.fetch = vi.fn().mockRejectedValue(new Error("sms exploded")) as unknown as typeof fetch;
    mockPrisma.systemIncident.findUnique.mockResolvedValue(BASE_INCIDENT);
    const { notifyIncidentChange } = await loadModule();

    await expect(notifyIncidentChange("inc_1", "INITIAL")).resolves.toBeUndefined();

    const emailCall = mockPrisma.systemAlert.create.mock.calls.find((c) => c[0].data.channel === "EMAIL");
    const smsCall = mockPrisma.systemAlert.create.mock.calls.find((c) => c[0].data.channel === "SMS");
    expect(emailCall?.[0].data.deliveryStatus).toBe("FAILED");
    expect(smsCall?.[0].data.deliveryStatus).toBe("FAILED");
  });

  it("SMS is recorded FAILED (never attempted) when SMS alerting isn't configured yet, and never throws", async () => {
    mockIsSmsAlertingConfigured.mockReturnValue(false);
    mockPrisma.systemIncident.findUnique.mockResolvedValue(BASE_INCIDENT);
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "INITIAL");

    expect(global.fetch).not.toHaveBeenCalled();
    const smsCall = mockPrisma.systemAlert.create.mock.calls.find((c) => c[0].data.channel === "SMS");
    expect(smsCall?.[0].data.deliveryStatus).toBe("FAILED");
  });
});

describe("notifyIncidentChange — recovery notifications", () => {
  it("sends a recovery notification for an incident that previously generated a real alert", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ ...BASE_INCIDENT, resolvedAt: new Date() });
    mockPrisma.systemAlert.findFirst.mockResolvedValue({ id: "prior_alert" });
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "RECOVERY");

    expect(mockSendWgcEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockPrisma.systemAlert.create.mock.calls.find((c) => c[0].data.channel === "EMAIL");
    expect(emailCall?.[0].data.notificationType).toBe("RECOVERY");
  });

  it("never sends a recovery notification for an incident that never actually alerted anyone", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ ...BASE_INCIDENT, resolvedAt: new Date() });
    mockPrisma.systemAlert.findFirst.mockResolvedValue(null);
    const { notifyIncidentChange } = await loadModule();
    await notifyIncidentChange("inc_1", "RECOVERY");

    expect(mockPrisma.systemAlert.create).not.toHaveBeenCalled();
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
  });

  it("never throws when the incident lookup itself fails", async () => {
    mockPrisma.systemIncident.findUnique.mockRejectedValue(new Error("db down"));
    const { notifyIncidentChange } = await loadModule();
    await expect(notifyIncidentChange("inc_1", "INITIAL")).resolves.toBeUndefined();
  });
});

describe("sendDueReminders", () => {
  it("skips an open incident that has never been alerted at all (not a reminder's job)", async () => {
    mockPrisma.systemIncident.findMany.mockResolvedValue([{ ...BASE_INCIDENT }]);
    mockPrisma.systemAlert.findFirst.mockResolvedValue(null);
    const { sendDueReminders } = await loadModule();
    await sendDueReminders();
    expect(mockPrisma.systemAlert.create).not.toHaveBeenCalled();
  });

  it("skips a CRITICAL incident whose last alert was sent less than 2 hours ago", async () => {
    mockPrisma.systemIncident.findMany.mockResolvedValue([{ ...BASE_INCIDENT }]);
    mockPrisma.systemAlert.findFirst.mockResolvedValue({ sentAt: new Date(Date.now() - 30 * 60 * 1000) });
    const { sendDueReminders } = await loadModule();
    await sendDueReminders();
    expect(mockPrisma.systemAlert.create).not.toHaveBeenCalled();
  });

  it("sends a reminder for a CRITICAL incident once 2+ hours have passed since the last alert", async () => {
    mockPrisma.systemIncident.findMany.mockResolvedValue([{ ...BASE_INCIDENT }]);
    mockPrisma.systemAlert.findFirst.mockResolvedValue({ sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
    const { sendDueReminders } = await loadModule();
    await sendDueReminders();
    const emailCall = mockPrisma.systemAlert.create.mock.calls.find((c) => c[0].data.channel === "EMAIL");
    expect(emailCall?.[0].data.notificationType).toBe("REMINDER");
  });

  it("uses the longer 6-hour interval for a non-critical (ERROR) incident", async () => {
    mockPrisma.systemIncident.findMany.mockResolvedValue([{ ...BASE_INCIDENT, severity: "ERROR" }]);
    mockPrisma.systemAlert.findFirst.mockResolvedValue({ sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000) }); // 3h — under the 6h ERROR interval
    const { sendDueReminders } = await loadModule();
    await sendDueReminders();
    expect(mockPrisma.systemAlert.create).not.toHaveBeenCalled();
  });

  it("one incident's lookup failure never blocks another incident's due reminder", async () => {
    mockPrisma.systemIncident.findMany.mockResolvedValue([
      { ...BASE_INCIDENT, id: "inc_broken" },
      { ...BASE_INCIDENT, id: "inc_ok" },
    ]);
    mockPrisma.systemAlert.findFirst.mockImplementation(({ where }: { where: { incidentId: string } }) =>
      where.incidentId === "inc_broken" ? Promise.reject(new Error("db blip")) : Promise.resolve({ sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000) })
    );
    const { sendDueReminders } = await loadModule();
    await expect(sendDueReminders()).resolves.toBeUndefined();
    const alertedIncidentIds = mockPrisma.systemAlert.create.mock.calls.map((c) => c[0].data.incidentId);
    expect(alertedIncidentIds).toContain("inc_ok");
    expect(alertedIncidentIds).not.toContain("inc_broken");
  });
});

describe("anti-recursion invariant", () => {
  it("alertEngine.ts never imports recordHealthEvent — structurally cannot call it, whatever its own doc comment discusses in prose", () => {
    const source = readFileSync(join(__dirname, "..", "alertEngine.ts"), "utf-8");
    expect(source).not.toMatch(/import\s*\{[^}]*\brecordHealthEvent\b/);
  });
});
