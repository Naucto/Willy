import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { AuthUser } from "../jwt-payload.interface";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
  },
);

export const RefreshToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    return ctx.switchToHttp().getRequest<{ user: { refreshToken: string } }>().user.refreshToken;
  },
);
