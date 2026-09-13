import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { OvhError } from "../../ovh/ovh-client";
import { asHttpException } from "./ovh-dns.provider";

function bodyOf(error: { getResponse: () => unknown }): { statusCode: number; message: string } {
  return error.getResponse() as { statusCode: number; message: string };
}

describe("asHttpException", () => {
  it("passes a rejected record through with the explanation the provider gave", () => {
    const mapped = asHttpException(
      new OvhError("Invalid subdomain : Subdomain is mandatory for CNAME", 400),
    );

    expect(mapped.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(bodyOf(mapped).message).toBe("Invalid subdomain : Subdomain is mandatory for CNAME");
  });

  it("keeps other request verdicts on their own status", () => {
    expect(asHttpException(new OvhError("This zone does not exist", 404)).getStatus()).toBe(
      HttpStatus.NOT_FOUND,
    );
    expect(asHttpException(new OvhError("This record already exists", 409)).getStatus()).toBe(
      HttpStatus.CONFLICT,
    );
  });

  it("hides a credentials problem behind a gateway error, since the operator is authenticated", () => {
    for (const status of [401, 403]) {
      expect(asHttpException(new OvhError("Invalid signature", status)).getStatus()).toBe(
        HttpStatus.BAD_GATEWAY,
      );
    }
  });

  it("reports an unreachable or failing API as a gateway error", () => {
    expect(asHttpException(new OvhError("Internal server error", 500)).getStatus()).toBe(
      HttpStatus.BAD_GATEWAY,
    );
    expect(bodyOf(asHttpException(new OvhError("fetch failed"))).message).toContain("fetch failed");
  });
});
