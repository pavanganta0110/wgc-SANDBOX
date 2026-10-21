import { describe, it, expect } from "vitest";
import { sniffImageFormat } from "../organizationBranding";

describe("sniffImageFormat", () => {
  it("recognizes PNG and JPEG by their bytes, whatever the file is named", () => {
    expect(sniffImageFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(sniffImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
  });

  it("rejects formats @react-pdf can't draw (WebP, SVG) so they never break the PDF", () => {
    expect(sniffImageFormat(Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBP", "latin1"))).toBeNull();
    expect(sniffImageFormat(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImageFormat(Buffer.alloc(0))).toBeNull();
  });
});
