// Maps an FQDN to the DNS zone that contains it. A domain belongs to a zone when it equals the zone
// or is a sub-label of it; with overlapping zones (e.g. `naucto.net` and `apps.naucto.net`) the
// longest (most specific) match wins, so the record lands in the right zone.
export function zoneFor(fqdn: string, zones: string[]): string | null {
  const host = normalise(fqdn);
  let best: string | null = null;

  for (const zone of zones) {
    const candidate = normalise(zone);

    if (host === candidate || host.endsWith(`.${candidate}`)) {
      if (!best || candidate.length > best.length) {
        best = candidate;
      }
    }
  }

  return best;
}

// The sub-domain portion of an FQDN relative to its zone ("" for the apex).
export function subDomainOf(fqdn: string, zone: string): string {
  const host = normalise(fqdn);
  const z = normalise(zone);

  if (host === z) {
    return "";
  }

  return host.slice(0, host.length - z.length - 1);
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/\.$/, "");
}
