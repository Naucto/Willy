import { describe, expect, it } from "vitest";
import { issueStreamTicket, verifyStreamTicket } from "./console.service";

const SECRET = "panel-secret";

describe("stream tickets", () => {
  it("accepts a ticket it just issued", () => {
    const ticket = issueStreamTicket(SECRET, "user-1");
    expect(verifyStreamTicket(SECRET, ticket)).toBe(true);
  });

  it("rejects a ticket signed with a different secret", () => {
    const ticket = issueStreamTicket("other", "user-1");
    expect(verifyStreamTicket(SECRET, ticket)).toBe(false);
  });

  it("rejects an expired ticket", () => {
    const issuedAt = 1_000_000;
    const ticket = issueStreamTicket(SECRET, "user-1", issuedAt);
    expect(verifyStreamTicket(SECRET, ticket, issuedAt + 120_000)).toBe(false);
  });

  it("rejects malformed tickets without throwing", () => {
    expect(verifyStreamTicket(SECRET, "garbage")).toBe(false);
    expect(verifyStreamTicket(SECRET, "")).toBe(false);
  });
});
