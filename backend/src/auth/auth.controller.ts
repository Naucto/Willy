import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle, Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AuditService } from "../audit/audit.service";
import { OkResponseDto } from "../common/dto/ok.dto";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
import { CurrentUser, RefreshToken } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";
import { AuthUserDto, SessionDto } from "./dto/session.dto";
import {
  LoginResultDto,
  TotpConfirmDto,
  TotpLoginDto,
  TotpSetupResponseDto,
  TotpSetupStartDto,
} from "./dto/totp.dto";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { AuthUser } from "./jwt-payload.interface";
import { capabilitiesForRole } from "./permissions";

@ApiTags("auth")
@UseGuards(ThrottlerGuard)
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  // Brute-force guard: 10 attempts per 5 min per client IP.
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Public()
  @HttpCode(200)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResultDto })
  @Post("login")
  async login(@Body() dto: LoginDto, @Ip() ip: string): Promise<LoginResultDto> {
    const outcome = await this.auth.login(dto.email, dto.password);

    if (outcome.status === "authenticated") {
      await this.audit.record({ actorId: outcome.session.user.id, action: "LOGIN", ip });

      return { status: "authenticated", session: outcome.session };
    }

    return { status: outcome.status, challengeToken: outcome.challengeToken };
  }

  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Public()
  @HttpCode(200)
  @ApiBody({ type: TotpLoginDto })
  @ApiOkResponse({ type: SessionDto })
  @Post("2fa/login")
  async totpLogin(@Body() dto: TotpLoginDto, @Ip() ip: string): Promise<SessionDto> {
    const session = await this.auth.verifyTotpLogin(dto.challengeToken, dto.code);
    await this.audit.record({ actorId: session.user.id, action: "LOGIN", ip });

    return session;
  }

  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Public()
  @HttpCode(200)
  @ApiBody({ type: TotpSetupStartDto })
  @ApiOkResponse({ type: TotpSetupResponseDto })
  @Post("2fa/setup")
  totpSetup(@Body() dto: TotpSetupStartDto): Promise<TotpSetupResponseDto> {
    return this.auth.startTotpSetup(dto.challengeToken);
  }

  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Public()
  @HttpCode(200)
  @ApiBody({ type: TotpConfirmDto })
  @ApiOkResponse({ type: SessionDto })
  @Post("2fa/confirm")
  async totpConfirm(@Body() dto: TotpConfirmDto, @Ip() ip: string): Promise<SessionDto> {
    const session = await this.auth.confirmTotpSetup(dto.setupToken, dto.code);
    await this.audit.record({ actorId: session.user.id, action: "TWOFA_ENABLE", ip });
    await this.audit.record({ actorId: session.user.id, action: "LOGIN", ip });

    return session;
  }

  // Already authenticated (a valid refresh token is presented + verified by JwtRefreshGuard), so it's
  // not a brute-force target — don't IP-throttle it, or fast navigation can spuriously 429 → logout.
  @SkipThrottle()
  @Public()
  @UseGuards(JwtRefreshGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOkResponse({ type: SessionDto })
  @Post("refresh")
  refresh(@CurrentUser() user: AuthUser, @RefreshToken() token: string) {
    return this.auth.refresh(user.userId, token);
  }

  @SkipThrottle()
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  @Post("logout")
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.userId);

    return { ok: true };
  }

  @SkipThrottle()
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserDto })
  @Get("me")
  async me(@CurrentUser() user: AuthUser): Promise<AuthUserDto> {
    // Read fresh from the DB so name/email/role reflect any admin edits since the token was issued.
    const current = await this.users.findById(user.userId);

    if (!current) {
      throw new UnauthorizedException();
    }

    return {
      userId: current.id,
      email: current.email,
      name: current.name,
      role: current.role,
      permissions: capabilitiesForRole(current.role),
    };
  }
}
