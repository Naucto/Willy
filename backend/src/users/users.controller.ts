import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
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
import { CreateUserDto, SetPasswordDto, UpdateUserRoleDto, UserDto } from "./dto/user.dto";
import { type User, UsersService } from "./users.service";

function toDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

// Panel access management — admin-only. Operates on the humans who can log into Willy.
@ApiTags("users")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @ApiOkResponse({ type: [UserDto] })
  @Get()
  async list(): Promise<UserDto[]> {
    return (await this.users.list()).map(toDto);
  }

  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({ type: UserDto })
  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<UserDto> {
    const user = await this.users.createWithPassword(dto.email, dto.password, dto.role);
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
  @ApiBody({ type: UpdateUserRoleDto })
  @ApiOkResponse({ type: UserDto })
  @Patch(":id/role")
  async setRole(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<UserDto> {
    // Don't let the last admin demote themselves into a lockout.
    if (id === actor.userId && dto.role !== "ADMIN") {
      throw new BadRequestException("you cannot change your own role");
    }

    await this.users.setRole(id, dto.role);
    const user = await this.users.findById(id);

    if (!user) {
      throw new BadRequestException("user not found");
    }

    await this.audit.record({
      actorId: actor.userId,
      action: "USER_ROLE_CHANGE",
      targetType: "user",
      targetId: id,
      ip,
      metadata: { role: dto.role },
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
