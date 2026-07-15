import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { finixClient } from '@/lib/finix/client';
import { sendWgcAdminOnboardingNotification } from '@/lib/email';
import { POST } from '@/app/api/onboarding/route';

// Mock the modules
vi.mock('@/lib/prisma', () => ({
  prisma: {
    onboardingApplication: {
      create: vi.fn(),
      update: vi.fn(),
    },
    legalAcceptance: {
      create: vi.fn(),
    },
    associatedOwner: {
      createMany: vi.fn(),
    },
    emailLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/finix/client', () => ({
  finixClient: {
    createSellerIdentity: vi.fn(),
    createPaymentInstrument: vi.fn(),
    createMerchant: vi.fn(),
  },
}));

vi.mock('@/lib/email', () => ({
  sendWgcEmail: vi.fn(),
  sendWgcAdminOnboardingNotification: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => ({
    get: vi.fn(),
  })),
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: 'bypass=true' })),
    set: vi.fn(),
  })),
}));

describe('Admin Notification on Onboarding Success', () => {
  const validPayload = {
    organizationName: 'Test Org',
    contactName: 'John Doe',
    contactEmail: 'john@example.com',
    businessTaxId: '12-3456789', // Should extract '6789'
    recaptchaToken: 'valid-token', // Bypassing recaptcha explicitly
    legal: {
      wgcTerms: true,
      wgcFees: true,
      wgcPrivacy: true,
      finixTerms: true,
      finixPrivacy: true,
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RECAPTCHA_SECRET_KEY = ''; // Disable recaptcha check for tests
    process.env.SUPPORT_EMAIL = 'support@wgcpayments.com';
  });

  it('sends a notification after a successful onboarding submission', async () => {
    // Setup successful mocks
    (prisma.onboardingApplication.create as any).mockResolvedValue({ id: 'app-123' });
    (finixClient.createSellerIdentity as any).mockResolvedValue({ id: 'id-123' });
    (finixClient.createPaymentInstrument as any).mockResolvedValue({ id: 'pi-123', enabled: true });
    (finixClient.createMerchant as any).mockResolvedValue({ id: 'mer-123', processor: 'FINIX_V1', onboarding_state: 'APPROVED', processing_enabled: true, settlement_enabled: true });
    
    // No existing logs (idempotency clear)
    (prisma.emailLog.findFirst as any).mockResolvedValue(null);

    const req = new Request('http://localhost/api/onboarding', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    expect(sendWgcAdminOnboardingNotification).toHaveBeenCalledTimes(1);
    const options = vi.mocked(sendWgcAdminOnboardingNotification).mock.calls[0][0];
    
    // Check sensitive info is safe
    expect(options.businessTaxId).toBe('12-3456789'); // Route passes raw, function sanitizes
    
    // Ensure email log was created
    expect(prisma.emailLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'ADMIN_ONBOARDING_NOTIFICATION',
        status: 'SENT'
      })
    }));
  });

  it('does not send notification when validation (e.g. Finix submission) fails', async () => {
    (prisma.onboardingApplication.create as any).mockResolvedValue({ id: 'app-123' });
    // Identity creation fails
    (finixClient.createSellerIdentity as any).mockRejectedValue(new Error('Invalid SSN'));

    const req = new Request('http://localhost/api/onboarding', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });

    const response = await POST(req);
    expect(response.status).toBe(400);

    expect(sendWgcAdminOnboardingNotification).not.toHaveBeenCalled();
  });

  it('does not send duplicate emails if emailLog already exists', async () => {
    (prisma.onboardingApplication.create as any).mockResolvedValue({ id: 'app-123' });
    (finixClient.createSellerIdentity as any).mockResolvedValue({ id: 'id-123' });
    (finixClient.createPaymentInstrument as any).mockResolvedValue({ id: 'pi-123' });
    (finixClient.createMerchant as any).mockResolvedValue({ id: 'mer-123' });
    
    // Mock idempotency log already exists
    (prisma.emailLog.findFirst as any).mockImplementation((args: any) => {
      if (args.where.type === 'ADMIN_ONBOARDING_NOTIFICATION') {
        return { id: 'log-123' };
      }
      return null;
    });

    const req = new Request('http://localhost/api/onboarding', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });

    await POST(req);

    expect(sendWgcAdminOnboardingNotification).not.toHaveBeenCalled();
  });

  it('does not fail the merchant onboarding if the admin notification email fails to send', async () => {
    (prisma.onboardingApplication.create as any).mockResolvedValue({ id: 'app-123' });
    (finixClient.createSellerIdentity as any).mockResolvedValue({ id: 'id-123' });
    (finixClient.createPaymentInstrument as any).mockResolvedValue({ id: 'pi-123' });
    (finixClient.createMerchant as any).mockResolvedValue({ id: 'mer-123' });
    (prisma.emailLog.findFirst as any).mockResolvedValue(null);
    
    vi.mocked(sendWgcAdminOnboardingNotification).mockRejectedValueOnce(new Error('Resend API down'));

    const req = new Request('http://localhost/api/onboarding', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });

    const response = await POST(req);
    
    // Still 200 OK because the email failure is caught
    expect(response.status).toBe(200);

    expect(prisma.emailLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'ADMIN_ONBOARDING_NOTIFICATION',
        status: 'FAILED',
        error: 'Resend API down'
      })
    }));
  });
});
