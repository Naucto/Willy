import { describe, expect, it } from "vitest";
import type { CreateDnsRecordInput } from "./api/types";
import { recordDraftProblem } from "./dnsRecord";

function draft(overrides: Partial<CreateDnsRecordInput> = {}): CreateDnsRecordInput {
  return { fieldType: "A", subDomain: "app", target: "203.0.113.10", ttl: 3600, ...overrides };
}

describe("recordDraftProblem", () => {
  it("rejects a CNAME at the zone apex", () => {
    expect(recordDraftProblem(draft({ fieldType: "CNAME", subDomain: "" }))).toMatch(/apex/);
    expect(recordDraftProblem(draft({ fieldType: "CNAME", subDomain: "   " }))).toMatch(/apex/);
  });

  it("accepts a CNAME on a subdomain", () => {
    expect(recordDraftProblem(draft({ fieldType: "CNAME", target: "beta.naucto.net" }))).toBeNull();
  });

  it("leaves every other type free to sit at the apex", () => {
    expect(recordDraftProblem(draft({ subDomain: "" }))).toBeNull();
    expect(recordDraftProblem(draft({ fieldType: "TXT", subDomain: "" }))).toBeNull();
    expect(recordDraftProblem(draft({ fieldType: "MX", subDomain: "" }))).toBeNull();
  });
});
