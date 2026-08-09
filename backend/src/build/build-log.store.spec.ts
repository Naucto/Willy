import { describe, expect, it, vi } from "vitest";
import type { LogStorageService } from "../logs/log-storage.service";
import { BuildLogStore } from "./build-log.store";

const TOKEN = "github_pat_11AKTHUPI0sctcbchD5UL0_mBazd47zSjYTLSYz9d7uQqunde0dHsvWNNAAXl8jJy9";

describe("BuildLogStore", () => {
  it("scrubs credentials out of every appended line before it is persisted", () => {
    const append = vi.fn();
    const store = new BuildLogStore({ append } as unknown as LogStorageService);

    store.append(
      "rel-1",
      `fatal: could not read from https://x-access-token:${TOKEN}@github.com/a/b`,
    );

    const [, persisted] = append.mock.calls[0] as [string, string];

    expect(persisted).not.toContain(TOKEN);
    expect(persisted).toContain("https://x-access-token:***@github.com/a/b");
  });
});
