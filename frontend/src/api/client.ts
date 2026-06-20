import createClient from "openapi-fetch";
import { WillyError } from "../errors";
import type { paths } from "./schema";
import { tokens } from "./tokens";

export class ApiError extends WillyError {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const API_BASE = "/api";

// Single-flight refresh: concurrent 401s share one refresh round-trip.
let refreshInFlight: Promise<boolean> | null = null;

// A failed /auth/refresh only ends the session when the refresh token itself is rejected. A
// rate-limit (429), server error (5xx), or network blip is transient — we keep the session and let
// the next request retry, so fast navigation can't spuriously log the user out.
export function refreshFailureIsTerminal(status: number): boolean {
  return status === 401 || status === 403;
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokens.getRefresh();

  if (!refreshToken) {
    return false;
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
  } catch {
    return false;
  }

  if (response.ok) {
    const session = (await response.json()) as { accessToken: string; refreshToken: string };
    tokens.set(session.accessToken, session.refreshToken);

    return true;
  }

  if (refreshFailureIsTerminal(response.status)) {
    tokens.clear();
  }

  return false;
}

// Dispatched when the session can't be refreshed; the auth layer redirects to /login.
export const AUTH_EXPIRED_EVENT = "willy:auth-expired";

// Custom fetch: injects the access token and transparently refreshes once on 401. Each attempt
// fetches a fresh clone so the original request body is never consumed across the retry.
async function authFetch(input: Request): Promise<Response> {
  const withAuth = (token: string | null): Request => {
    const request = input.clone();

    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }

    return request;
  };

  const response = await fetch(withAuth(tokens.getAccess()));

  if (response.status !== 401 || !tokens.getRefresh()) {
    return response;
  }

  refreshInFlight ??= refreshTokens().finally(() => {
    refreshInFlight = null;
  });

  if (!(await refreshInFlight)) {
    // Only force a logout when the refresh genuinely invalidated the session (tokens were cleared);
    // a transient 429/5xx leaves the refresh token in place so the user stays signed in.
    if (!tokens.getRefresh()) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }

    return response;
  }

  return fetch(withAuth(tokens.getAccess()));
}

export const api = createClient<paths>({ baseUrl: API_BASE, fetch: authFetch });

// Narrow openapi-fetch's { data, error } result to data, throwing a typed error otherwise.
// A successful no-content response (204) yields undefined, which callers ignore.
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || !result.response.ok) {
    const message = extractMessage(result.error) ?? `request failed (${result.response.status})`;

    throw new ApiError(message, result.response.status);
  }

  return result.data as T;
}

function extractMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message: unknown };

    return Array.isArray(message) ? message.join(", ") : String(message);
  }

  return undefined;
}
