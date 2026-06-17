// A valid FQDN: 2+ dot-separated labels, each 1-63 chars, no leading/trailing hyphen, ≤253 total.
// Allows *.localhost (local dev) and real domains; rejects single labels and obviously bad input.
const FQDN_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/;

export function isValidFqdn(value: string): boolean {
  return FQDN_RE.test(value.trim());
}
