import { describe, expect, it } from "vitest";
import { DatabaseError } from "../common/errors";
import { requireRow } from "./query-helpers";

describe("requireRow", () => {
  it("returns the first row of a non-empty result", () => {
    expect(requireRow([{ id: "a" }, { id: "b" }], "missing")).toEqual({ id: "a" });
  });

  it("throws a DatabaseError with the given message when the result is empty", () => {
    expect(() => requireRow([], "deployment insert returned no row")).toThrowError(DatabaseError);
    expect(() => requireRow([], "deployment insert returned no row")).toThrowError(
      "deployment insert returned no row",
    );
  });
});
