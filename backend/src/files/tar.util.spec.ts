import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { FileManagerError } from "../common/errors";
import { buildFileTar, extractSingleFile, streamSingleFile } from "./tar.util";

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks);
}

describe("tar.util round-trip", () => {
  it("builds a single-entry tar that extracts back to the original bytes", async () => {
    const content = Buffer.from("hello\nworld\n", "utf8");
    const tar = await buildFileTar("greeting.txt", content, { mode: 0o644, uid: 0, gid: 0 });

    const extracted = await extractSingleFile(Readable.from(tar), 1024);

    expect(extracted.equals(content)).toBe(true);
  });

  it("preserves binary content", async () => {
    const content = Buffer.from([0, 1, 2, 255, 254, 0, 42]);
    const tar = await buildFileTar("blob.bin", content, { mode: 0o600, uid: 1000, gid: 1000 });

    const extracted = await extractSingleFile(Readable.from(tar), 1024);

    expect(extracted.equals(content)).toBe(true);
  });

  it("enforces the size cap on extract", async () => {
    const tar = await buildFileTar("big.txt", Buffer.alloc(100, 1), {
      mode: 0o644,
      uid: 0,
      gid: 0,
    });

    await expect(extractSingleFile(Readable.from(tar), 10)).rejects.toBeInstanceOf(
      FileManagerError,
    );
  });

  it("streams the single entry's raw bytes", async () => {
    const content = Buffer.from("streamed");
    const tar = await buildFileTar("s.txt", content, { mode: 0o644, uid: 0, gid: 0 });

    const stream = await streamSingleFile(Readable.from(tar));

    expect((await collect(stream)).equals(content)).toBe(true);
  });
});
