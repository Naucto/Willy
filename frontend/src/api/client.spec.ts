import { describe, expect, it } from "vitest";
import { ApiError, unwrap } from "./client";

function result<T>(init: { data?: T; error?: unknown; status: number }) {
  const value: { data?: T; error?: unknown; response: Response } = {
    response: new Response(null, { status: init.status }),
  };

  if (init.data !== undefined) {
    value.data = init.data;
  }

  if (init.error !== undefined) {
    value.error = init.error;
  }

  return value;
}

describe("unwrap", () => {
  it("returns data on success", () => {
    expect(unwrap(result({ data: { ok: true }, status: 200 }))).toEqual({ ok: true });
  });

  it("returns undefined for a 204 no-content response", () => {
    expect(unwrap(result({ status: 204 }))).toBeUndefined();
  });

  it("throws an ApiError carrying the status on failure", () => {
    try {
      unwrap(result({ error: { message: "nope" }, status: 403 }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(403);
      expect((error as ApiError).message).toBe("nope");
    }
  });

  it("joins array validation messages", () => {
    try {
      unwrap(result({ error: { message: ["a", "b"] }, status: 400 }));
      expect.unreachable();
    } catch (error) {
      expect((error as ApiError).message).toBe("a, b");
    }
  });
});
