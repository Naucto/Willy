import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Ip,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { AuditService } from "../audit/audit.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/jwt-payload.interface";
import { OkResponseDto } from "../common/dto/ok.dto";
import {
  CreateUserDto,
  SetPasswordDto,
  SetUserDisabledDto,
  UpdateUserDto,
  UserDto,
} from "./dto/user.dto";
import { type User, UsersService } from "./users.service";

function toDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    disabled: user.disabled,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorConfigured: user.twoFactorSecret !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

// Self-service is allowed on a user's own row; touching anyone else requires admin.
function assertSelfOrAdmin(actor: AuthUser, id: string): void {
  if (actor.role !== "ADMIN" && actor.userId !== id) {
    throw new ForbiddenException("forbidden");
  }
}

// Treat a blank name as "unset" so clearing the field stores NULL, not "".
function normalizeName(name: string | undefined): string | null | undefined {
  if (name === undefined) {
    return undefined;
  }

  const trimmed = name.trim();

  return trimmed.length > 0 ? trimmed : null;
}

// Panel access management. The list + managing other users is admin-only; a signed-in user may view
// and edit their own row (profile, password, 2FA) — enforced per route.
@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Roles("ADMIN")
  @ApiOkResponse({ type: [UserDto] })
  @Get()
  async list(): Promise<UserDto[]> {
    return (await this.users.list()).map(toDto);
  }

  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: UserDto })
  @Get(":id")
  async get(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDto> {
    assertSelfOrAdmin(actor, id);
    const user = await this.users.findById(id);

    if (!user) {
      throw new NotFoundException("user not found");
    }

    return toDto(user);
  }

  @Roles("ADMIN")
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({ type: UserDto })
  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<UserDto> {
    const user = await this.users.createWithPassword(
      dto.email,
      dto.password,
      dto.role,
      normalizeName(dto.name),
    );
    await this.audit.record({
      actorId: actor.userId,
      action: "USER_CREATE",
      targetType: "user",
      targetId: user.id,
      ip,
      metadata: { email: user.email, role: user.role },
    });

    return toDto(user);
  }

  @ApiParam({ name: "id", type: String })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: UserDto })
  @Patch(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<UserDto> {
    assertSelfOrAdmin(actor, id);

    // Role changes are admin-only; the existing self-demote guard prevents an admin lockout.
    if (dto.role !== undefined) {
      if (actor.role !== "ADMIN") {
        throw new ForbiddenException("only admins can change roles");
      }

      if (id === actor.userId && dto.role !== "ADMIN") {
        throw new BadRequestException("you cannot change your own role");
      }
    }

    const name = normalizeName(dto.name);
    const user = await this.users.update(id, {
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(dto.role !== undefined ? { role: dto.role } : {}),
    });

    await this.audit.record({
      actorId: actor.userId,
      action: "USER_UPDATE",
      targetType: "user",
      targetId: id,
      ip,
      metadata: {
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
      },
    });

    return toDto(user);
  }

  @HttpCode(200)
  @ApiParam({ name: "id", type: String })
  @ApiBody({ type: SetPasswordDto })
  @ApiOkResponse({ type: OkResponseDto })
  @Patch(":id/password")
  async setPassword(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetPasswordDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    assertSelfOrAdmin(actor, id);
    await this.users.setPassword(id, dto.password);
    await this.audit.record({
      actorId: actor.userId,
      action: "USER_PASSWORD_RESET",
      targetType: "user",
      targetId: id,
      ip,
    });

    return { ok: true };
  }

  @Roles("ADMIN")
  @HttpCode(200)
  @ApiParam({ name: "id", type: String })
  @ApiBody({ type: SetUserDisabledDto })
  @ApiOkResponse({ type: OkResponseDto })
  @Patch(":id/disabled")
  async setDisabled(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetUserDisabledDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    if (id === actor.userId) {
      throw new BadRequestException("you cannot disable your own account");
    }

    const target = await this.users.findById(id);

    if (!target) {
      throw new NotFoundException("user not found");
    }

    await this.users.setDisabled(id, dto.disabled);
    await this.audit.record({
      actorId: actor.userId,
      action: dto.disabled ? "USER_DISABLE" : "USER_ENABLE",
      targetType: "user",
      targetId: id,
      ip,
    });

    return { ok: true };
  }

  @Roles("ADMIN")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete(":id")
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<{ ok: true }> {
    if (id === actor.userId) {
      throw new BadRequestException("you cannot delete your own account");
    }

    await this.users.remove(id);
    await this.audit.record({
      actorId: actor.userId,
      action: "USER_DELETE",
      targetType: "user",
      targetId: id,
      ip,
    });

    return { ok: true };
  }
}
