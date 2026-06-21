import { posix } from "node:path";
import { FileManagerError } from "../common/errors";

// Every file operation is confined to the volume mounted at /mnt inside the helper container.
export const VOLUME_ROOT = "/mnt";

const MAX_PATH_LENGTH = 4096;
const MAX_NAME_LENGTH = 255;

// Turns a user-supplied, volume-relative path into a safe absolute path under /mnt. Input is always
// treated as relative to the volume root (a leading slash is just "from the root"); any `..` segment
// is rejected outright rather than clamped, so traversal can never resolve outside the volume.
export function containerPath(userPath: string): string {
  if (typeof userPath !== "string") {
    throw new FileManagerError("path must be a string");
  }

  if (userPath.includes("\0")) {
    throw new FileManagerError("path contains a null byte");
  }

  if (userPath.length > MAX_PATH_LENGTH) {
    throw new FileManagerError("path is too long");
  }

  const segments = userPath.split("/").filter((segment) => segment.length > 0 && segment !== ".");

  for (const segment of segments) {
    if (segment === "..") {
      throw new FileManagerError("path escapes the volume");
    }

    if (segment.length > MAX_NAME_LENGTH) {
      throw new FileManagerError("path component is too long");
    }
  }

  return segments.length > 0 ? `${VOLUME_ROOT}/${segments.join("/")}` : VOLUME_ROOT;
}

// Validates a single new file/folder name (no path separators, no traversal, no NUL).
export function assertBasename(name: string): string {
  if (
    !name ||
    name.includes("/") ||
    name.includes("\0") ||
    name === "." ||
    name === ".." ||
    name.length > MAX_NAME_LENGTH
  ) {
    throw new FileManagerError("invalid name");
  }

  return name;
}

// Splits an absolute /mnt path into its parent directory and basename (both already validated).
export function parentAndName(absPath: string): { dir: string; name: string } {
  return { dir: posix.dirname(absPath), name: posix.basename(absPath) };
}

export function basename(absPath: string): string {
  return posix.basename(absPath);
}
