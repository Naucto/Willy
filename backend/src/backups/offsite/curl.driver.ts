import type { DockerContainerService } from "../../docker/docker-container.service";
import type { DestinationConfig, FileTransferConfig } from "../destinations.service";
import { type OffsiteDriver, runHelper } from "./offsite-driver";

const IMAGE = "curlimages/curl:8.11.1";

// FTP/SFTP via a curl helper. Credentials are passed via env (referenced in the sh command) so they
// never appear in argv. SFTP can't verify the host key non-interactively, hence `--insecure`.
abstract class CurlOffsiteDriver implements OffsiteDriver {
  abstract readonly type: OffsiteDriver["type"];
  protected abstract readonly scheme: "ftp" | "sftp";
  protected abstract readonly flags: string;

  constructor(
    private readonly dockerContainers: DockerContainerService,
    private readonly volume: string,
    private readonly network: string | undefined,
  ) {}

  test(config: DestinationConfig): Promise<void> {
    const c = config as FileTransferConfig;

    return runHelper(this.dockerContainers, `${this.scheme} connection`, this.network, {
      image: IMAGE,
      entrypoint: ["sh", "-c"],
      env: { WILLY_USER: c.username, WILLY_PASS: c.password },
      command: [`curl -fsS ${this.flags} -u "$WILLY_USER:$WILLY_PASS" "${this.base(c)}"`],
    });
  }

  async push(file: string, config: DestinationConfig): Promise<string> {
    const c = config as FileTransferConfig;
    const base = this.base(c);

    await runHelper(this.dockerContainers, `${this.scheme} upload`, this.network, {
      image: IMAGE,
      binds: [`${this.volume}:/backup:ro`],
      entrypoint: ["sh", "-c"],
      env: { WILLY_USER: c.username, WILLY_PASS: c.password },
      command: [
        `curl -fsS ${this.flags} -u "$WILLY_USER:$WILLY_PASS" -T /backup/${file} "${base}"`,
      ],
    });

    return `${base}${file}`;
  }

  private base(c: FileTransferConfig): string {
    const port = c.port ?? (this.scheme === "sftp" ? 22 : 21);
    const dir = c.path ? `/${c.path.replace(/^\/+|\/+$/g, "")}/` : "/";

    return `${this.scheme}://${c.host}:${port}${dir}`;
  }
}

export class FtpOffsiteDriver extends CurlOffsiteDriver {
  readonly type = "FTP" as const;
  protected readonly scheme = "ftp" as const;
  protected readonly flags = "--ftp-create-dirs";
}

export class SftpOffsiteDriver extends CurlOffsiteDriver {
  readonly type = "SFTP" as const;
  protected readonly scheme = "sftp" as const;
  protected readonly flags = "--insecure";
}
