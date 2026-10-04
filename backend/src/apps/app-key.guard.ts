import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConnectedApp } from '@prisma/client';
import { AppsService } from './apps.service';

export interface AppRequest {
  headers: Record<string, string | string[] | undefined>;
  sourceApp: ConnectedApp;
}

/** App-to-portal routes: the caller proves which app it is with x-portal-api-key. */
@Injectable()
export class AppKeyGuard implements CanActivate {
  constructor(private readonly apps: AppsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const header = request.headers['x-portal-api-key'];
    const app = await this.apps.authenticate(Array.isArray(header) ? header[0] : header);
    if (!app) {
      throw new UnauthorizedException('Invalid portal API key.');
    }
    request.sourceApp = app;
    return true;
  }
}
