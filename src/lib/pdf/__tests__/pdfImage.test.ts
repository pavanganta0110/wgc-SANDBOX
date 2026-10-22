import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sniffImageFormat, loadPdfImage, isOwnStorageUrl } from "../pdfImage";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const WEBP = Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBP", "latin1");
const SVG = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");
const OWN = "https://abc.supabase.co/storage/v1/object/public/branding/church-1/logo.png";

describe("sniffImageFormat", () => {
  it("recognizes PNG and JPEG by their bytes, whatever the file is named", () => {
    expect(sniffImageFormat(PNG)).toBe("png");
    expect(sniffImageFormat(JPEG)).toBe("jpg");
  });

  it("rejects formats @react-pdf can't draw (WebP, SVG) so they never break the PDF", () => {
    expect(sniffImageFormat(WEBP)).toBeNull();
    expect(sniffImageFormat(SVG)).toBeNull();
    expect(sniffImageFormat(Buffer.alloc(0))).toBeNull();
  });
});

describe("loadPdfImage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const respond = (body: Buffer, init: ResponseInit = {}) => fetchMock.mockResolvedValue(new Response(new Uint8Array(body), init));

  it("returns PNG/JPEG bytes with the format sniffed from the content, not the name", async () => {
    respond(PNG);
    expect(await loadPdfImage(OWN)).toEqual({ data: PNG, format: "png" });
    respond(JPEG); // a JPEG stored as logo.png
    expect(await loadPdfImage(OWN)).toEqual({ data: JPEG, format: "jpg" });
  });

  it("drops WebP / SVG logos instead of handing them to @react-pdf", async () => {
    respond(WEBP);
    expect(await loadPdfImage(OWN)).toBeNull();
    respond(SVG);
    expect(await loadPdfImage(OWN)).toBeNull();
  });

  it("drops the image when it's unreachable, errors, or is empty", async () => {
    respond(PNG, { status: 404 });
    expect(await loadPdfImage(OWN)).toBeNull();
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await loadPdfImage(OWN)).toBeNull();
    respond(Buffer.alloc(0));
    expect(await loadPdfImage(OWN)).toBeNull();
  });

  it("never fetches URLs outside WGC's own public storage", async () => {
    expect(await loadPdfImage(null)).toBeNull();
    expect(await loadPdfImage("https://evil.example.com/storage/v1/object/public/x.png")).toBeNull();
    expect(await loadPdfImage("http://abc.supabase.co/storage/v1/object/public/x.png")).toBeNull();
    expect(await loadPdfImage("https://abc.supabase.co/storage/v1/object/sign/x.png")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isOwnStorageUrl(OWN)).toBe(true);
  });

  it("fetches a repeated URL once when given a cache", async () => {
    respond(PNG);
    const cache = new Map();
    await loadPdfImage(OWN, cache);
    await loadPdfImage(OWN, cache);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
