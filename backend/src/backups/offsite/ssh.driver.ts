import type { DockerContainerService } from "../../docker/docker-container.service";
import type { DestinationConfig, SshConfig } from "../destinations.service";
import { type OffsiteDriver, runHelper } from "./offsite-driver";

const SSH_OPTS = "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10";

// Real scp over SSH (git-over-ssh style): a private key when provided, else a password via sshpass.
// Runs in an alpine helper that installs the ssh client (kept out of the willy-server image).
export class SshOffsiteDriver implements OffsiteDriver {
  readonly type = "SSH" as const;

  constructor(
    private readonly dockerContainers: DockerContainerService,
    private readonly volume: string,
    private readonly network: string | undefined,
  ) {}

  test(config: DestinationConfig): Promise<void> {
    const c = config as SshConfig;

    return runHelper(this.dockerContainers, "SSH connection", this.network, {
      image: "alpine:3.20",
      entrypoint: ["sh", "-c"],
      env: this.env(c),
      command: [this.script(c, `ssh ${SSH_OPTS} %AUTH% -p "$WILLY_PORT" "$WILLY_SSH" true`)],
    });
  }

  async push(file: string, config: DestinationConfig): Promise<string> {
    const c = config as SshConfig;
    const dir = c.path ? `/${c.path.replace(/^\/+|\/+$/g, "")}/` : "";

    await runHelper(this.dockerContainers, "scp", this.network, {
      image: "alpine:3.20",
      binds: [`${this.volume}:/backup:ro`],
      entrypoint: ["sh", "-c"],
      // host/path/file flow through env vars (never interpolated into the command) so a hostile
      // destination value can't break out of the shell. destinations.service also rejects metachars.
      env: { ...this.env(c), WILLY_DIR: dir, WILLY_FILE: file },
      command: [
        this.script(
          c,
          `scp ${SSH_OPTS} %AUTH% -P "$WILLY_PORT" "/backup/$WILLY_FILE" "$WILLY_SSH:$WILLY_DIR"`,
        ),
      ],
    });

    return `ssh://${c.username}@${c.host}:${c.port ?? 22}${dir || "/"}${file}`;
  }

  private env(c: SshConfig): Record<string, string> {
    const env: Record<string, string> = {
      WILLY_SSH: `${c.username}@${c.host}`,
      WILLY_PORT: String(c.port ?? 22),
    };

    if (c.privateKey) {
      env.WILLY_KEY = c.privateKey;
    } else {
      env.SSHPASS = c.password ?? "";
    }

    return env;
  }

  // Builds the install + auth prelude, substituting %AUTH% with the key/password form of the op.
  private script(c: SshConfig, op: string): string {
    if (c.privateKey) {
      const prepared = op.replace("%AUTH%", "-i /tmp/k");

      return `apk add --no-cache openssh-client >/dev/null && printf '%s' "$WILLY_KEY" > /tmp/k && chmod 600 /tmp/k && ${prepared}`;
    }

    return `apk add --no-cache openssh-client sshpass >/dev/null && sshpass -e ${op.replace("%AUTH%", "")}`;
  }
}
