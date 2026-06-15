// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Viewport } from "../model/coords";
import type { PageGeometry } from "../model/document";
import type { FormField } from "./fields";
import { applyFieldValue, bindFieldControl, buildFieldControl } from "./overlay";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport: Viewport = { scale: 1 };
const rect = { x: 10, y: 10, width: 20, height: 20 };

function control(field: FormField): HTMLInputElement {
  const element = buildFieldControl(field, page, viewport);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("expected an input control");
  }
  return element;
}

describe("buildFieldControl (DOM)", () => {
  it("builds a checkbox carrying its on-value and field name", () => {
    const checkbox = control({
      name: "check.agree",
      kind: "checkbox",
      page: 0,
      rect,
      onValue: "Yes",
    });
    expect(checkbox.type).toBe("checkbox");
    expect(checkbox.dataset.fieldName).toBe("check.agree");
    expect(checkbox.value).toBe("Yes");
  });

  it("builds radios that share a group name and stay mutually exclusive", () => {
    const red = control({ name: "radio.color", kind: "radio", page: 0, rect, onValue: "0" });
    const blue = control({ name: "radio.color", kind: "radio", page: 0, rect, onValue: "1" });
    document.body.append(red, blue);

    expect(red.type).toBe("radio");
    expect(red.name).toBe("radio.color");
    expect(blue.value).toBe("1");

    red.checked = true;
    blue.checked = true;
    expect(red.checked).toBe(false); // selecting blue deselects red
  });

  it("positions the control with absolute CSS pixels", () => {
    const checkbox = control({ name: "c", kind: "checkbox", page: 0, rect, onValue: "Yes" });
    expect(checkbox.style.left).toMatch(/px$/);
    expect(checkbox.style.width).toMatch(/px$/);
  });

  it("builds a dropdown with options in order and captures selection", () => {
    const element = buildFieldControl(
      {
        name: "choice.city",
        kind: "dropdown",
        page: 0,
        rect,
        options: ["London", "Paris", "Tokyo"],
      },
      page,
      viewport,
    );
    if (!(element instanceof HTMLSelectElement)) {
      throw new Error("expected a select");
    }
    expect([...element.options].map((option) => option.value)).toEqual([
      "London",
      "Paris",
      "Tokyo",
    ]);
    element.value = "Paris";
    expect(element.value).toBe("Paris");
  });

  it("builds an option list as a multi-row select", () => {
    const element = buildFieldControl(
      {
        name: "choice.fruit",
        kind: "optionlist",
        page: 0,
        rect,
        options: ["Apple", "Pear", "Plum"],
      },
      page,
      viewport,
    );
    if (!(element instanceof HTMLSelectElement)) {
      throw new Error("expected a select");
    }
    expect(element.size).toBeGreaterThan(1);
    expect([...element.options].map((option) => option.textContent)).toEqual([
      "Apple",
      "Pear",
      "Plum",
    ]);
  });
});

describe("field binding", () => {
  const text: FormField = { name: "text.fullName", kind: "text", page: 0, rect };

  it("reports text edits through onEdit", () => {
    const input = buildFieldControl(text, page, viewport) as HTMLInputElement;
    const edits: Array<[string, string | boolean]> = [];
    bindFieldControl(input, text, (name, value) => edits.push([name, value]));
    input.value = "Ada";
    input.dispatchEvent(new Event("input"));
    expect(edits).toEqual([["text.fullName", "Ada"]]);
  });

  it("reports a checkbox toggle as a boolean", () => {
    const field: FormField = {
      name: "check.agree",
      kind: "checkbox",
      page: 0,
      rect,
      onValue: "Yes",
    };
    const box = buildFieldControl(field, page, viewport) as HTMLInputElement;
    let captured: string | boolean | undefined;
    bindFieldControl(box, field, (_name, value) => (captured = value));
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(captured).toBe(true);
  });

  it("reports the selected radio's value only when it becomes checked", () => {
    const field: FormField = { name: "radio.color", kind: "radio", page: 0, rect, onValue: "1" };
    const radio = buildFieldControl(field, page, viewport) as HTMLInputElement;
    const seen: Array<string | boolean> = [];
    bindFieldControl(radio, field, (_name, value) => seen.push(value));
    radio.checked = true;
    radio.dispatchEvent(new Event("change"));
    expect(seen).toEqual(["1"]);
  });

  it("applies a model value back onto the control (re-render reflects the model)", () => {
    const input = buildFieldControl(text, page, viewport) as HTMLInputElement;
    applyFieldValue(input, "text", "Grace");
    expect(input.value).toBe("Grace");

    const field: FormField = { name: "radio.color", kind: "radio", page: 0, rect, onValue: "1" };
    const radio = buildFieldControl(field, page, viewport) as HTMLInputElement;
    applyFieldValue(radio, "radio", "1");
    expect(radio.checked).toBe(true);
    applyFieldValue(radio, "radio", "0");
    expect(radio.checked).toBe(false);
  });
});
