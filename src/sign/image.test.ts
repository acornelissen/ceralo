import { describe, expect, it } from "vitest";
import { detectImageType } from "./image";

describe("detectImageType", () => {
  it("detects a PNG from its magic bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detectImageType(png)).toBe("png");
  });

  it("detects a JPEG from its magic bytes", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageType(jpeg)).toBe("jpeg");
  });

  it("returns null for bytes that are neither PNG nor JPEG", () => {
    expect(detectImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });
});
