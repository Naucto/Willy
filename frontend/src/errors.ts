/**
 * Base for all frontend errors. Derive named subclasses so failures are typed and
 * catchable by class rather than by string matching.
 */
export class WillyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);

    this.name = new.target.name;
  }
}

export class MissingRootElementError extends WillyError {}

// A React context hook (e.g. useAuth) was called outside its provider — a programming error.
export class ContextUsageError extends WillyError {}

// Best-effort human-readable message for any thrown value (for toasts/logs).
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Unexpected error";
}
