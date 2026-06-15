import { Injectable } from "@nestjs/common";
import { OvhClient } from "../../ovh/ovh-client";
import { DnsProvider } from "../dns-provider";
import type { CreateDnsRecordDto, DnsRecordDto, UpdateDnsRecordDto } from "../dto/dns.dto";

// DNS management over the real OVH API. Records are proxied live (no local mirror); every mutation
// is followed by a zone refresh so changes propagate. Zone discovery uses `GET /domain/zone`, which
// needs the token to be granted that path (in addition to the per-zone record routes).
@Injectable()
export class OvhDnsProvider extends DnsProvider {
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
    return this.ovh.request<string[]>("GET", "/domain/zone");
  }

  async records(zone: string): Promise<DnsRecordDto[]> {
    const ids = await this.ovh.request<number[]>("GET", `${this.zonePath(zone)}/record`);

    return Promise.all(
      ids.map((id) => this.ovh.request<DnsRecordDto>("GET", `${this.zonePath(zone)}/record/${id}`)),
    );
  }

  async create(zone: string, input: CreateDnsRecordDto): Promise<DnsRecordDto> {
    const record = await this.ovh.request<DnsRecordDto>("POST", `${this.zonePath(zone)}/record`, {
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

    await this.ovh.request("PUT", `${this.zonePath(zone)}/record/${id}`, body);
    await this.refresh(zone);
  }

  async remove(zone: string, id: number): Promise<void> {
    await this.ovh.request("DELETE", `${this.zonePath(zone)}/record/${id}`);
    await this.refresh(zone);
  }

  private refresh(zone: string): Promise<void> {
    return this.ovh.request("POST", `${this.zonePath(zone)}/refresh`);
  }

  private zonePath(zone: string): string {
    return `/domain/zone/${encodeURIComponent(zone)}`;
  }
}
