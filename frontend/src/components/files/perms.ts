// Pure helpers bridging an octal mode string (e.g. "0644") and a read/write/execute checkbox matrix,
// preserving any special (setuid/setgid/sticky) high bits the user typed.

export interface Triplet {
  read: boolean;
  write: boolean;
  execute: boolean;
}

export interface PermMatrix {
  owner: Triplet;
  group: Triplet;
  other: Triplet;
}

function parseOctal(mode: string): number {
  const value = Number.parseInt(mode, 8);

  return Number.isNaN(value) ? 0 : value;
}

function triplet(bits: number): Triplet {
  return {
    read: (bits & 0b100) !== 0,
    write: (bits & 0b010) !== 0,
    execute: (bits & 0b001) !== 0,
  };
}

function tripletBits(value: Triplet): number {
  return (value.read ? 0b100 : 0) | (value.write ? 0b010 : 0) | (value.execute ? 0b001 : 0);
}

export function modeToMatrix(mode: string): PermMatrix {
  const low = parseOctal(mode) & 0o777;

  return {
    owner: triplet((low >> 6) & 0b111),
    group: triplet((low >> 3) & 0b111),
    other: triplet(low & 0b111),
  };
}

export function matrixToOctal(matrix: PermMatrix): number {
  return (
    (tripletBits(matrix.owner) << 6) | (tripletBits(matrix.group) << 3) | tripletBits(matrix.other)
  );
}

// Applies a matrix to an existing mode, keeping its special (high) bits, and returns a 4-digit octal.
export function withMatrix(mode: string, matrix: PermMatrix): string {
  const special = (parseOctal(mode) >> 9) & 0o7;
  const combined = (special << 9) | matrixToOctal(matrix);

  return combined.toString(8).padStart(4, "0");
}

// Extracts a numeric id from a UID/GID picker input — either a raw number ("1000") or a
// "name (id)" option label. Returns null when no id can be read.
export function parseIdInput(input: string): number | null {
  const labelled = input.match(/\((\d+)\)\s*$/);

  if (labelled?.[1]) {
    return Number(labelled[1]);
  }

  const trimmed = input.trim();

  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}
