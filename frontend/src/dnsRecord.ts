import type { CreateDnsRecordInput } from "./api/types";

// Why a drafted record can't be created as it stands, or null when nothing is wrong.
//
// A CNAME is the one record type that cannot sit at the zone apex: RFC 1034 forbids a CNAME alongside
// any other record, and the apex always carries SOA and NS. Providers reject it, so saying so in the
// field spares a round-trip that can only fail.
export function recordDraftProblem(draft: CreateDnsRecordInput): string | null {
  if (draft.fieldType === "CNAME" && !draft.subDomain.trim()) {
    return "A CNAME can't sit at the zone apex — enter a subdomain, or point the root at an A record.";
  }

  return null;
}
