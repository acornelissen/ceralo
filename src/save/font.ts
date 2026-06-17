import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

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

/** The text-font variant bytes; only `regular` is required (others fall back). */
export interface TextFontVariants {
  readonly regular: Uint8Array;
  readonly bold?: Uint8Array | undefined;
  readonly italic?: Uint8Array | undefined;
  readonly boldItalic?: Uint8Array | undefined;
}

/** Picks the embedded font for a given weight/style. */
export interface EmbeddedTextFonts {
  fontFor(bold: boolean, italic: boolean): PDFFont;
}

/**
 * Embed the available text-font variants and return a selector. Any missing
 * variant falls back to the next best already-embedded face (bold-italic →
 * bold → regular, italic → regular), so a partial set still produces valid
 * output. Each face is subset on save.
 */
export async function embedTextFonts(
  doc: PDFDocument,
  variants: TextFontVariants,
): Promise<EmbeddedTextFonts> {
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(variants.regular, { subset: true });
  const bold = variants.bold ? await doc.embedFont(variants.bold, { subset: true }) : regular;
  const italic = variants.italic ? await doc.embedFont(variants.italic, { subset: true }) : regular;
  const boldItalic = variants.boldItalic
    ? await doc.embedFont(variants.boldItalic, { subset: true })
    : bold !== regular
      ? bold
      : italic;
  return {
    fontFor: (b, i) => (b && i ? boldItalic : b ? bold : i ? italic : regular),
  };
}
