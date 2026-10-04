import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '../../access/permissions';
import {
  ALLOW_PASSWORD_PENDING_KEY,
  ANY_USER_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
} from '../decorators/access.decorators';
import { AuthenticatedUser } from '../types/jwt-payload.interface';

/**
 * Registered globally, after JwtAuthGuard. Deny by default: a route that is not
 * @Public(), @AnyUser() or @RequirePermissions(...) is refused, so a forgotten
 * decorator can never expose an endpoint.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!user) {
      throw new ForbiddenException('You do not have access to this action.');
    }

    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_PENDING_KEY, targets)
    ) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Choose a new password before continuing.',
      });
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      targets,
    );
    if (required?.length) {
      if (required.every((p) => user.permissions.includes(p))) return true;
      throw new ForbiddenException('Your role does not allow this action.');
    }

    if (this.reflector.getAllAndOverride<boolean>(ANY_USER_KEY, targets)) {
      return true;
    }

    throw new ForbiddenException('You do not have access to this action.');
  }
}
