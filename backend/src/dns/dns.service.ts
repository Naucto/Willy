import { Injectable } from "@nestjs/common";
import { OvhClient } from "../ovh/ovh-client";
import type { CreateDnsRecordDto, DnsRecordDto, UpdateDnsRecordDto } from "./dto/dns.dto";

// DNS management over the OVH API. Records are proxied live (no local mirror); every mutation
// is followed by a zone refresh so changes propagate.
@Injectable()
export class DnsService {
  constructor(private readonly ovh: OvhClient) {}

  get configured(): boolean {
    return this.ovh.configured;
  }

  zones(): Promise<string[]> {
    return this.ovh.request<string[]>("GET", "/domain/zone");
  }

  async records(zone: string): Promise<DnsRecordDto[]> {
    const ids = await this.ovh.request<number[]>(
      "GET",
      `/domain/zone/${encodeURIComponent(zone)}/record`,
    );

    return Promise.all(
      ids.map((id) =>
        this.ovh.request<DnsRecordDto>(
          "GET",
          `/domain/zone/${encodeURIComponent(zone)}/record/${id}`,
        ),
      ),
    );
  }

  async create(zone: string, input: CreateDnsRecordDto): Promise<DnsRecordDto> {
    const record = await this.ovh.request<DnsRecordDto>(
      "POST",
      `/domain/zone/${encodeURIComponent(zone)}/record`,
      {
        fieldType: input.fieldType,
        subDomain: input.subDomain,
        target: input.target,
        ttl: input.ttl ?? 3600,
      },
    );
    await this.refresh(zone);

    return record;
  }

  async update(zone: string, id: number, input: UpdateDnsRecordDto): Promise<void> {
    const body: Record<string, unknown> = { target: input.target, ttl: input.ttl ?? 3600 };

    if (input.subDomain !== undefined) {
      body.subDomain = input.subDomain;
    }

    await this.ovh.request("PUT", `/domain/zone/${encodeURIComponent(zone)}/record/${id}`, body);
    await this.refresh(zone);
  }

  async remove(zone: string, id: number): Promise<void> {
    await this.ovh.request("DELETE", `/domain/zone/${encodeURIComponent(zone)}/record/${id}`);
    await this.refresh(zone);
  }

  private refresh(zone: string): Promise<void> {
    return this.ovh.request("POST", `/domain/zone/${encodeURIComponent(zone)}/refresh`);
  }
}
