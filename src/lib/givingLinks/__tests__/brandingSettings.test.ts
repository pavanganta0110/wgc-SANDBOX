import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseBrandingSettings, DEFAULT_BRANDING_SETTINGS, parseYouTubeVideoId, resolveThankYouVideoEmbed } from '../types';
import { PATCH } from '@/app/api/merchant/giving-links/[id]/route';
import { prisma } from '@/lib/prisma';
import { UnauthorizedError } from '@/lib/auth/errors';

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock('@/lib/auth/requireMerchantSession', () => ({
  requireMerchantSession: vi.fn(),
  isAuthError: vi.fn((err: any) => err instanceof Error && err.name === 'UnauthorizedError'),
}));

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
    const { requireMerchantSession } = await import('@/lib/auth/requireMerchantSession');
    vi.mocked(requireMerchantSession).mockRejectedValue(new UnauthorizedError('Unauthorized'));

    const req = new Request('http://localhost/api/merchant/giving-links/link-123', {
      method: 'PATCH',
      body: JSON.stringify({ brandingSettings: { showPoweredByWgc: false } }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'link-123' }) });
    expect(res.status).toBe(401);
  });

  it('Non-admin users cannot change branding settings (PATCH link)', async () => {
    const { requireMerchantSession } = await import('@/lib/auth/requireMerchantSession');
    vi.mocked(requireMerchantSession).mockRejectedValue(new UnauthorizedError('Unauthorized'));

    const req = new Request('http://localhost/api/merchant/giving-links/link-123', {
      method: 'PATCH',
      body: JSON.stringify({ brandingSettings: { showPoweredByWgc: false } }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'link-123' }) });
    expect(res.status).toBe(401);
  });

  it('Authorized church_admin can update branding settings (PATCH link)', async () => {
    const { requireMerchantSession } = await import('@/lib/auth/requireMerchantSession');
    vi.mocked(requireMerchantSession).mockResolvedValue({
      userId: 'user-123',
      churchId: 'church-123',
      role: 'church_admin',
      email: 'admin@example.com',
      sessionSource: 'cookie',
      activeScope: { type: 'ENTIRE_ORGANIZATION', scopeKey: 'ENTIRE_ORGANIZATION', churchId: 'church-123', label: 'Entire Organization' },
      effectiveScope: { type: 'ENTIRE_ORGANIZATION', scopeKey: 'ENTIRE_ORGANIZATION', churchId: 'church-123', label: 'Entire Organization' },
    } as any);

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

describe('parseYouTubeVideoId — thank-you video on the donation success screen', () => {
  it('extracts the video ID from a standard watch URL', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the video ID from a youtu.be short link', () => {
    expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the video ID from a Shorts URL', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts the video ID from an already-embed URL', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for an empty or missing URL, so no iframe renders at all', () => {
    expect(parseYouTubeVideoId('')).toBeNull();
  });

  it('returns null for a non-YouTube URL — never lets an arbitrary domain be embedded', () => {
    expect(parseYouTubeVideoId('https://evil.example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('returns null for a malformed URL instead of throwing', () => {
    expect(parseYouTubeVideoId('not a url')).toBeNull();
  });

  it('DEFAULT_BRANDING_SETTINGS.thankYouVideoUrl defaults to empty, and parseBrandingSettings preserves a saved one', () => {
    expect(DEFAULT_BRANDING_SETTINGS.thankYouVideoUrl).toBe('');
    const parsed = parseBrandingSettings({ thankYouVideoUrl: 'https://youtu.be/abc12345678' });
    expect(parsed.thankYouVideoUrl).toBe('https://youtu.be/abc12345678');
  });
});

describe('resolveThankYouVideoEmbed — multi-platform thank-you video on the donation success screen', () => {
  it('resolves a YouTube URL to the youtube-nocookie.com embed, 16:9', () => {
    const embed = resolveThankYouVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(embed).toEqual({ kind: 'iframe', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', aspect: '16/9' });
  });

  it('resolves a Vimeo URL to the player.vimeo.com embed, 16:9', () => {
    const embed = resolveThankYouVideoEmbed('https://vimeo.com/76979871');
    expect(embed).toEqual({ kind: 'iframe', src: 'https://player.vimeo.com/video/76979871', aspect: '16/9' });
  });

  it('resolves a TikTok video URL to the tiktok.com/embed/v2 embed, 9:16', () => {
    const embed = resolveThankYouVideoEmbed('https://www.tiktok.com/@wgc/video/7123456789012345678');
    expect(embed).toEqual({ kind: 'iframe', src: 'https://www.tiktok.com/embed/v2/7123456789012345678', aspect: '9/16' });
  });

  it('resolves an Instagram reel URL to the instagram.com/reel/.../embed embed, 9:16', () => {
    const embed = resolveThankYouVideoEmbed('https://www.instagram.com/reel/Cabc123XYZ/');
    expect(embed).toEqual({ kind: 'iframe', src: 'https://www.instagram.com/reel/Cabc123XYZ/embed', aspect: '9/16' });
  });

  it('resolves a Facebook video URL to the facebook.com video plugin, 16:9', () => {
    const embed = resolveThankYouVideoEmbed('https://www.facebook.com/WGC/videos/123456789/');
    expect(embed).toEqual({
      kind: 'iframe',
      src: 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent('https://www.facebook.com/WGC/videos/123456789/') + '&show_text=false',
      aspect: '16/9',
    });
  });

  it('resolves a direct .mp4 file to a native <video>, not an iframe', () => {
    const embed = resolveThankYouVideoEmbed('https://cdn.example.org/thank-you.mp4');
    expect(embed).toEqual({ kind: 'video', src: 'https://cdn.example.org/thank-you.mp4', aspect: '16/9' });
  });

  it('resolves a direct .webm file to a native <video> too', () => {
    const embed = resolveThankYouVideoEmbed('https://cdn.example.org/thank-you.webm');
    expect(embed?.kind).toBe('video');
  });

  it('returns null for an unrecognized platform — never falls back to a generic "embed anything" iframe', () => {
    expect(resolveThankYouVideoEmbed('https://evil.example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('returns null for a non-http(s) protocol (e.g. javascript:) even if the rest of the URL looks like a known platform', () => {
    expect(resolveThankYouVideoEmbed('javascript:alert(1)')).toBeNull();
  });

  it('returns null for a Vimeo/TikTok/Instagram URL missing the actual video id/shortcode', () => {
    expect(resolveThankYouVideoEmbed('https://vimeo.com/')).toBeNull();
    expect(resolveThankYouVideoEmbed('https://www.tiktok.com/@wgc')).toBeNull();
    expect(resolveThankYouVideoEmbed('https://www.instagram.com/wgc/')).toBeNull();
  });

  it('returns null for an empty URL', () => {
    expect(resolveThankYouVideoEmbed('')).toBeNull();
  });
});
