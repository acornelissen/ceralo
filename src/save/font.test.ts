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
  it("selects a distinct embedded font per family and per weight/style", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedTextFonts(doc, {
      sans: allVariants(),
      serif: {
        regular: variant("NotoSerif-Regular.ttf"),
        bold: variant("NotoSerif-Bold.ttf"),
      },
    });

    const sansRegular = fonts.fontFor("sans", false, false);
    expect(fonts.fontFor("sans", true, false)).not.toBe(sansRegular);
    expect(fonts.fontFor("sans", false, false)).toBe(sansRegular); // stable
    expect(fonts.fontFor("serif", false, false)).not.toBe(sansRegular); // a different face
    expect(fonts.fontFor("serif", true, false)).not.toBe(fonts.fontFor("serif", false, false));
  });

  it("falls back an absent family to sans", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedTextFonts(doc, { sans: { regular: fontBytes() } });

    const sansRegular = fonts.fontFor("sans", false, false);
    expect(fonts.fontFor("serif", false, false)).toBe(sansRegular);
    expect(fonts.fontFor("mono", true, false)).toBe(sansRegular);
  });

  it("falls back a missing variant within a family", async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedTextFonts(doc, {
      sans: { regular: fontBytes(), bold: variant("NotoSans-Bold.ttf") },
    });

    expect(fonts.fontFor("sans", true, true)).toBe(fonts.fontFor("sans", true, false)); // bi -> bold
    expect(fonts.fontFor("sans", false, true)).toBe(fonts.fontFor("sans", false, false)); // i -> regular
  });
});
