import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Readable } from "node:stream";
import { AuditService } from "../audit/audit.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { OkResponseDto } from "../common/dto/ok.dto";
import { ReadFileResponseDto } from "./dto/file-content.dto";
import { ListDirResponseDto } from "./dto/file-entry.dto";
import { VolumeIdentitiesDto } from "./dto/identities.dto";
import { ChmodDto, ChownDto, DeleteDto, MkdirDto, MoveDto, WriteFileDto } from "./dto/file-ops.dto";
import { FileManagerExceptionFilter } from "./file-manager-exception.filter";
import { FilesService } from "./files.service";

const MAX_UPLOAD_BYTES = Number(process.env.FILE_MANAGER_MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

interface UploadedMulterFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

@ApiTags("files")
@ApiBearerAuth()
@ApiParam({ name: "id", type: String })
@ApiParam({ name: "name", type: String, description: "Volume name" })
@UseFilters(FileManagerExceptionFilter)
@Controller("deployments")
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  @ApiQuery({ name: "path", required: false, type: String })
  @ApiOkResponse({ type: ListDirResponseDto })
  @Get(":id/volumes/:name/files")
  async list(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
    @Query("path") path = "/",
  ): Promise<ListDirResponseDto> {
    const entries = await this.files.list(id, name, path);

    return { path, entries };
  }

  @ApiQuery({ name: "path", required: true, type: String })
  @ApiOkResponse({ type: ReadFileResponseDto })
  @Get(":id/volumes/:name/file")
  async read(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
    @Query("path") path: string,
  ): Promise<ReadFileResponseDto> {
    return this.files.read(id, name, path);
  }

  @ApiOkResponse({ type: VolumeIdentitiesDto })
  @Get(":id/volumes/:name/identities")
  async identities(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
  ): Promise<VolumeIdentitiesDto> {
    return this.files.identities(id, name);
  }

  @ApiQuery({ name: "path", required: true, type: String })
  @Get(":id/volumes/:name/download")
  async download(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
    @Query("path") path: string,
  ): Promise<StreamableFile> {
    const { stream, filename, contentType } = await this.files.download(id, name, path);

    return new StreamableFile(stream as Readable, {
      type: contentType,
      disposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
    });
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: WriteFileDto })
  @ApiOkResponse({ type: OkResponseDto })
  @Post(":id/volumes/:name/file")
  async write(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
    @Body() dto: WriteFileDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    await this.files.write(id, name, dto.path, dto.contentBase64, dto.create ?? true);
    await this.recordChange(user, ip, id, name, "write", dto.path);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: MkdirDto })
  @ApiOkResponse({ type: OkResponseDto })
  @Post(":id/volumes/:name/mkdir")
  async mkdir(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
    @Body() dto: MkdirDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    await this.files.mkdir(id, name, dto.path);
    await this.recordChange(user, ip, id, name, "mkdir", dto.path);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: MoveDto })
  @ApiOkResponse({ type: OkResponseDto })
  @Post(":id/volumes/:name/move")
  async move(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
    @Body() dto: MoveDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    await this.files.move(id, name, dto.from, dto.to);
    await this.recordChange(user, ip, id, name, "move", `${dto.from} -> ${dto.to}`);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: ChmodDto })
  @ApiOkResponse({ type: OkResponseDto })
  @Post(":id/volumes/:name/chmod")
  async chmod(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
    @Body() dto: ChmodDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    await this.files.chmod(id, name, dto.path, dto.mode, dto.recursive ?? false);
    await this.recordChange(user, ip, id, name, "chmod", dto.path);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiBody({ type: ChownDto })
  @ApiOkResponse({ type: OkResponseDto })
  @Post(":id/volumes/:name/chown")
  async chown(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
    @Body() dto: ChownDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    await this.files.chown(id, name, dto.path, dto.uid, dto.gid, dto.recursive ?? false);
    await this.recordChange(user, ip, id, name, "chown", dto.path);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        path: { type: "string", description: "target directory" },
      },
    },
  })
  @ApiOkResponse({ type: OkResponseDto })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @Post(":id/volumes/:name/upload")
  async upload(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
    @Body("path") path: string,
    @UploadedFile() file: UploadedMulterFile,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    await this.files.upload(id, name, path ?? "/", file.originalname, file.buffer);
    await this.recordChange(user, ip, id, name, "upload", `${path ?? "/"}/${file.originalname}`);

    return { ok: true };
  }

  @Roles("ADMIN", "OPERATOR")
  @HttpCode(200)
  @ApiBody({ type: DeleteDto })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete(":id/volumes/:name/file")
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("name") name: string,
    @Body() dto: DeleteDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    await this.files.remove(id, name, dto.path, dto.recursive ?? false);
    await this.recordChange(user, ip, id, name, "delete", dto.path);

    return { ok: true };
  }

  private recordChange(
    user: AuthUser,
    ip: string,
    deploymentId: string,
    volume: string,
    op: string,
    path: string,
  ): Promise<void> {
    return this.audit.record({
      actorId: user.userId,
      action: "FILE_CHANGE",
      targetType: "volume",
      targetId: volume,
      ip,
      metadata: { deploymentId, op, path },
    });
  }
}
