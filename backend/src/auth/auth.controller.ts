import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentUser, RefreshToken } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { AuthUser } from "./jwt-payload.interface";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(200)
  @Post("refresh")
  refresh(@CurrentUser() user: AuthUser, @RefreshToken() token: string) {
    return this.auth.refresh(user.userId, token);
  }

  @HttpCode(200)
  @Post("logout")
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.userId);

    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
