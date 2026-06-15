import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WillyError } from "../common/errors";

export class OvhError extends WillyError {}

// OVH region endpoint -> API base URL.
const EU_ENDPOINT = "https://eu.api.ovh.com/1.0";
const ENDPOINTS = new Map<string, string>([
  ["ovh-eu", EU_ENDPOINT],
  ["ovh-ca", "https://ca.api.ovh.com/1.0"],
  ["ovh-us", "https://api.us.ovhcloud.com/1.0"],
]);

export interface OvhCredentials {
  endpoint: string;
  appKey: string;
  appSecret: string;
  consumerKey: string;
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

// OVH signs requests as "$1$" + sha1(appSecret+consumerKey+method+url+body+timestamp).
// Pure + exported for unit testing.
export function signRequest(
  creds: OvhCredentials,
  method: Method,
  url: string,
  body: string,
  timestamp: number,
): string {
  const parts = [creds.appSecret, creds.consumerKey, method, url, body, String(timestamp)];
  const hash = createHash("sha1").update(parts.join("+")).digest("hex");

  return `$1$${hash}`;
}

// Thin signed client for the subset of the OVH API Willy uses (DNS zones + records).
@Injectable()
export class OvhClient {
  private readonly creds: OvhCredentials | null;
  private readonly baseUrl: string;
  private timeDelta = 0;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>("OVH_ENDPOINT") ?? "ovh-eu";
    const appKey = config.get<string>("OVH_APPLICATION_KEY") ?? "";
    const appSecret = config.get<string>("OVH_APPLICATION_SECRET") ?? "";
    const consumerKey = config.get<string>("OVH_CONSUMER_KEY") ?? "";

    this.baseUrl = ENDPOINTS.get(endpoint) ?? EU_ENDPOINT;
    this.creds =
      appKey && appSecret && consumerKey ? { endpoint, appKey, appSecret, consumerKey } : null;
  }

  get configured(): boolean {
    return this.creds !== null;
  }

  request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    return this.send<T>(method, path, body);
  }

  private async send<T>(method: Method, path: string, body?: unknown): Promise<T> {
    if (!this.creds) {
      throw new OvhError("OVH API is not configured (missing application/consumer keys)");
    }

    const url = `${this.baseUrl}${path}`;
    const payload = body === undefined ? "" : JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000) + this.timeDelta;
    const signature = signRequest(this.creds, method, url, payload, timestamp);

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Ovh-Application": this.creds.appKey,
        "X-Ovh-Consumer": this.creds.consumerKey,
        "X-Ovh-Timestamp": String(timestamp),
        "X-Ovh-Signature": signature,
      },
      ...(payload ? { body: payload } : {}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new OvhError(
        `OVH ${method} ${path} failed (${response.status}): ${text.slice(0, 300)}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  // Syncs the local clock delta with OVH so signatures aren't rejected for skew.
  async syncTime(): Promise<void> {
    if (!this.creds) {
      return;
    }

    const response = await fetch(`${this.baseUrl}/auth/time`);

    if (response.ok) {
      const serverTime = Number(await response.text());
      this.timeDelta = serverTime - Math.floor(Date.now() / 1000);
    }
  }
}
