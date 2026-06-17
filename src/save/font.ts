import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import type { TextFamily } from "../model/document";

// pdf-lib's standard fonts are WinAnsi (Latin-1) only, so drawn text outside
// that set fails to encode. We embed an open-licensed Unicode font (Noto Sans,
// OFL — see src/assets/fonts/OFL.txt) so the save projection (m3-7) can draw
// accented, Greek, Cyrillic and other glyphs. Subsetting keeps only the glyphs
// actually used, so the saved file grows by a few KB, not the whole 550KB face.

/**
 * Embed the Unicode text font into a pdf-lib document and return it. fontkit is
 * registered here (pdf-lib needs it to embed non-standard fonts); the font is
 * subset on save. Callers pass the font to drawText for free-text annotations.
 */
export async function embedUnicodeFont(doc: PDFDocument, fontBytes: Uint8Array): Promise<PDFFont> {
  doc.registerFontkit(fontkit);
  return doc.embedFont(fontBytes, { subset: true });
}

/** A family's variant bytes; only `regular` is required (others fall back). */
export interface TextFontVariants {
  readonly regular: Uint8Array;
  readonly bold?: Uint8Array | undefined;
  readonly italic?: Uint8Array | undefined;
  readonly boldItalic?: Uint8Array | undefined;
}

/** The per-family variant bytes. `sans` must be present; it is the fallback. */
export type TextFontFamilies = Partial<Record<TextFamily, TextFontVariants>> & {
  readonly sans: TextFontVariants;
};

/** Picks the embedded font for a given family + weight/style. */
export interface EmbeddedTextFonts {
  fontFor(family: TextFamily, bold: boolean, italic: boolean): PDFFont;
}

type VariantSelector = (bold: boolean, italic: boolean) => PDFFont;

/** Embed one family's variants, with the per-variant fallback chain. */
async function embedFamily(doc: PDFDocument, variants: TextFontVariants): Promise<VariantSelector> {
  const regular = await doc.embedFont(variants.regular, { subset: true });
  const bold = variants.bold ? await doc.embedFont(variants.bold, { subset: true }) : regular;
  const italic = variants.italic ? await doc.embedFont(variants.italic, { subset: true }) : regular;
  const boldItalic = variants.boldItalic
    ? await doc.embedFont(variants.boldItalic, { subset: true })
    : bold !== regular
      ? bold
      : italic;
  return (b, i) => (b && i ? boldItalic : b ? bold : i ? italic : regular);
}

/**
 * Embed the available font families and return a selector. Within a family a
 * missing variant falls back (bold-italic → bold → regular, italic → regular);
 * an absent family falls back to sans. Each face is subset on save.
 */
export async function embedTextFonts(
  doc: PDFDocument,
  families: TextFontFamilies,
): Promise<EmbeddedTextFonts> {
  doc.registerFontkit(fontkit);
  const embedded = {} as Record<TextFamily, VariantSelector>;
  for (const family of Object.keys(families) as TextFamily[]) {
    const variants = families[family];
    if (variants) {
      embedded[family] = await embedFamily(doc, variants);
    }
  }
  return {
    fontFor: (family, bold, italic) => (embedded[family] ?? embedded.sans)(bold, italic),
  };
}
