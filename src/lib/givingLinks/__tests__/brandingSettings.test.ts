import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseBrandingSettings, DEFAULT_BRANDING_SETTINGS } from '../types';
import { PATCH } from '@/app/api/merchant/giving-links/[id]/route';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/session';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    givingLink: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Branding Settings for Giving Links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('New giving link defaults Powered by WGC to ON', () => {
    expect(DEFAULT_BRANDING_SETTINGS.showPoweredByWgc).toBe(true);
    const parsed = parseBrandingSettings({});
    expect(parsed.showPoweredByWgc).toBe(true);
  });

  it('Existing links preserve their saved setting (branding is ON if hideFooter is false/missing)', () => {
    const parsed = parseBrandingSettings({ hideFooter: false });
    expect(parsed.showPoweredByWgc).toBe(true);
  });

  it('Existing links preserve their saved setting (branding is OFF if hideFooter is true)', () => {
    const parsed = parseBrandingSettings({ hideFooter: true });
    expect(parsed.showPoweredByWgc).toBe(false);
  });

  it('Merchant can turn it OFF', () => {
    const parsed = parseBrandingSettings({ showPoweredByWgc: false });
    expect(parsed.showPoweredByWgc).toBe(false);
  });

  it('Merchant can turn it ON', () => {
    const parsed = parseBrandingSettings({ showPoweredByWgc: true });
    expect(parsed.showPoweredByWgc).toBe(true);
  });

  it('Unauthorized users cannot change branding settings (PATCH link)', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const req = new Request('http://localhost/api/merchant/giving-links/link-123', {
      method: 'PATCH',
      body: JSON.stringify({ brandingSettings: { showPoweredByWgc: false } }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'link-123' }) });
    expect(res.status).toBe(401);
  });

  it('Non-admin users cannot change branding settings (PATCH link)', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'user-123',
      churchId: 'church-123',
      role: 'wgc_admin',
      email: 'admin@example.com',
      exp: 9999999999,
    });

    const req = new Request('http://localhost/api/merchant/giving-links/link-123', {
      method: 'PATCH',
      body: JSON.stringify({ brandingSettings: { showPoweredByWgc: false } }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'link-123' }) });
    expect(res.status).toBe(401);
  });

  it('Authorized church_admin can update branding settings (PATCH link)', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'user-123',
      churchId: 'church-123',
      role: 'church_admin',
      email: 'admin@example.com',
      exp: 9999999999,
    });

    vi.mocked(prisma.givingLink.findFirst).mockResolvedValue({
      id: 'link-123',
      churchId: 'church-123',
      brandingSettingsJson: {},
    } as any);

    vi.mocked(prisma.givingLink.update).mockResolvedValue({
      id: 'link-123',
      brandingSettingsJson: { showPoweredByWgc: false, hideFooter: true },
    } as any);

    const req = new Request('http://localhost/api/merchant/giving-links/link-123', {
      method: 'PATCH',
      body: JSON.stringify({
        brandingSettings: { showPoweredByWgc: false, hideFooter: true },
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'link-123' }) });
    expect(res.status).toBe(200);
    expect(prisma.givingLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'link-123' },
        data: expect.objectContaining({
          brandingSettingsJson: { showPoweredByWgc: false, hideFooter: true },
        }),
      })
    );
  });
});
