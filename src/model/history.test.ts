import { describe, expect, it } from "vitest";
import { createModel, setFieldValue, type DocumentModel } from "./document";
import { canRedo, canUndo, createHistory, record, redo, undo } from "./history";

const source = new Uint8Array([1, 2, 3]);

function base(): DocumentModel {
  return createModel(source);
}

describe("history", () => {
  it("starts with the given model and nothing to undo or redo", () => {
    const history = createHistory(base());
    expect(history.present.dirty).toBe(false);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("records an edit, making it undoable", () => {
    const start = base();
    const edited = setFieldValue(start, "name", "Ada");
    const history = record(createHistory(start), edited);

    expect(history.present).toBe(edited);
    expect(canUndo(history)).toBe(true);
    expect(canRedo(history)).toBe(false);
  });

  it("undo restores the prior model and redo reapplies it", () => {
    const start = base();
    const edited = setFieldValue(start, "name", "Ada");
    let history = record(createHistory(start), edited);

    history = undo(history);
    expect(history.present).toBe(start);
    expect(canRedo(history)).toBe(true);

    history = redo(history);
    expect(history.present).toBe(edited);
  });

  it("a new edit after undo clears the redo branch", () => {
    const start = base();
    const first = setFieldValue(start, "name", "Ada");
    const second = setFieldValue(start, "name", "Grace");

    let history = record(createHistory(start), first);
    history = undo(history); // back to start, redo -> first available
    history = record(history, second); // branch off

    expect(history.present).toBe(second);
    expect(canRedo(history)).toBe(false);
    history = undo(history);
    expect(history.present).toBe(start);
  });

  it("undo/redo at the ends are no-ops", () => {
    const history = createHistory(base());
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it("bounds history depth, dropping the oldest snapshots", () => {
    let history = createHistory(base());
    for (let i = 0; i < 250; i += 1) {
      history = record(history, setFieldValue(history.present, "n", String(i)));
    }
    // Undo as far as possible; depth is capped well under 250.
    let steps = 0;
    while (canUndo(history)) {
      history = undo(history);
      steps += 1;
    }
    expect(steps).toBeLessThanOrEqual(100);
    expect(steps).toBeGreaterThan(0);
  });

  it("shares sourceBytes by reference across snapshots (never copies the bytes)", () => {
    const start = base();
    const history = record(createHistory(start), setFieldValue(start, "name", "Ada"));
    const restored = undo(history);
    expect(restored.present.sourceBytes).toBe(source);
    expect(redo(restored).present.sourceBytes).toBe(source);
  });
});
