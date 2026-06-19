// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { PageGeometry, StickyNote } from "../model/document";
import { userSpacePoint } from "../model/geometry";
import { bindNoteControl, bindNoteDelete, buildNoteControl, noteTextInput } from "./noteOverlay";

const page: PageGeometry = { index: 0, width: 612, height: 792, rotation: 0 };
const viewport = { scale: 1 };

function note(overrides: Partial<StickyNote> = {}): StickyNote {
  return {
    kind: "note",
    id: "n1",
    page: 0,
    origin: userSpacePoint(100, 650),
    text: "review this",
    ...overrides,
  };
}

describe("buildNoteControl (DOM)", () => {
  it("carries the annotation id and kind, and is positioned in px", () => {
    const control = buildNoteControl(note(), page, viewport);
    expect(control.dataset.annotationId).toBe("n1");
    expect(control.dataset.annotationKind).toBe("note");
    expect(control.style.left).toMatch(/px$/);
    expect(control.style.top).toMatch(/px$/);
  });

  it("shows the comment in the popup textarea", () => {
    const control = buildNoteControl(note(), page, viewport);
    expect(noteTextInput(control).value).toBe("review this");
  });

  it("opens and closes the popup when the icon is toggled", () => {
    const control = buildNoteControl(note(), page, viewport);
    const icon = control.querySelector<HTMLButtonElement>(".note-icon")!;
    expect(control.classList.contains("open")).toBe(false);
    icon.click();
    expect(control.classList.contains("open")).toBe(true);
    expect(icon.getAttribute("aria-expanded")).toBe("true");
    icon.click();
    expect(control.classList.contains("open")).toBe(false);
  });
});

describe("bindNoteControl (DOM)", () => {
  it("commits the edited comment on blur when it changed", () => {
    const control = buildNoteControl(note(), page, viewport);
    const onCommit = vi.fn();
    bindNoteControl(control, note(), onCommit);
    const input = noteTextInput(control);
    input.value = "updated comment";
    input.dispatchEvent(new Event("blur"));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "n1", text: "updated comment" }),
    );
  });

  it("does not commit when the comment is unchanged", () => {
    const control = buildNoteControl(note(), page, viewport);
    const onCommit = vi.fn();
    bindNoteControl(control, note(), onCommit);
    noteTextInput(control).dispatchEvent(new Event("blur"));
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("bindNoteDelete (DOM)", () => {
  it("calls onDelete with the note id", () => {
    const control = buildNoteControl(note(), page, viewport);
    const onDelete = vi.fn();
    bindNoteDelete(control, note(), onDelete);
    control.querySelector<HTMLButtonElement>(".note-delete")?.click();
    expect(onDelete).toHaveBeenCalledWith("n1");
  });
});
