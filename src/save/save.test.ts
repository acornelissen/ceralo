import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createModel, setFieldValue } from "../model/document";
import { loadPdfDocument } from "../pdf/document";
import { saveModel } from "./save";

interface PdfWidget {
  subtype?: string;
  fieldName?: string;
  fieldValue?: string | string[] | null;
}

/** Read each field's persisted value from the saved bytes via pdf.js. */
async function fieldValues(bytes: Uint8Array): Promise<Record<string, string | null>> {
  const doc = await loadPdfDocument(bytes);
  const result: Record<string, string | null> = {};
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const widgets = (await (
      await doc.getPage(pageNumber)
    ).getAnnotations()) as unknown as PdfWidget[];
    for (const widget of widgets) {
      if (widget.subtype !== "Widget" || !widget.fieldName || widget.fieldName in result) {
        continue;
      }
      const value = Array.isArray(widget.fieldValue)
        ? (widget.fieldValue[0] ?? null)
        : widget.fieldValue;
      result[widget.fieldName] = value ?? null;
    }
  }
  return result;
}

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))),
  );
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await loadPdfDocument(bytes)).numPages;
}

async function fieldNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await loadPdfDocument(bytes);
  const fields = await doc.getFieldObjects();
  return Object.keys(fields ?? {}).sort();
}

// Encrypted fixtures are excluded here; encrypted handling is m1-12.
const nonXfaFixtures = ["two-page.pdf", "rotated-90.pdf", "acroform.pdf", "linearized.pdf"];

describe("saveModel empty round-trip", () => {
  it.each(nonXfaFixtures)("preserves page count and AcroForm field set for %s", async (name) => {
    const original = fixture(name);
    const saved = await saveModel(createModel(original));

    expect(await pageCount(saved)).toBe(await pageCount(original));
    expect(await fieldNames(saved)).toEqual(await fieldNames(original));
  });

  it("writes every field type and they persist on re-open", async () => {
    let model = createModel(fixture("acroform.pdf"));
    model = setFieldValue(model, "text.fullName", "Ada Lovelace");
    model = setFieldValue(model, "check.agree", true);
    model = setFieldValue(model, "radio.color", "1");
    model = setFieldValue(model, "choice.city", "Paris");
    model = setFieldValue(model, "choice.fruit", "Pear");

    const values = await fieldValues(await saveModel(model));

    expect(values["text.fullName"]).toBe("Ada Lovelace");
    expect(values["check.agree"]).toBe("Yes");
    expect(values["radio.color"]).toBe("1");
    expect(values["choice.city"]).toBe("Paris");
    expect(values["choice.fruit"]).toBe("Pear");
  });

  it("returns fresh bytes without touching the source", async () => {
    const original = fixture("two-page.pdf");
    const model = createModel(original);
    const saved = await saveModel(model);
    expect(saved).toBeInstanceOf(Uint8Array);
    expect(model.sourceBytes).toBe(original);
  });
});
