// Unambiguous charset (no 0/O/1/l/I) plus a few symbols, so a generated password is easy to read
// back from the revealed field and still strong.
const CHARSET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%*-_";

// Cryptographically-random password drawn uniformly from CHARSET (rejection sampling avoids the
// modulo bias of `% CHARSET.length`).
export function generatePassword(length = 16): string {
  const max = 256 - (256 % CHARSET.length);
  const out: string[] = [];
  const buffer = new Uint8Array(1);

  while (out.length < length) {
    crypto.getRandomValues(buffer);
    const byte = buffer[0] as number;

    if (byte < max) {
      out.push(CHARSET[byte % CHARSET.length] as string);
    }
  }

  return out.join("");
}
