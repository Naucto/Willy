import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileManagerError } from "../common/errors";
import { ContainersService } from "../containers/containers.service";
import type { Deployment } from "../deployments/deployments.service";
import { DeploymentsService } from "../deployments/deployments.service";
import {
  type ExecResult,
  type HelperHandle,
  VolumeHelperService,
} from "../docker/volume-helper.service";
import { assertBasename, basename, containerPath, parentAndName, VOLUME_ROOT } from "./file-path";
import type { DirEntryDto, FileEntryType } from "./dto/file-entry.dto";
import type { ReadFileResponseDto } from "./dto/file-content.dto";
import { buildFileTar, extractSingleFile, streamSingleFile } from "./tar.util";

interface StatInfo {
  type: FileEntryType;
  // Permission bits only (mode & 07777).
  perm: number;
  uid: number;
  gid: number;
  size: number;
  mtimeMs: number;
}

export interface DownloadResult {
  stream: NodeJS.ReadableStream;
  filename: string;
  contentType: string;
}

export interface Identity {
  id: number;
  name: string;
}

const MAX_ENTRIES = 5000;
const BINARY_SNIFF_BYTES = 8192;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly maxReadBytes: number;
  readonly maxUploadBytes: number;

  constructor(
    private readonly helpers: VolumeHelperService,
    private readonly deployments: DeploymentsService,
    private readonly containers: ContainersService,
    config: ConfigService,
  ) {
    this.maxReadBytes = (config.get<number>("FILE_MANAGER_MAX_READ_MB") ?? 10) * 1024 * 1024;
    this.maxUploadBytes = (config.get<number>("FILE_MANAGER_MAX_UPLOAD_MB") ?? 25) * 1024 * 1024;
  }

  async list(deploymentId: string, volume: string, dirPath: string): Promise<DirEntryDto[]> {
    await this.resolve(deploymentId, volume);
    const absDir = containerPath(dirPath);

    return this.helpers.withHelper(deploymentId, volume, async (helper) => {
      const dir = await this.stat(helper, absDir);

      if (!dir) {
        throw new NotFoundException("directory not found");
      }

      if (dir.type !== "dir") {
        throw new BadRequestException("not a directory");
      }

      const found = await helper.exec([
        "find",
        absDir,
        "-mindepth",
        "1",
        "-maxdepth",
        "1",
        "-print0",
      ]);

      if (found.exitCode !== 0) {
        throw new FileManagerError(found.stderr.trim() || "failed to list directory");
      }

      const paths = found.stdout.split("\0").filter((entry) => entry.length > 0);

      if (paths.length > MAX_ENTRIES) {
        throw new FileManagerError(
          `directory has too many entries (${paths.length}); open a subfolder`,
        );
      }

      if (paths.length === 0) {
        return [];
      }

      // One stat over all paths (no %n, so names can't break parsing); output lines map to inputs by
      // order. Names come verbatim from find's NUL-delimited list.
      const stat = await helper.exec(["stat", "-c", "%f|%s|%u|%g|%Y", ...paths]);
      const lines = stat.stdout.split("\n").filter((line) => line.length > 0);
      const entries: DirEntryDto[] = [];

      paths.forEach((fullPath, index) => {
        const line = lines[index];

        if (!line) {
          return;
        }

        const info = this.parseStatLine(line);

        if (!info) {
          return;
        }

        entries.push(this.toEntry(basename(fullPath), info));
      });

      entries.sort((a, b) => {
        if (a.type === "dir" && b.type !== "dir") {
          return -1;
        }

        if (a.type !== "dir" && b.type === "dir") {
          return 1;
        }

        return a.name.localeCompare(b.name);
      });

      return entries;
    });
  }

  async read(deploymentId: string, volume: string, filePath: string): Promise<ReadFileResponseDto> {
    await this.resolve(deploymentId, volume);
    const abs = containerPath(filePath);

    return this.helpers.withHelper(deploymentId, volume, async (helper) => {
      const info = await this.stat(helper, abs);

      if (!info) {
        throw new NotFoundException("file not found");
      }

      if (info.type === "dir") {
        throw new BadRequestException("path is a directory");
      }

      if (info.size > this.maxReadBytes) {
        throw new FileManagerError(
          `file is too large to open (${info.size} bytes); download it instead`,
        );
      }

      await this.assertNoEscape(helper, abs);

      const archive = await helper.getArchive(abs);
      const content = await extractSingleFile(archive, this.maxReadBytes);
      const sniff = content.subarray(0, BINARY_SNIFF_BYTES);

      return {
        path: filePath,
        size: content.length,
        isBinary: sniff.includes(0),
        contentBase64: content.toString("base64"),
        mode: this.modeOctal(info.perm),
        uid: info.uid,
        gid: info.gid,
        mtime: new Date(info.mtimeMs).toISOString(),
      };
    });
  }

  async write(
    deploymentId: string,
    volume: string,
    filePath: string,
    contentBase64: string,
    create: boolean,
  ): Promise<void> {
    await this.resolve(deploymentId, volume);
    const abs = containerPath(filePath);

    if (abs === VOLUME_ROOT) {
      throw new BadRequestException("cannot write to the volume root");
    }

    const content = Buffer.from(contentBase64, "base64");

    if (content.length > this.maxUploadBytes) {
      throw new FileManagerError(`content exceeds the ${this.maxUploadBytes}-byte limit`);
    }

    const { dir, name } = parentAndName(abs);

    await this.helpers.withHelper(deploymentId, volume, async (helper) => {
      const existing = await this.stat(helper, abs);

      if (existing?.type === "dir") {
        throw new BadRequestException("path is a directory");
      }

      if (!existing && !create) {
        throw new NotFoundException("file not found");
      }

      const meta = existing
        ? { mode: existing.perm, uid: existing.uid, gid: existing.gid }
        : await this.newFileMeta(helper, dir);

      const tar = await buildFileTar(name, content, meta);
      await helper.putArchive(tar, dir);
    });
  }

  async mkdir(deploymentId: string, volume: string, dirPath: string): Promise<void> {
    await this.resolve(deploymentId, volume);
    const abs = containerPath(dirPath);

    if (abs === VOLUME_ROOT) {
      throw new BadRequestException("invalid directory");
    }

    const { dir } = parentAndName(abs);

    await this.helpers.withHelper(deploymentId, volume, async (helper) => {
      const result = await helper.exec(["mkdir", "-p", abs]);

      if (result.exitCode !== 0) {
        throw new FileManagerError(result.stderr.trim() || "failed to create directory");
      }

      // Inherit the parent's owner so a non-root app can still write into the new folder. Best-effort.
      const parent = await this.stat(helper, dir);

      if (parent) {
        const chown = await helper.exec(["chown", `${parent.uid}:${parent.gid}`, abs]);

        if (chown.exitCode !== 0) {
          this.logger.warn(`chown of new dir ${abs} failed: ${chown.stderr.trim()}`);
        }
      }
    });
  }

  async move(deploymentId: string, volume: string, from: string, to: string): Promise<void> {
    await this.resolve(deploymentId, volume);
    const absFrom = containerPath(from);
    const absTo = containerPath(to);

    if (absFrom === VOLUME_ROOT) {
      throw new BadRequestException("cannot move the volume root");
    }

    await this.helpers.withHelper(deploymentId, volume, async (helper) => {
      if (!(await this.stat(helper, absFrom))) {
        throw new NotFoundException("source not found");
      }

      const result = await helper.exec(["mv", absFrom, absTo]);

      if (result.exitCode !== 0) {
        throw new FileManagerError(result.stderr.trim() || "failed to move");
      }
    });
  }

  async remove(
    deploymentId: string,
    volume: string,
    targetPath: string,
    recursive: boolean,
  ): Promise<void> {
    await this.resolve(deploymentId, volume);
    const abs = containerPath(targetPath);

    if (abs === VOLUME_ROOT) {
      throw new BadRequestException("cannot delete the volume root");
    }

    await this.helpers.withHelper(deploymentId, volume, async (helper) => {
      const info = await this.stat(helper, abs);

      if (!info) {
        throw new NotFoundException("path not found");
      }

      const cmd =
        info.type === "dir" ? (recursive ? ["rm", "-rf", abs] : ["rmdir", abs]) : ["rm", "-f", abs];
      const result = await helper.exec(cmd);

      if (result.exitCode !== 0) {
        throw new FileManagerError(result.stderr.trim() || "failed to delete");
      }
    });
  }

  async chmod(
    deploymentId: string,
    volume: string,
    targetPath: string,
    mode: string,
    recursive: boolean,
  ): Promise<void> {
    await this.resolve(deploymentId, volume);
    const abs = containerPath(targetPath);

    await this.helpers.withHelper(deploymentId, volume, async (helper) => {
      if (!(await this.stat(helper, abs))) {
        throw new NotFoundException("path not found");
      }

      const result = await helper.exec(["chmod", ...(recursive ? ["-R"] : []), mode, abs]);

      if (result.exitCode !== 0) {
        throw new FileManagerError(result.stderr.trim() || "failed to change mode");
      }
    });
  }

  async chown(
    deploymentId: string,
    volume: string,
    targetPath: string,
    uid: number,
    gid: number,
    recursive: boolean,
  ): Promise<void> {
    await this.resolve(deploymentId, volume);
    const abs = containerPath(targetPath);

    await this.helpers.withHelper(deploymentId, volume, async (helper) => {
      if (!(await this.stat(helper, abs))) {
        throw new NotFoundException("path not found");
      }

      const result = await helper.exec([
        "chown",
        ...(recursive ? ["-R"] : []),
        `${uid}:${gid}`,
        abs,
      ]);

      if (result.exitCode !== 0) {
        throw new FileManagerError(result.stderr.trim() || "failed to change owner");
      }
    });
  }

  async upload(
    deploymentId: string,
    volume: string,
    dirPath: string,
    filename: string,
    content: Buffer,
  ): Promise<void> {
    await this.resolve(deploymentId, volume);
    const absDir = containerPath(dirPath);
    const name = assertBasename(filename);

    if (content.length > this.maxUploadBytes) {
      throw new FileManagerError(`upload exceeds the ${this.maxUploadBytes}-byte limit`);
    }

    await this.helpers.withHelper(deploymentId, volume, async (helper) => {
      const dir = await this.stat(helper, absDir);

      if (!dir || dir.type !== "dir") {
        throw new NotFoundException("target directory not found");
      }

      const existing = await this.stat(helper, `${absDir}/${name}`);
      const meta = existing
        ? { mode: existing.perm, uid: existing.uid, gid: existing.gid }
        : { mode: 0o644, uid: dir.uid, gid: dir.gid };

      const tar = await buildFileTar(name, content, meta);
      await helper.putArchive(tar, absDir);
    });
  }

  async download(
    deploymentId: string,
    volume: string,
    targetPath: string,
  ): Promise<DownloadResult> {
    await this.resolve(deploymentId, volume);
    const abs = containerPath(targetPath);

    return this.helpers.beginStream(deploymentId, volume, async (helper) => {
      const info = await this.stat(helper, abs);

      if (!info) {
        throw new NotFoundException("path not found");
      }

      if (info.type === "dir") {
        const stream = await helper.getArchive(abs);

        return {
          stream,
          filename: `${basename(abs)}.tar`,
          contentType: "application/x-tar",
        };
      }

      await this.assertNoEscape(helper, abs);
      const archive = await helper.getArchive(abs);
      const stream = await streamSingleFile(archive);

      return { stream, filename: basename(abs), contentType: "application/octet-stream" };
    });
  }

  // Users/groups defined inside the volume (/etc/passwd, /etc/group) — used to label the chmod/chown
  // pickers. Empty when the volume carries no such files (the common case for app data volumes).
  async identities(
    deploymentId: string,
    volume: string,
  ): Promise<{ users: Identity[]; groups: Identity[] }> {
    await this.resolve(deploymentId, volume);

    return this.helpers.withHelper(deploymentId, volume, async (helper) => {
      const passwd = await helper.exec(["cat", containerPath("/etc/passwd")]);
      const group = await helper.exec(["cat", containerPath("/etc/group")]);

      return {
        users: this.parseColonTable(passwd),
        groups: this.parseColonTable(group),
      };
    });
  }

  // Parses an /etc/passwd or /etc/group table: `name:x:id:...` → { id, name }, ascending by id.
  private parseColonTable(result: ExecResult): Identity[] {
    if (result.exitCode !== 0) {
      return [];
    }

    const seen = new Set<number>();
    const identities: Identity[] = [];

    for (const line of result.stdout.split("\n")) {
      const fields = line.split(":");
      const name = fields[0];
      const id = Number(fields[2]);

      if (!name || fields.length < 3 || !Number.isInteger(id) || seen.has(id)) {
        continue;
      }

      seen.add(id);
      identities.push({ id, name });
    }

    return identities.sort((a, b) => a.id - b.id);
  }

  // Validates the deployment exists and the volume actually belongs to it — this is what keeps a
  // caller from mounting an arbitrary host volume (e.g. willy_backups) through the file manager.
  private async resolve(deploymentId: string, volume: string): Promise<Deployment> {
    const deployment = await this.deployments.findById(deploymentId);

    if (!deployment) {
      throw new NotFoundException("deployment not found");
    }

    const containers = await this.containers.listForDeployment(deployment);
    const volumes = new Set(containers.flatMap((c) => c.volumes.map((mount) => mount.name)));

    if (!volumes.has(volume)) {
      throw new NotFoundException("volume not found for this deployment");
    }

    return deployment;
  }

  private async stat(helper: HelperHandle, absPath: string): Promise<StatInfo | null> {
    const result = await helper.exec(["stat", "-c", "%f|%s|%u|%g|%Y", absPath]);

    if (result.exitCode !== 0) {
      return null;
    }

    return this.parseStatLine(result.stdout.trim());
  }

  private parseStatLine(line: string): StatInfo | null {
    const parts = line.split("|");

    if (parts.length < 5) {
      return null;
    }

    const raw = Number.parseInt(parts[0] ?? "", 16);

    if (Number.isNaN(raw)) {
      return null;
    }

    return {
      type: this.fileType(raw),
      perm: raw & 0o7777,
      size: Number(parts[1]),
      uid: Number(parts[2]),
      gid: Number(parts[3]),
      mtimeMs: Number(parts[4]) * 1000,
    };
  }

  private fileType(rawMode: number): FileEntryType {
    const fmt = rawMode & 0o170000;

    if (fmt === 0o040000) {
      return "dir";
    }

    if (fmt === 0o100000) {
      return "file";
    }

    if (fmt === 0o120000) {
      return "symlink";
    }

    return "other";
  }

  private toEntry(name: string, info: StatInfo): DirEntryDto {
    return {
      name,
      type: info.type,
      size: info.size,
      mode: this.modeOctal(info.perm),
      modeHuman: this.modeHuman(info.perm),
      uid: info.uid,
      gid: info.gid,
      mtime: new Date(info.mtimeMs).toISOString(),
    };
  }

  private modeOctal(perm: number): string {
    return perm.toString(8).padStart(4, "0");
  }

  private modeHuman(perm: number): string {
    const bits = ["r", "w", "x"];

    return [6, 3, 0]
      .map((shift) =>
        bits.map((flag, index) => ((perm >> (shift + (2 - index))) & 1 ? flag : "-")).join(""),
      )
      .join("");
  }

  // New files/dirs adopt the parent directory's owner so a container running as a non-root uid keeps
  // access; the parent must exist (the tree only ever writes into a dir it has navigated into).
  private async newFileMeta(
    helper: HelperHandle,
    dir: string,
  ): Promise<{ mode: number; uid: number; gid: number }> {
    const parent = await this.stat(helper, dir);

    if (!parent || parent.type !== "dir") {
      throw new NotFoundException("parent directory not found");
    }

    return { mode: 0o644, uid: parent.uid, gid: parent.gid };
  }

  // Refuse to follow a symlink whose real target leaves the volume (defense in depth on top of the
  // helper's no-network, read-only rootfs).
  private async assertNoEscape(helper: HelperHandle, abs: string): Promise<void> {
    const result: ExecResult = await helper.exec(["realpath", abs]);

    if (result.exitCode !== 0) {
      throw new NotFoundException("path not found");
    }

    const real = result.stdout.trim();

    if (real !== VOLUME_ROOT && !real.startsWith(`${VOLUME_ROOT}/`)) {
      throw new FileManagerError("path resolves outside the volume");
    }
  }
}
