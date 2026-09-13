import { BadGatewayException, HttpException, Injectable, Logger } from "@nestjs/common";
import { type Method, OvhClient, OvhError } from "../../ovh/ovh-client";
import { DnsProvider } from "../dns-provider";
import type { CreateDnsRecordDto, DnsRecordDto, UpdateDnsRecordDto } from "../dto/dns.dto";

// The provider's own 4xx already names what the operator must fix, so its message is worth showing.
// Authentication failures are the exception: they are about Willy's stored credentials rather than
// the request, and would read in the panel as the operator's own session having expired.
// Pure + exported for unit testing.
export function asHttpException(error: OvhError): HttpException {
  const isVerdictOnTheRequest =
    error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403;

  if (isVerdictOnTheRequest) {
    return new HttpException({ statusCode: error.status, message: error.message }, error.status);
  }

  return new BadGatewayException(`DNS provider error: ${error.message}`);
}

// DNS management over the real OVH API. Records are proxied live (no local mirror); every mutation
// is followed by a zone refresh so changes propagate. Zone discovery uses `GET /domain/zone`, which
// needs the token to be granted that path (in addition to the per-zone record routes).
@Injectable()
export class OvhDnsProvider extends DnsProvider {
  private readonly logger = new Logger(OvhDnsProvider.name);

  constructor(private readonly ovh: OvhClient) {
    super();
  }

  get configured(): boolean {
    return this.ovh.configured;
  }

  get enforcesPerimeter(): boolean {
    return true;
  }

  zones(): Promise<string[]> {
    return this.request<string[]>("GET", "/domain/zone");
  }

  async records(zone: string): Promise<DnsRecordDto[]> {
    const ids = await this.request<number[]>("GET", `${this.zonePath(zone)}/record`);

    return Promise.all(
      ids.map((id) => this.request<DnsRecordDto>("GET", `${this.zonePath(zone)}/record/${id}`)),
    );
  }

  async create(zone: string, input: CreateDnsRecordDto): Promise<DnsRecordDto> {
    const record = await this.request<DnsRecordDto>("POST", `${this.zonePath(zone)}/record`, {
      fieldType: input.fieldType,
      subDomain: input.subDomain,
      target: input.target,
      ttl: input.ttl ?? 3600,
    });
    await this.refresh(zone);

    return record;
  }

  async update(zone: string, id: number, input: UpdateDnsRecordDto): Promise<void> {
    const body: Record<string, unknown> = { target: input.target, ttl: input.ttl ?? 3600 };

    if (input.subDomain !== undefined) {
      body.subDomain = input.subDomain;
    }

    await this.request("PUT", `${this.zonePath(zone)}/record/${id}`, body);
    await this.refresh(zone);
  }

  async remove(zone: string, id: number): Promise<void> {
    await this.request("DELETE", `${this.zonePath(zone)}/record/${id}`);
    await this.refresh(zone);
  }

  // Every call to the OVH API must route through here: an unmapped error reaches the panel as a bare
  // 500, which says nothing about what the provider refused.
  private async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    try {
      return await this.ovh.request<T>(method, path, body);
    } catch (error) {
      if (error instanceof OvhError) {
        this.logger.warn(`OVH ${method} ${path} failed (${error.status}): ${error.message}`);

        throw asHttpException(error);
      }

      throw error;
    }
  }

  private refresh(zone: string): Promise<void> {
    return this.request("POST", `${this.zonePath(zone)}/refresh`);
  }

  private zonePath(zone: string): string {
    return `/domain/zone/${encodeURIComponent(zone)}`;
  }
}
