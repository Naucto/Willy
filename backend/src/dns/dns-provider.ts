import type { CreateDnsRecordDto, DnsRecordDto, UpdateDnsRecordDto } from "./dto/dns.dto";

// The DNS backend behind the panel. Two implementations exist: OvhDnsProvider (real OVH API) and
// LocalDnsProvider (in-memory, for local dev with no OVH account). The module picks one at boot.
export abstract class DnsProvider {
  // Whether the provider can serve requests; the controller turns `false` into a clean 503.
  abstract get configured(): boolean;

  // Whether attaching a domain outside the known zones should be rejected (the "OVH perimeter").
  // True for the real OVH provider; false for the local provider, which accepts any *.localhost.
  abstract get enforcesPerimeter(): boolean;

  abstract zones(): Promise<string[]>;
  abstract records(zone: string): Promise<DnsRecordDto[]>;
  abstract create(zone: string, input: CreateDnsRecordDto): Promise<DnsRecordDto>;
  abstract update(zone: string, id: number, input: UpdateDnsRecordDto): Promise<void>;
  abstract remove(zone: string, id: number): Promise<void>;
}
