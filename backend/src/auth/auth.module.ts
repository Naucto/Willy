import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module";
import { AdminSeedService } from "./admin-seed.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtRefreshStrategy } from "./strategies/jwt-refresh.strategy";

@Module({
  imports: [UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AdminSeedService,
    JwtStrategy,
    JwtRefreshStrategy,
    // Global auth: every route requires a valid access token unless marked @Public,
    // then role checks run for routes annotated with @Roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
