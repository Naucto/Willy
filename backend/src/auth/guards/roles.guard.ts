import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "../../users/users.service";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { AuthUser } from "../jwt-payload.interface";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;

    return user !== undefined && required.includes(user.role);
  }
}
