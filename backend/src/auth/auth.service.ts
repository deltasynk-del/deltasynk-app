import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { permissionsForRole } from '../access/permissions';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  BCRYPT_ROUNDS,
  assertPasswordPolicy,
  assertPasswordsMatch,
} from '../common/utils/password.util';
import { normalizePhone } from '../common/utils/phone.util';
import { sha256 } from '../common/utils/secret-crypto.util';
import { passwordResetEmail } from '../mail/email-templates';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/password.dto';
import { UpdateSelfProfileDto } from './dto/profile.dto';
import { VerifyLoginOtpDto } from './dto/two-factor.dto';
import { LOCKOUT_MS, MAX_FAILED_LOGINS } from './two-factor.constants';
import { TwoFactorService } from './two-factor.service';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
// Compared against when no account matches, so response time does not reveal
// whether an email/phone is registered.
const DUMMY_HASH = bcrypt.hashSync('no-such-account', BCRYPT_ROUNDS);

export interface SessionUser {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: string;
  permissions: string[];
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
}

export interface AuthTokenResponse {
  accessToken: string;
  user: SessionUser;
}

export interface Requires2faResponse {
  requires2fa: true;
  pendingToken: string;
  methods: Array<'totp' | 'email' | 'sms'>;
  primaryMethod: 'totp' | 'email' | 'sms' | null;
  maskedEmail: string;
  maskedPhone: string;
  recoveryAvailable: boolean;
}

export type LoginResult = AuthTokenResponse | Requires2faResponse;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mail: MailService,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, ip?: string): Promise<LoginResult> {
    const identifier = dto.identifier.trim();
    const user = await this.findUserForLogin(identifier);

    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      await this.audit.record({
        actorLabel: identifier.slice(0, 120),
        action: 'auth.login_failed',
        summary: 'Sign-in failed: no such account.',
        ip,
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException(
        'Too many failed attempts. Wait 15 minutes and try again.',
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.registerFailedPassword(user, ip);
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.isActive) {
      await this.audit.record({
        actor: user,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        summary: 'Sign-in refused: account is deactivated.',
        ip,
      });
      throw new UnauthorizedException(
        'This account has been deactivated. Contact the portal owner.',
      );
    }

    const status = await this.twoFactor.getStatus(user.id);
    if (!status.enabled) {
      return this.issueSession(user, ip);
    }

    const { maskedEmail, maskedPhone } = this.twoFactor.maskedContacts(
      user.email,
      await this.twoFactor.smsPhoneFor(user.id),
    );

    return {
      requires2fa: true,
      pendingToken: this.twoFactor.issuePendingToken(user.id),
      methods: [
        ...(status.methods.totp.confirmed ? (['totp'] as const) : []),
        ...(status.methods.email.confirmed ? (['email'] as const) : []),
        ...(status.methods.sms.confirmed ? (['sms'] as const) : []),
      ],
      primaryMethod: status.primaryMethod,
      maskedEmail,
      maskedPhone,
      recoveryAvailable: status.recoveryCodesRemaining > 0,
    };
  }

  /** Completes a 2FA-gated login and issues the real token. */
  async completeTwoFactorLogin(
    dto: VerifyLoginOtpDto,
    ip?: string,
  ): Promise<AuthTokenResponse> {
    const userId = await this.twoFactor.verifyLoginCode(
      dto.pendingToken,
      dto.method,
      dto.code,
    );
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) {
      throw new UnauthorizedException('Your access has changed. Sign in again.');
    }
    return this.issueSession(user, ip, dto.method);
  }

  sendLoginTwoFactorCode(pendingToken: string, method: 'email' | 'sms') {
    return this.twoFactor.sendLoginOtp(pendingToken, method);
  }

  async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toSessionUser(user);
  }

  async updateSelfProfile(
    userId: string,
    dto: UpdateSelfProfileDto,
  ): Promise<SessionUser> {
    let phone: string | null = null;
    if (dto.phone?.trim()) {
      phone = normalizePhone(dto.phone);
      if (!phone) {
        throw new BadRequestException('Enter a valid phone number.');
      }
      const taken = await this.prisma.user.findFirst({
        where: { phone, id: { not: userId } },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('Another user already uses this phone number.');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName.trim(), phone },
    });
    return this.toSessionUser(user);
  }

  async requestPasswordReset(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string; devResetUrl?: string }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    let devResetUrl: string | undefined;

    if (user?.isActive) {
      const rawToken = randomBytes(32).toString('hex');
      const appUrl = this.configService.get<string>('APP_URL') ?? 'http://localhost:4220';
      const resetUrl = `${appUrl}/auth/reset-password?token=${rawToken}`;

      await this.prisma.$transaction([
        this.prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        }),
        this.prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: sha256(rawToken),
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        }),
      ]);

      const sent = await this.mail.send({
        to: user.email,
        toName: user.fullName,
        subject: 'Password reset — DeltaSynk Portal',
        html: passwordResetEmail(user.fullName, resetUrl),
      });

      if (!sent && this.mail.shouldExposeDevLinks()) {
        this.logger.log(`Password reset link for ${email}: ${resetUrl}`);
        devResetUrl = resetUrl;
      }
      await this.audit.record({
        actor: user,
        action: 'auth.password_reset_requested',
        entityType: 'user',
        entityId: user.id,
        summary: 'Requested a password reset link.',
      });
    }

    return {
      message: 'If an account exists for that email, a reset link has been sent.',
      ...(devResetUrl ? { devResetUrl } : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    assertPasswordsMatch(dto.password, dto.confirmPassword);
    assertPasswordPolicy(dto.password);

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(dto.token.trim()) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
          // Signs out every device that was using the old password.
          tokenVersion: { increment: 1 },
        },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      actor: record.user,
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: record.userId,
      summary: 'Set a new password using a reset link.',
    });

    return { message: 'Your password has been updated. You can sign in now.' };
  }

  /** Returns a fresh token: every other session is signed out, this one continues. */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<AuthTokenResponse & { message: string }> {
    assertPasswordsMatch(dto.newPassword, dto.confirmPassword);
    assertPasswordPolicy(dto.newPassword);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Account not found.');
    }
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException('Choose a different password than your current one.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });
    await this.audit.record({
      actor: updated,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: userId,
      summary: 'Changed their password.',
    });

    return {
      message: 'Your password has been changed.',
      accessToken: this.signAccessToken(updated),
      user: await this.toSessionUser(updated),
    };
  }

  // ---------------------------------------------------------------------------

  private async findUserForLogin(identifier: string): Promise<User | null> {
    if (identifier.includes('@')) {
      return this.prisma.user.findUnique({
        where: { email: identifier.toLowerCase() },
      });
    }
    const phone = normalizePhone(identifier);
    if (!phone) return null;
    return this.prisma.user.findUnique({ where: { phone } });
  }

  private async registerFailedPassword(user: User, ip?: string): Promise<void> {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await this.prisma.user.update({
      where: { id: user.id },
      data: lock
        ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) }
        : { failedLoginCount: failed },
    });
    await this.audit.record({
      actor: user,
      action: lock ? 'auth.locked' : 'auth.login_failed',
      entityType: 'user',
      entityId: user.id,
      summary: lock
        ? 'Account paused for 15 minutes after repeated wrong passwords.'
        : 'Sign-in failed: wrong password.',
      ip,
    });
  }

  private async issueSession(
    user: User,
    ip?: string,
    secondFactor?: string,
  ): Promise<AuthTokenResponse> {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    await this.audit.record({
      actor: updated,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      summary: secondFactor
        ? `Signed in (two-step: ${secondFactor}).`
        : 'Signed in.',
      ip,
    });
    return {
      accessToken: this.signAccessToken(updated),
      user: await this.toSessionUser(updated),
    };
  }

  private signAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      tv: user.tokenVersion,
    };
    return this.jwtService.sign(payload);
  }

  private async toSessionUser(user: User): Promise<SessionUser> {
    const twoFactor = await this.twoFactor.getStatus(user.id);
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role,
      permissions: permissionsForRole(user.role),
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: twoFactor.enabled,
    };
  }
}
