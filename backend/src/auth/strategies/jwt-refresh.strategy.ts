import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthUser, JwtPayload } from "../jwt-payload.interface";

interface RequestWithAuthHeader {
  headers: { authorization?: string };
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, "jwt-refresh") {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      passReqToCallback: true,
    });
  }

  validate(req: RequestWithAuthHeader, payload: JwtPayload): AuthUser & { refreshToken: string } {
    const refreshToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();

    return { userId: payload.sub, email: payload.email, role: payload.role, refreshToken };
  }
}
