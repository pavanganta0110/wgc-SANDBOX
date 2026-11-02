import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
const mockLoadTransfer = vi.fn();
vi.mock("@/lib/transactions/documentAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/transactions/documentAccess")>()),
  loadScopedTransfer: (...args: unknown[]) => mockLoadTransfer(...args),
}));
const mockUpload = vi.fn();
const mockSignedUrl = vi.fn();
vi.mock("@/lib/storage/supabaseStorage", () => ({
  uploadPrivateFile: (...args: unknown[]) => mockUpload(...args),
  createSignedDownloadUrl: (...args: unknown[]) => mockSignedUrl(...args),
}));
const mockAudit = vi.fn();
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: (...args: unknown[]) => mockAudit(...args) }));
const mockPrisma = vi.hoisted(() => ({
  transactionDocument: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/permissions", () => ({ hasPermission: (auth: { canSeeAll?: boolean }) => Boolean(auth.canSeeAll) }));
vi.mock("@/lib/auth/viewScope", () => ({ resolveViewScope: vi.fn() }));
vi.mock("@/lib/auth/scopes", () => ({ buildFinixTransferScope: vi.fn() }));

const owner = { userId: "u1", email: "owner@mbts.edu", churchId: "church-1", rawRole: "owner", role: "owner", canSeeAll: true };
const viewer = { ...owner, userId: "u2", role: "viewer", canSeeAll: false };
const staff = { ...owner, userId: "u3", role: "fundraiser", canSeeAll: false };

const params = { params: Promise.resolve({ transferId: "TR_1" }) };
const docParams = { params: Promise.resolve({ transferId: "TR_1", documentId: "doc-1" }) };

function uploadReq(name = "approval.pdf", type = "application/pdf", content = "hello") {
  const form = new FormData();
  form.set("file", new File([content], name, { type }));
  return new Request("http://x/api/merchant/transactions/payments/TR_1/documents", { method: "POST", body: form });
}

async function routes() {
  vi.resetModules();
  return {
    list: await import("@/app/api/merchant/transactions/payments/[transferId]/documents/route"),
    item: await import("@/app/api/merchant/transactions/payments/[transferId]/documents/[documentId]/route"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(owner);
  mockLoadTransfer.mockResolvedValue({ finixTransferId: "TR_1" });
  mockPrisma.transactionDocument.count.mockResolvedValue(0);
  mockPrisma.transactionDocument.create.mockResolvedValue({ id: "doc-1", fileName: "approval.pdf" });
  mockUpload.mockResolvedValue(undefined);
  mockSignedUrl.mockResolvedValue("https://storage.example/signed?token=abc");
});

describe("POST documents", () => {
  it("uploads to private storage with the server-decided type and records an audit entry", async () => {
    const { list } = await routes();
    const res = await list.POST(uploadReq(), params);
    expect(res.status).toBe(201);
    const [key, bytes, type] = mockUpload.mock.calls[0];
    expect(key).toMatch(/^transaction-documents\/church-1\/TR_1\/.+-approval\.pdf$/);
    expect(bytes.toString()).toBe("hello");
    expect(type).toBe("application/pdf");
    expect(mockPrisma.transactionDocument.create.mock.calls[0][0].data).toMatchObject({
      churchId: "church-1",
      finixTransferId: "TR_1",
      uploadedByUserId: "u1",
      sizeBytes: 5,
    });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "transaction.document_uploaded", entityId: "TR_1" }));
  });

  it("forbids viewers and never touches storage", async () => {
    mockAuth.mockResolvedValue(viewer);
    const { list } = await routes();
    expect((await list.POST(uploadReq(), params)).status).toBe(403);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("404s a payment outside the viewer's scope", async () => {
    mockLoadTransfer.mockResolvedValue(null);
    const { list } = await routes();
    expect((await list.POST(uploadReq(), params)).status).toBe(404);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rejects unsupported files before storing anything", async () => {
    const { list } = await routes();
    const res = await list.POST(uploadReq("evil.html", "text/html", "<script>"), params);
    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockPrisma.transactionDocument.create).not.toHaveBeenCalled();
  });

  it("stops at 25 documents per transaction", async () => {
    mockPrisma.transactionDocument.count.mockResolvedValue(25);
    const { list } = await routes();
    expect((await list.POST(uploadReq(), params)).status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("does not record a document when storage fails", async () => {
    mockUpload.mockRejectedValue(new Error("bucket down"));
    const { list } = await routes();
    expect((await list.POST(uploadReq(), params)).status).toBe(502);
    expect(mockPrisma.transactionDocument.create).not.toHaveBeenCalled();
  });
});

describe("GET documents", () => {
  it("lists only this organization's live documents for the transaction and flags what the viewer may remove", async () => {
    mockAuth.mockResolvedValue(staff);
    mockPrisma.transactionDocument.findMany.mockResolvedValue([
      { id: "a", fileName: "a.pdf", uploadedByUserId: "u3" },
      { id: "b", fileName: "b.pdf", uploadedByUserId: "someone-else" },
    ]);
    const { list } = await routes();
    const body = await (await list.GET(new Request("http://x"), params)).json();
    expect(mockPrisma.transactionDocument.findMany.mock.calls[0][0].where).toEqual({ churchId: "church-1", finixTransferId: "TR_1", deletedAt: null });
    expect(body.canAttach).toBe(true);
    expect(body.documents.map((d: { canRemove: boolean }) => d.canRemove)).toEqual([true, false]);
  });

  it("404s when the payment is out of scope", async () => {
    mockLoadTransfer.mockResolvedValue(null);
    const { list } = await routes();
    expect((await list.GET(new Request("http://x"), params)).status).toBe(404);
  });
});

describe("GET document download", () => {
  it("redirects to a short-lived signed URL that forces a download, and audits it", async () => {
    mockPrisma.transactionDocument.findFirst.mockResolvedValue({ id: "doc-1", fileName: "approval.pdf", storageKey: "k/1", uploadedByUserId: "u1" });
    const { item } = await routes();
    const res = await item.GET(new Request("http://x"), docParams);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://storage.example/signed?token=abc");
    expect(mockSignedUrl).toHaveBeenCalledWith("k/1", 300, { download: "approval.pdf" });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "transaction.document_downloaded" }));
    expect(mockPrisma.transactionDocument.findFirst.mock.calls[0][0].where).toEqual({
      id: "doc-1",
      churchId: "church-1",
      finixTransferId: "TR_1",
      deletedAt: null,
    });
  });

  it("404s a document that is not in this organization or was removed", async () => {
    mockPrisma.transactionDocument.findFirst.mockResolvedValue(null);
    const { item } = await routes();
    expect((await item.GET(new Request("http://x"), docParams)).status).toBe(404);
    expect(mockSignedUrl).not.toHaveBeenCalled();
  });
});

describe("DELETE document", () => {
  const doc = { id: "doc-1", fileName: "approval.pdf", storageKey: "k/1", uploadedByUserId: "u3" };

  it("soft-deletes (keeps the row) and audits", async () => {
    mockAuth.mockResolvedValue(staff);
    mockPrisma.transactionDocument.findFirst.mockResolvedValue(doc);
    const { item } = await routes();
    expect((await item.DELETE(new Request("http://x"), docParams)).status).toBe(200);
    expect(mockPrisma.transactionDocument.update.mock.calls[0][0]).toMatchObject({
      where: { id: "doc-1" },
      data: { deletedByUserId: "u3", deletedAt: expect.any(Date) },
    });
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "transaction.document_removed" }));
  });

  it("lets an organization-level user remove someone else's document", async () => {
    mockPrisma.transactionDocument.findFirst.mockResolvedValue(doc);
    const { item } = await routes();
    expect((await item.DELETE(new Request("http://x"), docParams)).status).toBe(200);
  });

  it("forbids a team member removing a colleague's document, and viewers always", async () => {
    mockPrisma.transactionDocument.findFirst.mockResolvedValue({ ...doc, uploadedByUserId: "someone-else" });
    mockAuth.mockResolvedValue(staff);
    const { item } = await routes();
    expect((await item.DELETE(new Request("http://x"), docParams)).status).toBe(403);
    mockAuth.mockResolvedValue(viewer);
    expect((await item.DELETE(new Request("http://x"), docParams)).status).toBe(403);
    expect(mockPrisma.transactionDocument.update).not.toHaveBeenCalled();
  });
});
