import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A fifth independent copy of the hardcoded ADDITIONAL_DOCUMENTATION file
 * type was found here — the admin's own "Upload as Admin" action,
 * separate from the merchant-facing secure-link upload already fixed
 * (2026-09-04). Also missing the legalBusinessName fallback the other
 * four onboarding-status surfaces had already been fixed for.
 */

const mockCreateFileResource = vi.fn();
const mockUploadFileContent = vi.fn();
const mockCreateVerification = vi.fn();
vi.mock("@/lib/finix/client", () => ({
  finixClient: {
    createFileResource: (...a: unknown[]) => mockCreateFileResource(...a),
    uploadFileContent: (...a: unknown[]) => mockUploadFileContent(...a),
    createVerification: (...a: unknown[]) => mockCreateVerification(...a),
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
  organizationName: "",
  legalBusinessName: "Lighthouse Baptist Church",
  finixMerchantId: "MU123",
  finixIdentityId: "ID123",
  updateRequestedCodes: null,
};

const mockPrisma = {
  onboardingApplication: {
    findUnique: vi.fn().mockResolvedValue(APP_ROW),
    update: vi.fn().mockResolvedValue({}),
  },
  merchantDocument: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

async function load() {
  vi.resetModules();
  return import("../route");
}

function pdfFile(name = "doc.pdf") {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}

function postReq(applicationId: string, file: File) {
  const fd = new FormData();
  fd.append("applicationId", applicationId);
  fd.append("file", file);
  return new Request("http://x/api/admin/upload-evidence", { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.onboardingApplication.findUnique.mockResolvedValue({ ...APP_ROW });
  mockCreateFileResource.mockResolvedValue({ id: "FI123" });
  mockCreateVerification.mockResolvedValue({ id: "VI123" });
  mockGetAdminSession.mockResolvedValue({ userId: "admin_1", email: "admin@wgc.com", role: "wgc_admin" });
});

describe("POST /api/admin/upload-evidence", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(postReq("app-1", pdfFile()));
    expect(res.status).toBe(401);
    expect(mockCreateFileResource).not.toHaveBeenCalled();
  });

  it("tags the file with the real Finix type from the stored Verification, not a hardcoded generic type", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue({
      ...APP_ROW,
      updateRequestedCodes: { outcomes: [{ remediation_details: { type: "FILE_UPLOAD", file_type: "ENHANCED_DUE_DILIGENCE_DOCUMENT" } }] },
    });
    const { POST } = await load();
    const res = await POST(postReq("app-1", pdfFile()));
    expect(res.status).toBe(200);

    expect(mockCreateFileResource).toHaveBeenCalledWith(expect.objectContaining({ type: "ENHANCED_DUE_DILIGENCE_DOCUMENT" }));
    expect(mockPrisma.merchantDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ documentType: "ENHANCED_DUE_DILIGENCE_DOCUMENT" }) })
    );
  });

  it("falls back to ADDITIONAL_DOCUMENTATION when no FILE_UPLOAD outcome is on file", async () => {
    const { POST } = await load();
    await POST(postReq("app-1", pdfFile()));
    expect(mockCreateFileResource).toHaveBeenCalledWith(expect.objectContaining({ type: "ADDITIONAL_DOCUMENTATION" }));
  });

  it("falls back to legalBusinessName in the merchant email when organizationName is empty", async () => {
    const { POST } = await load();
    await POST(postReq("app-1", pdfFile()));
    const call = mockSendWgcEmail.mock.calls[0][0];
    expect(call.bodyHtml).toContain("Lighthouse Baptist Church");
    expect(call.bodyHtml).not.toContain("your organization");
  });

  it("404s when the application doesn't exist", async () => {
    mockPrisma.onboardingApplication.findUnique.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(postReq("missing", pdfFile()));
    expect(res.status).toBe(404);
  });
});
