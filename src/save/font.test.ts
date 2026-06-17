import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { embedTextFonts, embedUnicodeFont } from "./font";

// Latin-extended, em dash, Greek and Cyrillic: none of these are in pdf-lib's
// WinAnsi set, so they prove the embedded font is genuinely Unicode-capable.
const NON_ASCII = "Příliš žluťoučký kůň — café Ω π Привет";

function variant(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../assets/fonts/${name}`, import.meta.url))),
  );
}

function fontBytes(): Uint8Array {
  return variant("NotoSans-Regular.ttf");
}

const allVariants = () => ({
  regular: variant("NotoSans-Regular.ttf"),
  bold: variant("NotoSans-Bold.ttf"),
  italic: variant("NotoSans-Italic.ttf"),
  boldItalic: variant("NotoSans-BoldItalic.ttf"),
});

describe("embedUnicodeFont", () => {
  it("embeds a font that can encode and measure non-ASCII text", async () => {
    const doc = await PDFDocument.create();
    const font = await embedUnicodeFont(doc, fontBytes());

    expect(font.widthOfTextAtSize(NON_ASCII, 12)).toBeGreaterThan(0);
  });

  it("draws non-ASCII text into a page that saves to real bytes", async () => {
    const doc = await PDFDocument.create();
    const font = await embedUnicodeFont(doc, fontBytes());
    const page = doc.addPage();
    page.drawText(NON_ASCII, { x: 50, y: 700, size: 12, font });

    const saved = await doc.save();

    expect(saved.length).toBeGreaterThan(0);
  });

  it("contrasts with a Latin-only standard font, which cannot encode it", async () => {
    const doc = await PDFDocument.create();
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);

    expect(() => helvetica.widthOfTextAtSize(NON_ASCII, 12)).toThrow();
  });
});

describe("embedTextFonts", () => {
  it("selects a distinct embedded font for each weight/style combination", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedTextFonts(doc, allVariants());

    const regular = fonts.fontFor(false, false);
    expect(fonts.fontFor(true, false)).not.toBe(regular);
    expect(fonts.fontFor(false, true)).not.toBe(regular);
    expect(fonts.fontFor(true, true)).not.toBe(fonts.fontFor(true, false));
    expect(fonts.fontFor(false, false)).toBe(regular); // stable
  });

  it("falls back to regular for any variant that was not supplied", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedTextFonts(doc, { regular: fontBytes() });

    const regular = fonts.fontFor(false, false);
    expect(fonts.fontFor(true, false)).toBe(regular);
    expect(fonts.fontFor(true, true)).toBe(regular);
  });

  it("falls back bold-italic to bold when only bold is supplied", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedTextFonts(doc, {
      regular: fontBytes(),
      bold: variant("NotoSans-Bold.ttf"),
    });

    expect(fonts.fontFor(true, true)).toBe(fonts.fontFor(true, false));
  });
});
