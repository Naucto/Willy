import type { DirEntryDto, FileEntryType } from "./dto/file-entry.dto";

// Parsed `stat -c %f|%s|%u|%g|%Y` output for one path: file type + permission bits + ids + size/mtime.
export interface StatInfo {
  type: FileEntryType;
  // Permission bits only (mode & 07777).
  perm: number;
  uid: number;
  gid: number;
  size: number;
  mtimeMs: number;
}

export function fileType(rawMode: number): FileEntryType {
  const fmt = rawMode & 0o170000;

  if (fmt === 0o040000) {
    return "dir";
  }

  if (fmt === 0o100000) {
    return "file";
  }

  if (fmt === 0o120000) {
    return "symlink";
  }

  return "other";
}

// Parses one `stat -c %f|%s|%u|%g|%Y` line (the %f mode is hex). Returns null on a malformed line.
export function parseStatLine(line: string): StatInfo | null {
  const parts = line.split("|");

  if (parts.length < 5) {
    return null;
  }

  const raw = Number.parseInt(parts[0] ?? "", 16);

  if (Number.isNaN(raw)) {
    return null;
  }

  return {
    type: fileType(raw),
    perm: raw & 0o7777,
    size: Number(parts[1]),
    uid: Number(parts[2]),
    gid: Number(parts[3]),
    mtimeMs: Number(parts[4]) * 1000,
  };
}

export function modeOctal(perm: number): string {
  return perm.toString(8).padStart(4, "0");
}

export function modeHuman(perm: number): string {
  const bits = ["r", "w", "x"];

  return [6, 3, 0]
    .map((shift) =>
      bits.map((flag, index) => ((perm >> (shift + (2 - index))) & 1 ? flag : "-")).join(""),
    )
    .join("");
}

export function toEntry(name: string, info: StatInfo): DirEntryDto {
  return {
    name,
    type: info.type,
    size: info.size,
    mode: modeOctal(info.perm),
    modeHuman: modeHuman(info.perm),
    uid: info.uid,
    gid: info.gid,
    mtime: new Date(info.mtimeMs).toISOString(),
  };
}
