import { readFileSync } from "node:fs";
import { release as kernelRelease, arch, platform } from "node:os";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { PublicIpDto } from "./dto/public-ip.dto";
import type { SystemInfoDto } from "./dto/system-info.dto";

const PUBLIC_IP_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class SystemService {
  private readonly info: SystemInfoDto = {
    version: this.readVersion(),
    commit: process.env.GIT_COMMIT ?? "dev",
    distro: this.readDistro(),
    // Containers share the host kernel, so this reflects the VPS kernel.
    kernel: kernelRelease(),
    platform: platform(),
    arch: arch(),
    node: process.version,
  };

  private cachedIp: string | null = null;
  private cachedIpAt = 0;

  getInfo(): SystemInfoDto {
    return this.info;
  }

  // The host's public IP, for pre-filling A/AAAA records. Prefers an explicit PUBLIC_IP, otherwise
  // asks an external echo service; cached so we don't hit it on every record edit.
  async getPublicIp(): Promise<PublicIpDto> {
    const configured = process.env.PUBLIC_IP?.trim();

    if (configured) {
      return { ip: configured };
    }

    if (this.cachedIp && Date.now() - this.cachedIpAt < PUBLIC_IP_TTL_MS) {
      return { ip: this.cachedIp };
    }

    try {
      const response = await fetch("https://api.ipify.org?format=json", {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = (await response.json()) as { ip?: string };
        this.cachedIp = data.ip ?? null;
        this.cachedIpAt = Date.now();
      }
    } catch {
      // Leave the previous value (possibly null) in place on failure.
    }

    return { ip: this.cachedIp };
  }

  private readVersion(): string {
    try {
      const pkg = readFileSync(join(__dirname, "..", "..", "package.json"), "utf8");

      return (JSON.parse(pkg) as { version?: string }).version ?? "0.0.0";
    } catch {
      return "0.0.0";
    }
  }

  private readDistro(): string {
    try {
      const osRelease = readFileSync("/etc/os-release", "utf8");
      const match = /^PRETTY_NAME="?([^"\n]+)"?/m.exec(osRelease);

      return match?.[1] ?? "unknown";
    } catch {
      return "unknown";
    }
  }
}
