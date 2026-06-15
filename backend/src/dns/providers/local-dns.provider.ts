import { Injectable } from "@nestjs/common";
import { WillyError } from "../../common/errors";
import { DnsProvider } from "../dns-provider";
import type { CreateDnsRecordDto, DnsRecordDto, UpdateDnsRecordDto } from "../dto/dns.dto";

export class LocalDnsError extends WillyError {}

// In-memory DNS for local development — exercises the exact same controller/UI as OVH without an
// OVH account or public DNS. State lives only in this process; `*.localhost` resolves to 127.0.0.1
// in browsers anyway, so these records are for testing the management flow, not real resolution.
@Injectable()
export class LocalDnsProvider extends DnsProvider {
  private readonly store = new Map<string, Map<number, DnsRecordDto>>();
  private nextId = 1;

  constructor() {
    super();
    this.seed("localhost", { fieldType: "A", subDomain: "app", target: "127.0.0.1", ttl: 3600 });
    this.seed("willy.localhost", {
      fieldType: "A",
      subDomain: "",
      target: "127.0.0.1",
      ttl: 3600,
    });
  }

  get configured(): boolean {
    return true;
  }

  zones(): Promise<string[]> {
    return Promise.resolve([...this.store.keys()].sort());
  }

  records(zone: string): Promise<DnsRecordDto[]> {
    return Promise.resolve([...this.zone(zone).values()]);
  }

  create(zone: string, input: CreateDnsRecordDto): Promise<DnsRecordDto> {
    const record: DnsRecordDto = {
      id: this.nextId++,
      zone,
      fieldType: input.fieldType,
      subDomain: input.subDomain,
      target: input.target,
      ttl: input.ttl ?? 3600,
    };
    this.zone(zone).set(record.id, record);

    return Promise.resolve(record);
  }

  async update(zone: string, id: number, input: UpdateDnsRecordDto): Promise<void> {
    const record = this.get(zone, id);
    record.target = input.target;
    record.ttl = input.ttl ?? record.ttl;

    if (input.subDomain !== undefined) {
      record.subDomain = input.subDomain;
    }
  }

  async remove(zone: string, id: number): Promise<void> {
    this.get(zone, id);
    this.zone(zone).delete(id);
  }

  // Records can be added to any zone on the fly so local testing isn't limited to the seed set.
  private zone(zone: string): Map<number, DnsRecordDto> {
    let records = this.store.get(zone);

    if (!records) {
      records = new Map();
      this.store.set(zone, records);
    }

    return records;
  }

  private get(zone: string, id: number): DnsRecordDto {
    const record = this.zone(zone).get(id);

    if (!record) {
      throw new LocalDnsError(`No DNS record ${id} in zone ${zone}`);
    }

    return record;
  }

  private seed(zone: string, input: CreateDnsRecordDto): void {
    void this.create(zone, input);
  }
}
