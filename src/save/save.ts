import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  rgb,
  type PDFFont,
  type PDFForm,
  type PDFPage,
} from "pdf-lib";
import type { DocumentModel, FieldValue, TextBox } from "../model/document";
import { embedUnicodeFont } from "./font";

/** Inputs the projection needs from outside the pure model (e.g. font bytes). */
export interface SaveOptions {
  /** Bytes of the Unicode text font, required only when text boxes are present. */
  readonly fontBytes?: Uint8Array;
}

/** Select a radio option, accepting either the option name or its index. */
function selectRadio(group: PDFRadioGroup, value: string): void {
  const options = group.getOptions();
  // The UI value is pdf.js's on-state (often a positional index like "1"),
  // while pdf-lib selects by the /Opt export value (e.g. "blue"). Match by name
  // if it exists, otherwise treat the value as an index into the options.
  const option = options.includes(value) ? value : options[Number(value)];
  if (option !== undefined) {
    group.select(option);
  }
}

function applyFieldValue(form: PDFForm, { fieldName, value }: FieldValue): void {
  let field;
  try {
    field = form.getField(fieldName);
  } catch {
    return; // field no longer present; ignore stale value
  }

  if (field instanceof PDFTextField) {
    field.setText(typeof value === "string" ? value : String(value));
  } else if (field instanceof PDFCheckBox) {
    if (value === true) {
      field.check();
    } else {
      field.uncheck();
    }
  } else if (field instanceof PDFRadioGroup) {
    selectRadio(field, String(value));
  } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    field.select(String(value));
  }
}

/**
 * Draw one text box onto its page. The model stores the origin as the box's
 * bottom-left in unrotated user space — exactly pdf-lib's drawing space — so the
 * coordinate maps straight through with no rotation maths (the seam handles
 * rotation only for the screen). The baseline sits at the origin's y.
 */
function drawTextBox(page: PDFPage, font: PDFFont, box: TextBox): void {
  if (box.text.length === 0) {
    return;
  }
  page.drawText(box.text, {
    x: box.origin.x,
    y: box.origin.y,
    size: box.fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

/**
 * The save side of the seam: a pure projection from the document model to PDF
 * bytes via pdf-lib. No DOM, so it is fully unit-testable with golden-file
 * round-trips. Field values are applied through the AcroForm; appearances are
 * regenerated so the values show in every viewer. Text boxes are drawn with the
 * embedded Unicode font. Signatures (m4-5) extend this projection.
 */
export async function saveModel(
  model: DocumentModel,
  options: SaveOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(model.sourceBytes);

  if (model.fieldValues.length > 0) {
    const form = doc.getForm();
    for (const fieldValue of model.fieldValues) {
      applyFieldValue(form, fieldValue);
    }
    form.updateFieldAppearances();
  }

  const textBoxes = model.annotations.filter((a): a is TextBox => a.kind === "text");
  if (textBoxes.length > 0) {
    if (!options.fontBytes) {
      throw new Error("saveModel: fontBytes are required to draw text annotations");
    }
    const font = await embedUnicodeFont(doc, options.fontBytes);
    const pages = doc.getPages();
    for (const box of textBoxes) {
      const page = pages[box.page];
      if (page) {
        drawTextBox(page, font, box);
      }
    }
  }

  return doc.save();
}
