import { type ArgumentsHost, BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "./all-exceptions.filter";

function mockHost(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: "GET", url: "/api/thing" }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe("AllExceptionsFilter", () => {
  it("preserves an HttpException's status and body", () => {
    const { host, status, json } = mockHost();

    new AllExceptionsFilter().catch(new BadRequestException("bad input"), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: "bad input" }));
  });

  it("maps an unexpected error to a generic 500 without leaking internals", () => {
    const { host, status, json } = mockHost();

    new AllExceptionsFilter().catch(new Error("connect ECONNREFUSED 10.0.0.5:5432"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ statusCode: 500, message: "Internal server error" });
    const body = JSON.stringify(json.mock.calls[0]?.[0]);
    expect(body).not.toContain("ECONNREFUSED");
  });
});
