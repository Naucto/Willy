import { expect, test } from "@playwright/test";

// The control panel's hardening headers are set by Traefik's `panel-sec-headers` middleware
// (routing/dynamic/middlewares.yml), applied to both willy-web and willy-api. These assertions guard
// against the middleware being dropped from a router or the CSP regressing — both have bitten before.

test("panel HTML document carries the hardening headers", async ({ request }) => {
  const res = await request.get("/");

  expect(res.ok()).toBeTruthy();

  const headers = res.headers();

  expect(headers["strict-transport-security"]).toContain("max-age=31536000");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  // frameDeny → X-Frame-Options: DENY (Traefik also mirrors this via CSP frame-ancestors 'none').
  expect(headers["x-frame-options"]).toBe("DENY");

  const csp = headers["content-security-policy"] ?? "";

  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  // Monaco's Vite-bundled workers need blob:; without it the file editor breaks under CSP.
  expect(csp).toContain("worker-src 'self' blob:");
});
