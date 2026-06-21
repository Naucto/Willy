import { Readable } from "node:stream";
import { extract, pack } from "tar-stream";
import { FileManagerError } from "../common/errors";

export interface TarFileMeta {
  mode: number;
  uid: number;
  gid: number;
}

// Builds a one-entry tar archive carrying a file's bytes + ownership/mode, ready for
// Container.putArchive (which extracts it into a target directory). The entry name is the basename;
// putArchive's `path` option chooses the destination directory.
export function buildFileTar(name: string, content: Buffer, meta: TarFileMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = pack();
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    archive.entry(
      { name, size: content.length, mode: meta.mode, uid: meta.uid, gid: meta.gid, type: "file" },
      content,
      (error) => {
        if (error) {
          reject(error);

          return;
        }

        archive.finalize();
      },
    );
  });
}

// Reads the first regular file out of a tar stream (as produced by Container.getArchive on a single
// file), enforcing a byte cap. Used to pull file content back for the editor.
export function extractSingleFile(
  tarStream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parser = extract();
    let settled = false;

    parser.on("entry", (header, stream, next) => {
      if (settled || header.type !== "file") {
        stream.on("end", next);
        stream.resume();

        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;

      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;

        if (size > maxBytes) {
          settled = true;
          reject(new FileManagerError("file is too large to read"));
          stream.destroy();

          return;
        }

        chunks.push(chunk);
      });
      stream.on("end", () => {
        if (!settled) {
          settled = true;
          resolve(Buffer.concat(chunks));
        }

        next();
      });
      stream.on("error", reject);
    });
    parser.on("finish", () => {
      if (!settled) {
        reject(new FileManagerError("file not found in archive"));
      }
    });
    parser.on("error", reject);

    tarStream.pipe(parser);
  });
}

// Returns a readable of the first regular file's raw bytes from a tar stream, without buffering the
// whole file — used for streaming downloads. The helper is kept busy until this stream ends.
export function streamSingleFile(tarStream: NodeJS.ReadableStream): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const parser = extract();
    let found = false;

    parser.on("entry", (header, stream, next) => {
      if (!found && header.type === "file") {
        found = true;
        stream.on("end", next);
        stream.on("error", () => next());
        resolve(stream as unknown as Readable);

        return;
      }

      stream.on("end", next);
      stream.resume();
    });
    parser.on("finish", () => {
      if (!found) {
        reject(new FileManagerError("file not found in archive"));
      }
    });
    parser.on("error", reject);

    tarStream.pipe(parser);
  });
}
