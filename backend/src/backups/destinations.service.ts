import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { WillyError } from "../common/errors";
import { CryptoService } from "../crypto/crypto.service";
import { DB, type Database } from "../db/db.module";
import { backupDestinations } from "../db/schema";

export class DestinationError extends WillyError {}

export type DestinationRow = typeof backupDestinations.$inferSelect;
export type DestinationType = DestinationRow["type"];

export interface S3Config {
  bucket: string;
  prefix?: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// FTP and SFTP share the same (password-based) connection shape.
export interface FileTransferConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  path?: string;
}

// SSH/SCP: a private key (git-over-ssh style) and/or a password.
export interface SshConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  path?: string;
}

export type DestinationConfig = S3Config | FileTransferConfig | SshConfig;

function requireString(config: Record<string, unknown>, key: string): string {
  const value = config[key];

  if (typeof value !== "string" || value.length === 0) {
    throw new DestinationError(`Destination is missing "${key}"`);
  }

  return value;
}

// host/path land in shell commands inside the offsite helper containers. The drivers pass them via
// env vars (never argv), but we still reject shell-dangerous characters here — the single choke point
// where config is normalised before being sealed — so a hostile value can never reach a driver.
const HOST_PATTERN = /^[A-Za-z0-9.:_\-[\]]+$/;
const PATH_PATTERN = /^[A-Za-z0-9._\-/]+$/;

function requireHost(config: Record<string, unknown>): string {
  const host = requireString(config, "host");

  if (!HOST_PATTERN.test(host)) {
    throw new DestinationError("Destination host contains invalid characters");
  }

  return host;
}

function optionalPath(config: Record<string, unknown>): string | undefined {
  const path = optionalString(config, "path");

  if (path !== undefined && !PATH_PATTERN.test(path)) {
    throw new DestinationError("Destination path contains invalid characters");
  }

  return path;
}

function optionalString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// Offsite destinations (S3 / FTP / SFTP) with their connection config sealed at rest. The config is
// validated + normalised per type on create, and only decrypted at push time.
@Injectable()
export class BackupDestinationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly crypto: CryptoService,
  ) {}

  list(): Promise<DestinationRow[]> {
    return this.db.select().from(backupDestinations).orderBy(desc(backupDestinations.createdAt));
  }

  // Validates + normalises raw config for a type (throws on missing fields). Public so the
  // controller can build the config once, test the connection, then persist it.
  buildConfig(type: DestinationType, raw: Record<string, unknown>): DestinationConfig {
    return this.normalise(type, raw);
  }

  async create(
    name: string,
    type: DestinationType,
    config: DestinationConfig,
  ): Promise<DestinationRow> {
    const sealed = this.crypto.encrypt(JSON.stringify(config));

    const [row] = await this.db
      .insert(backupDestinations)
      .values({
        name,
        type,
        cipherText: sealed.cipherText,
        nonce: sealed.nonce,
        authTag: sealed.authTag,
        keyVersion: sealed.keyVersion,
      })
      .returning();

    if (!row) {
      throw new DestinationError("Failed to create destination");
    }

    return row;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(backupDestinations).where(eq(backupDestinations.id, id));
  }

  // Decrypts a destination's config for use at push time.
  async resolve(id: string): Promise<{ type: DestinationType; config: DestinationConfig }> {
    const [row] = await this.db
      .select()
      .from(backupDestinations)
      .where(eq(backupDestinations.id, id));

    if (!row) {
      throw new NotFoundException(`Destination ${id} not found`);
    }

    return {
      type: row.type,
      config: JSON.parse(this.crypto.decrypt(row)) as DestinationConfig,
    };
  }

  private normalise(type: DestinationType, config: Record<string, unknown>): DestinationConfig {
    if (type === "S3") {
      const prefix = optionalString(config, "prefix");
      const region = optionalString(config, "region");
      const endpoint = optionalString(config, "endpoint");

      return {
        bucket: requireString(config, "bucket"),
        accessKeyId: requireString(config, "accessKeyId"),
        secretAccessKey: requireString(config, "secretAccessKey"),
        ...(prefix ? { prefix } : {}),
        ...(region ? { region } : {}),
        ...(endpoint ? { endpoint } : {}),
      };
    }

    const port = config.port;
    const path = optionalPath(config);

    if (type === "SSH") {
      const password = optionalString(config, "password");
      const privateKey = optionalString(config, "privateKey");

      if (!password && !privateKey) {
        throw new DestinationError("SSH destination needs a private key or a password");
      }

      return {
        host: requireHost(config),
        username: requireString(config, "username"),
        ...(typeof port === "number" ? { port } : {}),
        ...(path ? { path } : {}),
        ...(password ? { password } : {}),
        ...(privateKey ? { privateKey } : {}),
      };
    }

    return {
      host: requireHost(config),
      username: requireString(config, "username"),
      password: requireString(config, "password"),
      ...(typeof port === "number" ? { port } : {}),
      ...(path ? { path } : {}),
    };
  }
}
