import { BadRequestException } from "@nestjs/common";

// Env var names are injected both as Docker `KEY=value` entries and as compose `${KEY}` interpolation
// references, so the key must be a conventional shell-safe identifier — anything else could split an
// entry or skew interpolation. Values are far freer (multiline secrets, PEM keys, JSON are all valid),
// so we only reject NUL bytes (which truncate C-strings) and cap the size to keep a single var from
// being used as a memory-amplification vector.
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_VALUE_BYTES = 128 * 1024;

export function assertValidEnvKey(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new BadRequestException(
      `invalid env var name "${key}" — must match ${KEY_PATTERN.source}`,
    );
  }
}

export function assertValidEnvValue(value: string): void {
  if (value.includes("\u0000")) {
    throw new BadRequestException("env var value must not contain NUL bytes");
  }

  if (Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) {
    throw new BadRequestException(`env var value exceeds ${MAX_VALUE_BYTES} bytes`);
  }
}
