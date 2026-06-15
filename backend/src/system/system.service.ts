import { readFileSync } from "node:fs";
import { release as kernelRelease, arch, platform } from "node:os";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { SystemInfoDto } from "./dto/system-info.dto";

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

  getInfo(): SystemInfoDto {
    return this.info;
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
