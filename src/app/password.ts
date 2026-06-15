import { PasswordRequiredError, WrongPasswordError } from "../pdf/document";

// Resolve an encrypted PDF by asking the user for a password and retrying. The
// "ask" function is injected so this loop is testable and free of any specific
// prompt UI: the app supplies an in-app dialog (window.prompt is unsupported in
// the Tauri webview — it returns null, which silently cancelled the old flow).

/**
 * Open something that may need a password. `open` is called with no password
 * first; if it rejects needing one, `ask(incorrect)` is called to collect a
 * password and `open` is retried. Returns null if the user cancels (ask returns
 * null). Non-password errors propagate.
 */
export async function openWithPassword<T>(
  open: (password?: string) => Promise<T>,
  ask: (incorrect: boolean) => Promise<string | null>,
): Promise<T | null> {
  let password: string | undefined;
  for (;;) {
    try {
      return await open(password);
    } catch (error) {
      if (error instanceof PasswordRequiredError || error instanceof WrongPasswordError) {
        const entered = await ask(error instanceof WrongPasswordError);
        if (entered === null) {
          return null; // user cancelled
        }
        password = entered;
        continue;
      }
      throw error;
    }
  }
}
