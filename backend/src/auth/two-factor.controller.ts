import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Ip,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { AuditService } from "../audit/audit.service";
import { OkResponseDto } from "../common/dto/ok.dto";
import { UsersService } from "../users/users.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Roles } from "./decorators/roles.decorator";
import { TotpConfirmDto, TotpSetupResponseDto } from "./dto/totp.dto";
import type { AuthUser } from "./jwt-payload.interface";
import { TwoFactorService } from "./two-factor.service";

// Authenticated 2FA management. Enrolling (setup/confirm) is self-only — an admin can't scan another
// person's authenticator. Admins can require 2FA on a user and reset it (the recovery path).
@ApiTags("users")
@ApiBearerAuth()
@Controller("users/:id/2fa")
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: TotpSetupResponseDto })
  @HttpCode(200)
  @Post("setup")
  async setup(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<TotpSetupResponseDto> {
    if (actor.userId !== id) {
      throw new ForbiddenException("you can only set up two-factor auth on your own account");
    }

    const user = await this.users.findById(id);

    if (!user) {
      throw new NotFoundException("user not found");
    }

    const { secret, otpauthUri } = this.twoFactor.generateSecret(user.email);

    return { secret, otpauthUri, setupToken: await this.twoFactor.mintSetupToken(id, secret) };
  }

  @ApiParam({ name: "id", type: String })
  @ApiBody({ type: TotpConfirmDto })
  @ApiOkResponse({ type: OkResponseDto })
  @HttpCode(200)
  @Post("confirm")
  async confirm(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TotpConfirmDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<OkResponseDto> {
    if (actor.userId !== id) {
      throw new ForbiddenException("you can only set up two-factor auth on your own account");
    }

    const { userId, secret } = await this.twoFactor.verifySetupToken(dto.setupToken);

    if (userId !== id || !this.twoFactor.verifyCode(secret, dto.code)) {
      throw new BadRequestException("invalid code");
    }

    await this.twoFactor.enable(id, secret);
    await this.audit.record({ actorId: actor.userId, action: "TWOFA_ENABLE", targetId: id, ip });

    return { ok: true };
  }

  @Roles("ADMIN")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @HttpCode(200)
  @Post("require")
  async require(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<OkResponseDto> {
    const user = await this.users.findById(id);

    if (!user) {
      throw new NotFoundException("user not found");
    }

    await this.twoFactor.require(id);
    await this.audit.record({ actorId: actor.userId, action: "TWOFA_REQUIRE", targetId: id, ip });

    return { ok: true };
  }

  // Disable / reset. Self can turn off their own; an admin can reset any user (recovery).
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({ type: OkResponseDto })
  @Delete()
  async disable(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ): Promise<OkResponseDto> {
    if (actor.role !== "ADMIN" && actor.userId !== id) {
      throw new ForbiddenException("forbidden");
    }

    await this.twoFactor.disable(id);
    await this.audit.record({ actorId: actor.userId, action: "TWOFA_DISABLE", targetId: id, ip });

    return { ok: true };
  }
}
