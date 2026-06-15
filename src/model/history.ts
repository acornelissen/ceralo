import type { DocumentModel } from "./document";

// Undo/redo as a stack of immutable model snapshots. This is cheap because the
// mutators already share structure: every snapshot keeps the same sourceBytes
// reference (which may be tens of MB) and differs only in the small mutable
// parts (fieldValues, annotations, dirty). Depth is bounded so a long editing
// session cannot grow memory without limit.

/** Maximum number of undo steps retained; older snapshots are dropped. */
const MAX_DEPTH = 100;

export interface History {
  /** Snapshots older than the present, oldest first. */
  readonly past: readonly DocumentModel[];
  /** The current model. */
  readonly present: DocumentModel;
  /** Snapshots undone away, newest-undone first (next redo at index 0). */
  readonly future: readonly DocumentModel[];
}

/** Start a history at the given model with nothing to undo or redo. */
export function createHistory(model: DocumentModel): History {
  return { past: [], present: model, future: [] };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

/**
 * Record a new edit as the present, pushing the old present onto the undo stack
 * and clearing the redo branch. Bounds the undo depth by dropping the oldest.
 */
export function record(history: History, model: DocumentModel): History {
  const past = [...history.past, history.present];
  return {
    past: past.length > MAX_DEPTH ? past.slice(past.length - MAX_DEPTH) : past,
    present: model,
    future: [],
  };
}

/** Step back to the previous snapshot; a no-op (same object) at the start. */
export function undo(history: History): History {
  const previous = history.past.at(-1);
  if (!previous) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

/** Step forward to the next redone snapshot; a no-op (same object) at the end. */
export function redo(history: History): History {
  const next = history.future[0];
  if (!next) {
    return history;
  }
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

/**
 * Replace the present without adding an undo step (e.g. after Save flips the
 * dirty flag). Undo/redo stacks are untouched.
 */
export function replacePresent(history: History, model: DocumentModel): History {
  return { ...history, present: model };
}
