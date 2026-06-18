import { Body, Controller, Get, HttpCode, Ip, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AuditService } from "../audit/audit.service";
import { OkResponseDto } from "../common/dto/ok.dto";
import { AuthService } from "./auth.service";
import { CurrentUser, RefreshToken } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";
import { AuthUserDto, SessionDto } from "./dto/session.dto";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { AuthUser } from "./jwt-payload.interface";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @HttpCode(200)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: SessionDto })
  @Post("login")
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    const session = await this.auth.login(dto.email, dto.password);
    await this.audit.record({ actorId: session.user.id, action: "LOGIN", ip });

    return session;
  }

  // Auth is the refresh token presented as a bearer (verified by JwtRefreshGuard).
  @Public()
  @UseGuards(JwtRefreshGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOkResponse({ type: SessionDto })
  @Post("refresh")
  refresh(@CurrentUser() user: AuthUser, @RefreshToken() token: string) {
    return this.auth.refresh(user.userId, token);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  @Post("logout")
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.userId);

    return { ok: true };
  }

  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserDto })
  @Get("me")
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
