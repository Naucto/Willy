import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type OvhCredentials, signRequest } from "./ovh-client";

const creds: OvhCredentials = {
  endpoint: "ovh-eu",
  appKey: "app-key",
  appSecret: "app-secret",
  consumerKey: "consumer-key",
};

describe("signRequest", () => {
  it("produces the $1$ + sha1 signature over the documented parts", () => {
    const url = "https://eu.api.ovh.com/1.0/domain/zone";
    const expected = `$1$${createHash("sha1")
      .update(["app-secret", "consumer-key", "GET", url, "", "1700000000"].join("+"))
      .digest("hex")}`;

    expect(signRequest(creds, "GET", url, "", 1_700_000_000)).toBe(expected);
  });

  it("includes the body for write requests", () => {
    const withBody = signRequest(creds, "POST", "https://x/record", '{"a":1}', 1);
    const withoutBody = signRequest(creds, "POST", "https://x/record", "", 1);

    expect(withBody).not.toBe(withoutBody);
  });
});
