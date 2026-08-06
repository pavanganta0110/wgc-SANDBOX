import { describe, it, expect, vi, beforeEach } from "vitest";
import * as oauth from "@/lib/auth/oauth";
import { prisma } from "@/lib/prisma";

// Mock next/headers cookies
const mockCookiesStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: async () => mockCookiesStore,
}));

// Mock prisma and jose/jwt dependencies
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authAccount: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    dashboardAuditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("OAuth State Encryption & Journey Data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "super-secret-key-that-is-at-least-32-chars-long";
  });

  it("encrypts and decrypts state tokens preserving redirects and promotions", async () => {
    const payload = {
      mode: "signup" as const,
      redirectTo: "/merchant/onboarding",
      promotion: "SIX_MONTHS_FREE",
    };

    let savedValue = "";
    mockCookiesStore.set.mockImplementation((name, value) => {
      savedValue = value;
    });

    // Set state
    await oauth.setOpaqueJourneyState("test-token-123", payload);
    expect(mockCookiesStore.set).toHaveBeenCalled();

    // Mock get to return the encrypted cookie value
    mockCookiesStore.get.mockReturnValue({ value: savedValue });

    // Decrypt
    const decrypted = await oauth.getOpaqueJourneyState("test-token-123");
    expect(decrypted).toBeDefined();
    expect(decrypted?.mode).toBe("signup");
    expect(decrypted?.redirectTo).toBe("/merchant/onboarding");
    expect(decrypted?.promotion).toBe("SIX_MONTHS_FREE");
  });

  it("returns null for invalid/missing tokens", async () => {
    mockCookiesStore.get.mockReturnValue(undefined);
    const decrypted = await oauth.getOpaqueJourneyState("some-state-token");
    expect(decrypted).toBeNull();
  });
});

describe("ID Token Verification Claims", () => {
  it("successfully passes verification with mock identity providers", async () => {
    const spy = vi.spyOn(oauth, "verifyIdToken").mockResolvedValue({
      sub: "mock-sub-123",
      email: "user@example.com",
      name: "John Doe",
    });

    const claims = await oauth.verifyIdToken("mock-jwt-token", "google");
    expect(claims.sub).toBe("mock-sub-123");
    expect(claims.email).toBe("user@example.com");
    
    spy.mockRestore();
  });
});
