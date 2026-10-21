import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

/**
 * Covers the "Update Data" gap-fix: Finix's real UPDATE_REQUESTED outcomes
 * for a merchant are often field corrections (DBA, ownership/business
 * type, MCC, email), not document uploads — this route previously required
 * a file unconditionally, so a merchant asked only for a field correction
 * had no way to submit anything (2026-09-04 finding). These tests prove
 * the field-only path, the file-only path (preserving prior behavior), and
 * both together each work, and that a single verification trigger fires
 * regardless of which path(s) ran.
 */

const mockCreateFileResource = vi.fn();
const mockUploadFileContent = vi.fn();
const mockCreateVerification = vi.fn();
const mockUpdateIdentity = vi.fn();
const mockCreatePaymentInstrument = vi.fn();
vi.mock("@/lib/finix/client", () => ({
  finixClient: {
    createPaymentInstrument: (...a: unknown[]) => mockCreatePaymentInstrument(...a),
    createFileResource: (...a: unknown[]) => mockCreateFileResource(...a),
    uploadFileContent: (...a: unknown[]) => mockUploadFileContent(...a),
    createVerification: (...a: unknown[]) => mockCreateVerification(...a),
    updateIdentity: (...a: unknown[]) => mockUpdateIdentity(...a),
  },
}));

const mockSendWgcEmail = vi.fn().mockResolvedValue({ success: true, data: {} });
const mockSendWgcAdminEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendWgcEmail: (...a: unknown[]) => mockSendWgcEmail(...a),
  sendWgcAdminEmail: (...a: unknown[]) => mockSendWgcAdminEmail(...a),
}));

const APP_ROW = {
  id: "app-1",
  contactEmail: "contact@example.com",
  organizationName: "Lighthouse Baptist Church",
  finixMerchantId: "MU123",
  finixIdentityId: "ID123",
};

const mockPrisma = {
  onboardingApplication: {
    findFirst: vi.fn().mockResolvedValue(APP_ROW),
    update: vi.fn().mockResolvedValue({}),
  },
  merchantDocument: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("../route");
}

const RAW_TOKEN = "raw-token-value";
const TOKEN_HASH = crypto.createHash("sha256").update(RAW_TOKEN).digest("hex");

function makeFormData(fields: Record<string, string | File>) {
  const fd = new FormData();
  fd.append("token", RAW_TOKEN);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

function postReq(fields: Record<string, string | File>) {
  return new Request("http://x/api/onboarding/upload", { method: "POST", body: makeFormData(fields) });
}

function pdfFile(name = "doc.pdf") {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.onboardingApplication.findFirst.mockResolvedValue({ ...APP_ROW });
  mockCreateFileResource.mockResolvedValue({ id: "FI123" });
  mockCreateVerification.mockResolvedValue({ id: "VI123" });
  mockUpdateIdentity.mockResolvedValue({ id: "ID123" });
  mockCreatePaymentInstrument.mockResolvedValue({ id: "PIbank123", enabled: true });
  void TOKEN_HASH; // token hashing is exercised implicitly via findFirst's where clause
});

describe("POST /api/onboarding/upload — field-update submissions", () => {
  it("rejects a submission with neither a file nor any field filled in", async () => {
    const { POST } = await load();
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    expect(mockUpdateIdentity).not.toHaveBeenCalled();
    expect(mockCreateFileResource).not.toHaveBeenCalled();
  });

  it("submits field-only corrections (no file) — calls updateIdentity, skips file APIs, still triggers one verification", async () => {
    const { POST } = await load();
    const res = await POST(postReq({ doingBusinessAs: "Lighthouse Baptist", businessType: "TAX_EXEMPT_ORGANIZATION", mcc: "8661", email: "info@lighthouse.org" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUpdateIdentity).toHaveBeenCalledWith("ID123", {
      entity: { doing_business_as: "Lighthouse Baptist", business_type: "TAX_EXEMPT_ORGANIZATION", mcc: "8661", email: "info@lighthouse.org" },
    });
    expect(mockCreateFileResource).not.toHaveBeenCalled();
    expect(mockUploadFileContent).not.toHaveBeenCalled();
    expect(mockPrisma.merchantDocument.create).not.toHaveBeenCalled();
    expect(mockCreateVerification).toHaveBeenCalledTimes(1);
    expect(mockCreateVerification).toHaveBeenCalledWith("ID123");
  });

  it("submits a single changed field only — updateIdentity's entity payload contains only that field", async () => {
    const { POST } = await load();
    await POST(postReq({ mcc: "8661" }));
    expect(mockUpdateIdentity).toHaveBeenCalledWith("ID123", { entity: { mcc: "8661" } });
  });

  it("rejects an unrecognized business type instead of forwarding it to Finix", async () => {
    const { POST } = await load();
    const res = await POST(postReq({ businessType: "SOMETHING_MADE_UP" }));
    expect(res.status).toBe(400);
    expect(mockUpdateIdentity).not.toHaveBeenCalled();
  });

  it("still accepts a file-only submission exactly as before (no field updates)", async () => {
    const { POST } = await load();
    const res = await POST(postReq({ file: pdfFile() }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockCreateFileResource).toHaveBeenCalled();
    expect(mockUploadFileContent).toHaveBeenCalled();
    expect(mockPrisma.merchantDocument.create).toHaveBeenCalled();
    expect(mockUpdateIdentity).not.toHaveBeenCalled();
    expect(mockCreateVerification).toHaveBeenCalledTimes(1);
  });

  it("tags the uploaded file with the real Finix file_type Finix's Verification asked for, not a hardcoded generic type", async () => {
    mockPrisma.onboardingApplication.findFirst.mockResolvedValue({
      ...APP_ROW,
      updateRequestedCodes: {
        outcomes: [{ outcome_code: "EDD_DOCUMENT_REQUESTED", remediation_details: { type: "FILE_UPLOAD", file_type: "ENHANCED_DUE_DILIGENCE_DOCUMENT" } }],
      },
    });
    const { POST } = await load();
    await POST(postReq({ file: pdfFile() }));

    expect(mockCreateFileResource).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ENHANCED_DUE_DILIGENCE_DOCUMENT" })
    );
    expect(mockPrisma.merchantDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ documentType: "ENHANCED_DUE_DILIGENCE_DOCUMENT" }) })
    );
  });

  it("falls back to the generic ADDITIONAL_DOCUMENTATION type when no FILE_UPLOAD outcome is on file", async () => {
    const { POST } = await load(); // APP_ROW has no updateRequestedCodes
    await POST(postReq({ file: pdfFile() }));
    expect(mockCreateFileResource).toHaveBeenCalledWith(expect.objectContaining({ type: "ADDITIONAL_DOCUMENTATION" }));
  });

  it("accepts a file AND field updates together, triggering exactly one verification", async () => {
    const { POST } = await load();
    const res = await POST(postReq({ file: pdfFile(), mcc: "8661" }));
    expect(res.status).toBe(200);
    expect(mockUpdateIdentity).toHaveBeenCalledWith("ID123", { entity: { mcc: "8661" } });
    expect(mockCreateFileResource).toHaveBeenCalled();
    expect(mockCreateVerification).toHaveBeenCalledTimes(1);
  });

  it("rejects field updates when the application has no Finix identity yet", async () => {
    mockPrisma.onboardingApplication.findFirst.mockResolvedValue({ ...APP_ROW, finixIdentityId: null });
    const { POST } = await load();
    const res = await POST(postReq({ mcc: "8661" }));
    expect(res.status).toBe(400);
    expect(mockUpdateIdentity).not.toHaveBeenCalled();
  });

  it("marks the application UNDER_REVIEW and invalidates the token after a field-only submission", async () => {
    const { POST } = await load();
    await POST(postReq({ mcc: "8661" }));
    expect(mockPrisma.onboardingApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app-1" },
        data: expect.objectContaining({ onboardingStatus: "UNDER_REVIEW", updateTokenHash: null, updateTokenExpiresAt: null }),
      })
    );
  });
});

describe("POST /api/onboarding/upload — multiple, distinctly-typed document uploads", () => {
  it("accepts two file__<type>-named uploads in one request, each tagged with its own real Finix type", async () => {
    const { POST } = await load();
    const bankStatement = pdfFile("bank-statement.pdf");
    const eddDoc = pdfFile("edd.pdf");
    await POST(postReq({ "file__BANK_STATEMENT": bankStatement, "file__ENHANCED_DUE_DILIGENCE_DOCUMENT": eddDoc }));

    expect(mockCreateFileResource).toHaveBeenCalledTimes(2);
    expect(mockCreateFileResource).toHaveBeenCalledWith(expect.objectContaining({ type: "BANK_STATEMENT", display_name: "bank-statement.pdf" }));
    expect(mockCreateFileResource).toHaveBeenCalledWith(expect.objectContaining({ type: "ENHANCED_DUE_DILIGENCE_DOCUMENT", display_name: "edd.pdf" }));
    expect(mockUploadFileContent).toHaveBeenCalledTimes(2);
    expect(mockPrisma.merchantDocument.create).toHaveBeenCalledTimes(2);
    // Still exactly one verification trigger no matter how many documents were submitted.
    expect(mockCreateVerification).toHaveBeenCalledTimes(1);
  });

  it("validates every file in a multi-upload request, not just the first", async () => {
    const { POST } = await load();
    const good = pdfFile("good.pdf");
    const tooBig = new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
    const res = await POST(postReq({ "file__BANK_STATEMENT": good, "file__ENHANCED_DUE_DILIGENCE_DOCUMENT": tooBig }));
    expect(res.status).toBe(400);
    expect(mockCreateFileResource).not.toHaveBeenCalled();
  });

  it("treats an empty file__ suffix as the generic ADDITIONAL_DOCUMENTATION type (no typed FILE_UPLOAD outcomes on file)", async () => {
    const { POST } = await load();
    await POST(postReq({ "file__": pdfFile() }));
    expect(mockCreateFileResource).toHaveBeenCalledWith(expect.objectContaining({ type: "ADDITIONAL_DOCUMENTATION" }));
  });

  it("combines multiple typed uploads with field updates in a single submission", async () => {
    const { POST } = await load();
    const res = await POST(postReq({ "file__BANK_STATEMENT": pdfFile(), "file__ENHANCED_DUE_DILIGENCE_DOCUMENT": pdfFile(), mcc: "8661" }));
    expect(res.status).toBe(200);
    expect(mockUpdateIdentity).toHaveBeenCalledWith("ID123", { entity: { mcc: "8661" } });
    expect(mockCreateFileResource).toHaveBeenCalledTimes(2);
    expect(mockCreateVerification).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/onboarding/upload — website, phone, principal SSN/address, ownership and note", () => {
  it("maps every extra field to Finix's entity fields in one updateIdentity call and triggers one verification", async () => {
    const { POST } = await load();
    const res = await POST(
      postReq({
        website: "lighthousebaptist.org",
        businessPhone: "(816) 555-0142",
        principalSsn: "123-45-6789",
        addressLine1: "12 Elm St",
        city: "Kansas City",
        state: "mo",
        postalCode: "64101",
        removeOwnership: "true",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateIdentity).toHaveBeenCalledTimes(1);
    expect(mockUpdateIdentity).toHaveBeenCalledWith("ID123", {
      entity: {
        url: "https://lighthousebaptist.org",
        business_phone: "8165550142",
        tax_id: "123456789",
        personal_address: { line1: "12 Elm St", city: "Kansas City", region: "MO", postal_code: "64101", country: "USA" },
        principal_percentage_ownership: null,
      },
    });
    expect(mockCreateVerification).toHaveBeenCalledTimes(1);
  });

  it("never puts the SSN in the admin email, the merchant email, the database or the response", async () => {
    const { POST } = await load();
    const res = await POST(postReq({ principalSsn: "123-45-6789", website: "lighthousebaptist.org" }));
    const everything = JSON.stringify([await res.json(), mockSendWgcEmail.mock.calls, mockSendWgcAdminEmail.mock.calls, mockPrisma.onboardingApplication.update.mock.calls, mockPrisma.merchantDocument.create.mock.calls]);
    expect(everything).not.toContain("123-45-6789");
    expect(everything).not.toContain("123456789");
    expect(everything).toContain("Principal SSN"); // the field NAME is audited, never the value
  });

  it("rejects an EIN-shaped value in the SSN field and sends nothing to Finix", async () => {
    const { POST } = await load();
    const res = await POST(postReq({ principalSsn: "12-3456789" }));
    expect(res.status).toBe(400);
    expect(mockUpdateIdentity).not.toHaveBeenCalled();
    expect(mockCreateVerification).not.toHaveBeenCalled();
  });

  it("redacts an SSN echoed back in a Finix error before it can be returned or logged", async () => {
    mockUpdateIdentity.mockRejectedValue(new Error("tax_id 123456789 is invalid"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await load();
    const res = await POST(postReq({ principalSsn: "123-45-6789" }));
    const body = JSON.stringify(await res.json());
    expect(res.status).toBe(500);
    expect(body).not.toContain("123456789");
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("123456789");
    errSpy.mockRestore();
  });

  it("accepts a note-only submission (no Finix identity change), escapes it in the admin email and still triggers verification", async () => {
    const { POST } = await load();
    const res = await POST(postReq({ note: "Our <b>treasurer</b> changed" }));
    expect(res.status).toBe(200);
    expect(mockUpdateIdentity).not.toHaveBeenCalled();
    expect(mockCreateVerification).toHaveBeenCalledTimes(1);
    const admin = JSON.stringify(mockSendWgcAdminEmail.mock.calls);
    expect(admin).toContain("&lt;b&gt;treasurer&lt;/b&gt;");
    expect(admin).not.toContain("<b>treasurer</b>");
  });
});

describe("POST /api/onboarding/upload — replacement payout bank account", () => {
  const bank = { bankHolderName: "Lighthouse Baptist Church", bankAccountType: "CHECKING", bankRoutingNumber: "021000021", bankAccountNumber: "123456789012", bankAccountNumberConfirm: "123456789012" };

  it("creates a BANK_ACCOUNT instrument on the identity, stores only the new id and last 4, and triggers one verification", async () => {
    const { POST } = await load();
    const res = await POST(postReq(bank));
    expect(res.status).toBe(200);
    expect(mockCreatePaymentInstrument).toHaveBeenCalledWith({ type: "BANK_ACCOUNT", name: "Lighthouse Baptist Church", account_type: "CHECKING", bank_code: "021000021", account_number: "123456789012", identity: "ID123" });
    expect(mockPrisma.onboardingApplication.update).toHaveBeenCalledWith({
      where: { id: "app-1" },
      data: { finixPaymentInstrumentId: "PIbank123", bankInstrumentEnabled: true, bankLast4: "9012", bankAccountType: "CHECKING" },
    });
    expect(mockCreateVerification).toHaveBeenCalledTimes(1);
  });

  it("never lets the full account or routing number reach emails, the database, the response or the logs", async () => {
    const { POST } = await load();
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(postReq(bank));
    const everything = JSON.stringify([await res.json(), mockSendWgcEmail.mock.calls, mockSendWgcAdminEmail.mock.calls, mockPrisma.onboardingApplication.update.mock.calls, mockPrisma.merchantDocument.create.mock.calls, logSpy.mock.calls]);
    expect(everything).not.toContain("123456789012");
    expect(everything).not.toContain("021000021");
    expect(everything).toContain("Payout bank account"); // the NAME is audited, never the numbers
    logSpy.mockRestore();
  });

  it("rejects a bad routing number or mismatched account numbers before calling Finix", async () => {
    const { POST } = await load();
    expect((await POST(postReq({ ...bank, bankRoutingNumber: "123456789" }))).status).toBe(400);
    expect((await POST(postReq({ ...bank, bankAccountNumberConfirm: "000000000000" }))).status).toBe(400);
    expect(mockCreatePaymentInstrument).not.toHaveBeenCalled();
    expect(mockCreateVerification).not.toHaveBeenCalled();
  });

  it("fails the whole submission cleanly (nothing else changed) and echoes no numbers when Finix rejects the account", async () => {
    mockCreatePaymentInstrument.mockRejectedValue(new Error("account_number 123456789012 is invalid"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await load();
    const res = await POST(postReq({ ...bank, website: "lighthousebaptist.org" }));
    const body = JSON.stringify(await res.json());
    expect(res.status).toBe(400);
    expect(body).not.toContain("123456789012");
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain("123456789012");
    expect(mockUpdateIdentity).not.toHaveBeenCalled();
    expect(mockCreateVerification).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
