import { describe, expect, it } from "vitest";
import { runWithFeedback } from "./useAction";

describe("runWithFeedback", () => {
  const collect = () => {
    const calls: Array<{ message: string; variant: "success" | "error" }> = [];

    return {
      calls,
      enqueue: (message: string, variant: "success" | "error") => calls.push({ message, variant }),
    };
  };

  it("toasts the success message and returns true when the action resolves", async () => {
    const { calls, enqueue } = collect();

    const ok = await runWithFeedback(() => Promise.resolve(), enqueue, "Saved");

    expect(ok).toBe(true);
    expect(calls).toEqual([{ message: "Saved", variant: "success" }]);
  });

  it("stays silent on success when no message is given", async () => {
    const { calls, enqueue } = collect();

    const ok = await runWithFeedback(Promise.resolve(), enqueue);

    expect(ok).toBe(true);
    expect(calls).toEqual([]);
  });

  it("toasts the described error and returns false when the action throws", async () => {
    const { calls, enqueue } = collect();

    const ok = await runWithFeedback(() => Promise.reject(new Error("boom")), enqueue, "Saved");

    expect(ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.variant).toBe("error");
    expect(calls[0]?.message).toContain("boom");
  });
});
