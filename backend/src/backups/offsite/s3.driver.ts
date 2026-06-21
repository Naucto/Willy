import type { DockerContainerService } from "../../docker/docker-container.service";
import type { DestinationConfig, S3Config } from "../destinations.service";
import { type OffsiteDriver, runHelper } from "./offsite-driver";

// Uploads via the AWS CLI (`aws s3`), supporting custom endpoints for non-AWS S3.
export class S3OffsiteDriver implements OffsiteDriver {
  readonly type = "S3" as const;

  constructor(
    private readonly dockerContainers: DockerContainerService,
    private readonly volume: string,
    private readonly network: string | undefined,
  ) {}

  test(config: DestinationConfig): Promise<void> {
    const c = config as S3Config;

    return runHelper(this.dockerContainers, "S3 connection", this.network, {
      image: "amazon/aws-cli:2.15.30",
      env: this.env(c),
      command: ["s3", "ls", `s3://${c.bucket}`, ...this.endpointArgs(c)],
    });
  }

  async push(file: string, config: DestinationConfig): Promise<string> {
    const c = config as S3Config;
    const key = `${c.prefix ? `${c.prefix.replace(/\/+$/, "")}/` : ""}${file}`;
    const url = `s3://${c.bucket}/${key}`;

    await runHelper(this.dockerContainers, "s3 cp", this.network, {
      image: "amazon/aws-cli:2.15.30",
      binds: [`${this.volume}:/backup:ro`],
      env: this.env(c),
      command: ["s3", "cp", `/backup/${file}`, url, ...this.endpointArgs(c)],
    });

    return url;
  }

  private env(c: S3Config): Record<string, string> {
    return {
      AWS_ACCESS_KEY_ID: c.accessKeyId,
      AWS_SECRET_ACCESS_KEY: c.secretAccessKey,
      AWS_DEFAULT_REGION: c.region ?? "us-east-1",
    };
  }

  private endpointArgs(c: S3Config): string[] {
    return c.endpoint ? ["--endpoint-url", c.endpoint] : [];
  }
}
