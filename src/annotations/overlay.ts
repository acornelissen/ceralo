import type { Viewport } from "../model/coords";
import type { PageGeometry, TextBox } from "../model/document";
import { screenPoint, type ScreenPoint } from "../model/geometry";
import { moveTextBox, resizeTextBox, textBoxScreenRect, type ScreenRect } from "./transform";

// The text-annotation overlay: a positioned, editable HTML layer drawn over the
// rendered page. Like the form overlay it holds no state of its own — the box is
// placed through the one coordinate seam (textBoxScreenRect) and every edit,
// move, resize and delete (m3-5) routes back to the model (invariant 1).
//
// Each box is a container holding a move grip, an inner textarea and a resize
// handle. The grip and handle are the drag targets so dragging never fights text
// selection inside the textarea.

// Re-exported so callers and tests have one import site for the overlay surface.
export { textBoxScreenRect, type ScreenRect } from "./transform";

function position(element: HTMLElement, rect: ScreenRect): void {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

/** The inner editable textarea of a text-box container. */
export function textBoxInput(container: HTMLElement): HTMLTextAreaElement {
  const input = container.querySelector<HTMLTextAreaElement>(".text-box-input");
  if (!input) {
    throw new Error("text box container is missing its input");
  }
  return input;
}

/**
 * Build the control for a text box: a positioned container with a move grip and
 * an editable textarea. The font size is scaled by the viewport so on-screen
 * text tracks the rendered page; the value comes from the model. Binding happens
 * in bindTextBoxControl (edit) and bindTextBoxDrag (move).
 */
export function buildTextBoxControl(
  box: TextBox,
  page: PageGeometry,
  viewport: Viewport,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "text-box";
  container.dataset.annotationId = box.id;
  position(container, textBoxScreenRect(box, page, viewport));

  const grip = document.createElement("div");
  grip.className = "text-box-grip";
  grip.setAttribute("aria-hidden", "true");
  container.appendChild(grip);

  const input = document.createElement("textarea");
  input.className = "text-box-input";
  input.value = box.text;
  input.setAttribute("aria-label", "Text annotation");
  input.style.fontSize = `${box.fontSize * viewport.scale}px`;
  container.appendChild(input);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "text-box-delete";
  remove.setAttribute("aria-label", "Delete text annotation");
  remove.textContent = "×"; // ×
  container.appendChild(remove);

  const handle = document.createElement("div");
  handle.className = "text-box-resize";
  handle.setAttribute("aria-hidden", "true");
  container.appendChild(handle);

  return container;
}

/**
 * Wire a text box's edits to the model. The edit commits on blur or Enter (only
 * when the text actually changed); Escape reverts the control and commits
 * nothing, so the model stays the single source of truth.
 */
export function bindTextBoxControl(
  container: HTMLElement,
  box: TextBox,
  onCommit: (updated: TextBox) => void,
): void {
  const input = textBoxInput(container);
  let cancelled = false;

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      input.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelled = true;
      input.value = box.text;
      input.blur();
    }
  });

  input.addEventListener("blur", () => {
    if (cancelled) {
      cancelled = false;
      return;
    }
    if (input.value !== box.text) {
      onCommit({ ...box, text: input.value });
    }
  });
}

/**
 * Wire the delete button so clicking it removes this box from the model. The
 * caller commits with removeAnnotation, keeping the model the single source of
 * truth.
 */
export function bindTextBoxDelete(
  container: HTMLElement,
  box: TextBox,
  onDelete: (id: string) => void,
): void {
  const button = container.querySelector<HTMLButtonElement>(".text-box-delete");
  button?.addEventListener("click", () => onDelete(box.id));
}

/**
 * Drag plumbing shared by the move grip and resize handle. On pointer-down it
 * tracks the pointer on the window; `onLive` gets the running screen delta for
 * visual feedback, and `onDone` gets the start/end screen points once, unless
 * the pointer never moved (a click).
 */
function onHandleDrag(
  handle: HTMLElement,
  onStart: () => void,
  onLive: (dx: number, dy: number) => void,
  onDone: (from: ScreenPoint, to: ScreenPoint) => void,
): void {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    onStart();
    const startX = event.clientX;
    const startY = event.clientY;

    const onPointerMove = (move: PointerEvent): void => {
      onLive(move.clientX - startX, move.clientY - startY);
    };

    const onPointerUp = (up: PointerEvent): void => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (up.clientX === startX && up.clientY === startY) {
        return; // a click, not a drag
      }
      onDone(screenPoint(startX, startY), screenPoint(up.clientX, up.clientY));
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
}

/**
 * Wire the move grip so dragging it repositions the box. The container follows
 * the pointer for live feedback; the committed move (origin in user space) is
 * computed through the seam and pushed to the model once on pointer-up.
 */
export function bindTextBoxDrag(
  container: HTMLElement,
  box: TextBox,
  page: PageGeometry,
  viewport: Viewport,
  onMove: (updated: TextBox) => void,
): void {
  const grip = container.querySelector<HTMLElement>(".text-box-grip");
  if (!grip) {
    return;
  }
  let left = 0;
  let top = 0;
  onHandleDrag(
    grip,
    () => {
      left = Number.parseFloat(container.style.left) || 0;
      top = Number.parseFloat(container.style.top) || 0;
    },
    (dx, dy) => {
      container.style.left = `${left + dx}px`;
      container.style.top = `${top + dy}px`;
    },
    (from, to) => onMove(moveTextBox(box, from, to, page, viewport)),
  );
}

/**
 * Wire the resize handle so dragging it grows or shrinks the box. The container
 * resizes live in screen pixels; the committed size (user space, rotation-aware)
 * is computed through the seam and pushed to the model on pointer-up.
 */
export function bindTextBoxResize(
  container: HTMLElement,
  box: TextBox,
  page: PageGeometry,
  viewport: Viewport,
  onResize: (updated: TextBox) => void,
): void {
  const handle = container.querySelector<HTMLElement>(".text-box-resize");
  if (!handle) {
    return;
  }
  let width = 0;
  let height = 0;
  onHandleDrag(
    handle,
    () => {
      width = Number.parseFloat(container.style.width) || 0;
      height = Number.parseFloat(container.style.height) || 0;
    },
    (dx, dy) => {
      container.style.width = `${Math.max(1, width + dx)}px`;
      container.style.height = `${Math.max(1, height + dy)}px`;
    },
    (from, to) => onResize(resizeTextBox(box, from, to, page, viewport)),
  );
}
