import { DatabaseError } from "../common/errors";

// Returns the first row of a write's RETURNING result, throwing a DatabaseError when the write
// produced no row — an invariant violation that should never happen in practice. Centralizes the
// repeated `const [row] = await …returning(); if (!row) throw new DatabaseError(…)` boilerplate.
export function requireRow<T>(rows: T[], message: string): T {
  const row = rows[0];

  if (!row) {
    throw new DatabaseError(message);
  }

  return row;
}
