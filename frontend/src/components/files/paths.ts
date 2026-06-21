// Volume-relative path helpers (POSIX, rooted at "/"). The tree uses absolute volume paths as node ids.

export function joinPath(parent: string, name: string): string {
  return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

export function dirOf(path: string): string {
  if (path === "/") {
    return "/";
  }

  const cut = path.lastIndexOf("/");

  return cut <= 0 ? "/" : path.slice(0, cut);
}

export function baseOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

// Proposes a non-colliding name for "keep both" on a move/upload conflict, preserving the extension:
// "test.txt" → "test (2).txt", bumping the number until it's free.
export function suggestCopyName(name: string, taken: string[]): string {
  const set = new Set(taken);

  if (!set.has(name)) {
    return name;
  }

  const dot = name.lastIndexOf(".");
  const hasExt = dot > 0;
  const base = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : "";
  let index = 2;

  while (set.has(`${base} (${index})${ext}`)) {
    index += 1;
  }

  return `${base} (${index})${ext}`;
}

// True when moving `source` into `destDir` is illegal: into itself or into one of its own
// descendants (which would orphan the subtree). A drop onto the source's current parent is a no-op,
// handled separately by the caller.
export function isMoveInvalid(source: string, destDir: string): boolean {
  return destDir === source || destDir.startsWith(`${source}/`);
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  conf: "ini",
  env: "ini",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  php: "php",
  sql: "sql",
  xml: "xml",
  dockerfile: "dockerfile",
};

// Best-effort Monaco language id from a filename, for syntax highlighting.
export function languageForFile(name: string): string {
  const lower = name.toLowerCase();

  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) {
    return "dockerfile";
  }

  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";

  return LANGUAGE_BY_EXTENSION[ext] ?? "plaintext";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(1)} ${units[unit]}`;
}
