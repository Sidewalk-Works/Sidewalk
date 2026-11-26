import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@sidewalk/contracts";
import { AppError } from "../app-error";
import type { AuthedRequest } from "../auth-types";
import { ROLES_KEY } from "../decorators";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!roles || roles.length === 0) return true;
    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw AppError.unauthorized();
    if (!roles.includes(user.role))
      throw AppError.forbidden("This area is restricted to authorised staff.");
    if (!user.emailVerified) {
      throw AppError.forbidden(
        "Confirm your email address before using staff tools.",
        "EMAIL_NOT_VERIFIED"
      );
    }
    return true;
  }
}
