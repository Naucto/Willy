import { useSnackbar } from "notistack";
import { useCallback } from "react";
import { describeError } from "./errors";

type SnackbarVariant = "success" | "error";

export type RunAction = (
  action: (() => Promise<unknown>) | Promise<unknown>,
  successMessage?: string,
) => Promise<boolean>;

// Pure core of useAction, decoupled from notistack so it's unit-testable. Awaits the action, toasts the
// optional success message on resolve, toasts describeError() on throw, and returns whether it
// succeeded (so callers can e.g. close a dialog only on success).
export async function runWithFeedback(
  action: (() => Promise<unknown>) | Promise<unknown>,
  enqueue: (message: string, variant: SnackbarVariant) => void,
  successMessage?: string,
): Promise<boolean> {
  try {
    await (typeof action === "function" ? action() : action);

    if (successMessage) {
      enqueue(successMessage, "success");
    }

    return true;
  } catch (error) {
    enqueue(describeError(error), "error");

    return false;
  }
}

// Runs an async action (typically a mutation) with consistent snackbar feedback. Replaces the
// hand-rolled `try { await …; enqueueSnackbar(ok) } catch { enqueueSnackbar(describeError(e)) }` copies
// scattered across components.
export function useAction(): RunAction {
  const { enqueueSnackbar } = useSnackbar();

  return useCallback(
    (action, successMessage) =>
      runWithFeedback(
        action,
        (message, variant) => enqueueSnackbar(message, { variant }),
        successMessage,
      ),
    [enqueueSnackbar],
  );
}
