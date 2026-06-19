import { modelToScreen, type Viewport } from "../model/coords";
import type { PageGeometry, StickyNote } from "../model/document";
import { icon } from "../app/icons";

// The sticky-note overlay: a fixed-size pin at the note's anchor with a popup
// that shows and edits the comment. Like the other overlays it holds no state —
// the anchor is placed through the one coordinate seam (modelToScreen) and the
// only edits, the comment and delete, route back to the model (invariant 1). The
// icon is a constant screen size (it does not scale with zoom), so the model
// stores just the anchor point; the pin's base sits at that point.

/** The pin's on-screen height, used to seat its base at the anchor. */
const NOTE_ICON_PX = 22;

/** The popup's editable comment textarea. */
export function noteTextInput(container: HTMLElement): HTMLTextAreaElement {
  const input = container.querySelector<HTMLTextAreaElement>(".note-text");
  if (!input) {
    throw new Error("note control is missing its textarea");
  }
  return input;
}

/**
 * Build the control for a sticky note: a positioned container with a pin button
 * and a popup holding the comment textarea and a delete button. The popup opens
 * on the pin (toggling `open` and aria-expanded); the value comes from the model.
 */
export function buildNoteControl(
  note: StickyNote,
  page: PageGeometry,
  viewport: Viewport,
): HTMLElement {
  const anchor = modelToScreen(note.origin, page, viewport);

  const container = document.createElement("div");
  container.className = "note";
  container.dataset.annotationId = note.id;
  container.dataset.annotationKind = "note";
  container.style.left = `${anchor.x}px`;
  container.style.top = `${anchor.y - NOTE_ICON_PX}px`;

  const pin = document.createElement("button");
  pin.type = "button";
  pin.className = "note-icon";
  pin.setAttribute("aria-label", "Sticky note");
  pin.setAttribute("aria-expanded", "false");
  pin.innerHTML = icon("note");
  pin.addEventListener("click", () => {
    const open = container.classList.toggle("open");
    pin.setAttribute("aria-expanded", String(open));
    if (open) {
      noteTextInput(container).focus();
    }
  });
  container.appendChild(pin);

  const popup = document.createElement("div");
  popup.className = "note-popup";
  // Keep pointer-downs from bubbling to the page/overlay (which would start a
  // placement or clear selection); the popup handles its own events.
  popup.addEventListener("pointerdown", (event) => event.stopPropagation());

  const input = document.createElement("textarea");
  input.className = "note-text";
  input.value = note.text;
  input.setAttribute("aria-label", "Note comment");
  popup.appendChild(input);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "note-delete";
  remove.setAttribute("aria-label", "Delete note");
  remove.textContent = "Delete";
  popup.appendChild(remove);

  container.appendChild(popup);
  return container;
}

/**
 * Wire the comment's edits to the model: commit on blur only when the text
 * changed, and close the popup on Escape (reverting the textarea), so the model
 * stays the single source of truth.
 */
export function bindNoteControl(
  container: HTMLElement,
  note: StickyNote,
  onCommit: (updated: StickyNote) => void,
): void {
  const input = noteTextInput(container);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      input.value = note.text;
      closePopup(container);
    }
  });
  input.addEventListener("blur", () => {
    if (input.value !== note.text) {
      onCommit({ ...note, text: input.value });
    }
  });
}

/** Wire the delete button so clicking it removes this note from the model. */
export function bindNoteDelete(
  container: HTMLElement,
  note: StickyNote,
  onDelete: (id: string) => void,
): void {
  const button = container.querySelector<HTMLButtonElement>(".note-delete");
  button?.addEventListener("click", () => onDelete(note.id));
}

function closePopup(container: HTMLElement): void {
  container.classList.remove("open");
  container.querySelector(".note-icon")?.setAttribute("aria-expanded", "false");
}
