import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { permissionsForRole } from '../../access/permissions';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/types/jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * The role and permissions are read from the database on every request, not
   * trusted from the token — a demoted or deactivated user loses access at once.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.purpose === 'twofa') {
      throw new UnauthorizedException('Two-factor verification is incomplete.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      permissions: permissionsForRole(user.role),
      mustChangePassword: user.mustChangePassword,
    };
  }
}
