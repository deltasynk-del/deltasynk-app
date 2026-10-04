import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TwoFactorMethod, UserTwoFactor } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { AuditService } from '../audit/audit.service';
import { normalizePhone } from '../common/utils/phone.util';
import {
  decryptSecret,
  encryptSecret,
  sha256,
} from '../common/utils/secret-crypto.util';
import { twoFactorCodeEmail } from '../mail/email-templates';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import {
  EnrollableTwoFactorMethod,
  LoginTwoFactorMethod,
} from './dto/two-factor.dto';
import {
  CHALLENGE_TTL_MS,
  LOCKOUT_MS,
  MAX_CHALLENGE_ATTEMPTS,
  OTP_DIGITS,
  PENDING_TOKEN_PURPOSE,
  PENDING_TOKEN_TTL,
  RECOVERY_CODE_COUNT,
  TOTP_ISSUER,
  maskEmail,
  maskPhone,
} from './two-factor.constants';

export interface TwoFactorStatus {
  enabled: boolean;
  primaryMethod: EnrollableTwoFactorMethod | null;
  methods: {
    totp: { confirmed: boolean };
    email: { confirmed: boolean };
    sms: { confirmed: boolean; phone: string | null };
  };
  recoveryCodesRemaining: number;
  lastUsedAt: string | null;
  lastUsedMethod: EnrollableTwoFactorMethod | null;
}

export interface ActivateResult {
  status: TwoFactorStatus;
  /** Present only when this activation first enabled 2FA. */
  recoveryCodes?: string[];
}

export interface CodeDispatchResult {
  message: string;
  devCode?: string;
}

authenticator.options = { window: 1 };

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async getStatus(userId: string): Promise<TwoFactorStatus> {
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId } });
    return this.toStatus(row, await this.recoveryRemaining(row?.id));
  }

  private toStatus(
    row: UserTwoFactor | null,
    recoveryCodesRemaining: number,
  ): TwoFactorStatus {
    return {
      enabled: Boolean(row?.enabled),
      primaryMethod:
        (row?.primaryMethod as EnrollableTwoFactorMethod | undefined) ?? null,
      methods: {
        totp: { confirmed: Boolean(row?.totpConfirmedAt) },
        email: { confirmed: Boolean(row?.emailOtpConfirmedAt) },
        sms: {
          confirmed: Boolean(row?.smsOtpConfirmedAt),
          phone: row?.smsOtpConfirmedAt ? maskPhone(row.smsOtpPhone) : null,
        },
      },
      recoveryCodesRemaining,
      lastUsedAt: row?.lastUsedAt?.toISOString() ?? null,
      lastUsedMethod:
        (row?.lastUsedMethod as EnrollableTwoFactorMethod | undefined) ?? null,
    };
  }

  private async recoveryRemaining(twoFactorId?: string): Promise<number> {
    if (!twoFactorId) return 0;
    return this.prisma.twoFactorRecoveryCode.count({
      where: { twoFactorId, usedAt: null },
    });
  }

  private async getOrCreateRow(userId: string): Promise<UserTwoFactor> {
    return this.prisma.userTwoFactor.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  private confirmedMethods(row: UserTwoFactor): EnrollableTwoFactorMethod[] {
    const methods: EnrollableTwoFactorMethod[] = [];
    if (row.totpConfirmedAt) methods.push('totp');
    if (row.emailOtpConfirmedAt) methods.push('email');
    if (row.smsOtpConfirmedAt) methods.push('sms');
    return methods;
  }

  // ---------------------------------------------------------------------------
  // Enrollment
  // ---------------------------------------------------------------------------

  async totpInit(
    userId: string,
  ): Promise<{ secret: string; otpauthUri: string; qrDataUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const row = await this.getOrCreateRow(userId);
    if (row.totpConfirmedAt) {
      throw new BadRequestException(
        'An authenticator app is already set up. Remove it first to re-enrol.',
      );
    }

    const secret = authenticator.generateSecret();
    const otpauthUri = authenticator.keyuri(user.email, TOTP_ISSUER, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUri);

    await this.prisma.userTwoFactor.update({
      where: { id: row.id },
      data: { totpSecret: encryptSecret(secret) },
    });

    return { secret, otpauthUri, qrDataUrl };
  }

  async totpActivate(userId: string, code: string): Promise<ActivateResult> {
    const row = await this.getOrCreateRow(userId);
    if (!row.totpSecret) {
      throw new BadRequestException('Start authenticator setup first.');
    }
    if (!this.verifyTotp(row, code)) {
      throw new UnauthorizedException('That code is incorrect. Try again.');
    }
    await this.prisma.userTwoFactor.update({
      where: { id: row.id },
      data: { totpConfirmedAt: new Date() },
    });
    return this.finishActivation(userId, 'totp');
  }

  async emailInit(userId: string): Promise<CodeDispatchResult> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, fullName: true },
    });
    const row = await this.getOrCreateRow(userId);
    const code = this.numericCode();
    await this.writeChallenge(row.id, TwoFactorMethod.email, code);
    return this.sendEmailCode(user, code);
  }

  async emailActivate(userId: string, code: string): Promise<ActivateResult> {
    const row = await this.getOrCreateRow(userId);
    await this.consumeChallenge(row, TwoFactorMethod.email, code);
    await this.prisma.userTwoFactor.update({
      where: { id: row.id },
      data: { emailOtpConfirmedAt: new Date() },
    });
    return this.finishActivation(userId, 'email');
  }

  async smsInit(userId: string, phoneOverride?: string): Promise<CodeDispatchResult> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { phone: true },
    });
    const phone = normalizePhone(phoneOverride ?? user.phone);
    if (!phone) {
      throw new BadRequestException(
        'Add a valid phone number to your profile, or provide one, before enabling SMS codes.',
      );
    }
    const row = await this.getOrCreateRow(userId);
    const code = this.numericCode();
    await this.prisma.userTwoFactor.update({
      where: { id: row.id },
      // Changing the number un-confirms SMS until the new number proves itself.
      data: {
        smsOtpPhone: phone,
        ...(row.smsOtpPhone !== phone ? { smsOtpConfirmedAt: null } : {}),
      },
    });
    await this.writeChallenge(row.id, TwoFactorMethod.sms, code);
    return this.sendSmsCode(phone, code);
  }

  async smsActivate(userId: string, code: string): Promise<ActivateResult> {
    const row = await this.getOrCreateRow(userId);
    await this.consumeChallenge(row, TwoFactorMethod.sms, code);
    await this.prisma.userTwoFactor.update({
      where: { id: row.id },
      data: { smsOtpConfirmedAt: new Date() },
    });
    return this.finishActivation(userId, 'sms');
  }

  // ---------------------------------------------------------------------------
  // Management
  // ---------------------------------------------------------------------------

  async setPrimary(
    userId: string,
    method: EnrollableTwoFactorMethod,
  ): Promise<TwoFactorStatus> {
    const row = await this.getOrCreateRow(userId);
    if (!this.confirmedMethods(row).includes(method)) {
      throw new BadRequestException('Set up that method before making it primary.');
    }
    await this.prisma.userTwoFactor.update({
      where: { id: row.id },
      data: { primaryMethod: method as TwoFactorMethod },
    });
    return this.getStatus(userId);
  }

  async regenerateRecoveryCodes(
    userId: string,
    password: string,
  ): Promise<{ recoveryCodes: string[] }> {
    await this.assertPassword(userId, password);
    const row = await this.requireEnabled(userId);
    return { recoveryCodes: await this.replaceRecoveryCodes(row.id) };
  }

  /** Sends a code to an already-confirmed email/SMS method, for disabling or removing. */
  async sendManagementCode(
    userId: string,
    method: 'email' | 'sms',
  ): Promise<CodeDispatchResult> {
    const row = await this.requireEnabled(userId);
    return this.sendChallengeTo(userId, row, method);
  }

  async removeMethod(
    userId: string,
    method: EnrollableTwoFactorMethod,
    password: string,
    code: string,
  ): Promise<TwoFactorStatus> {
    await this.assertPassword(userId, password);
    const row = await this.requireEnabled(userId);
    if (!this.confirmedMethods(row).includes(method)) {
      throw new BadRequestException('That method is not set up.');
    }
    if (!(await this.verifyAnyCode(row, code))) {
      throw new UnauthorizedException('That verification code is incorrect.');
    }

    const remaining = this.confirmedMethods(row).filter((m) => m !== method);
    if (remaining.length === 0) {
      await this.wipe(row.id);
      await this.auditChange(userId, 'auth.2fa.disabled', 'Turned off two-step verification.');
      return this.getStatus(userId);
    }

    const clear =
      method === 'totp'
        ? { totpConfirmedAt: null, totpSecret: null }
        : method === 'email'
          ? { emailOtpConfirmedAt: null }
          : { smsOtpConfirmedAt: null, smsOtpPhone: null };

    await this.prisma.userTwoFactor.update({
      where: { id: row.id },
      data: {
        ...clear,
        ...this.clearedChallenge(),
        primaryMethod:
          row.primaryMethod === (method as TwoFactorMethod)
            ? (remaining[0] as TwoFactorMethod)
            : row.primaryMethod,
      },
    });
    await this.auditChange(
      userId,
      'auth.2fa.method_removed',
      `Removed the ${method} two-step method.`,
    );
    return this.getStatus(userId);
  }

  async disable(userId: string, password: string, code: string): Promise<TwoFactorStatus> {
    await this.assertPassword(userId, password);
    const row = await this.requireEnabled(userId);
    if (!(await this.verifyAnyCode(row, code))) {
      throw new UnauthorizedException('That verification code is incorrect.');
    }
    await this.wipe(row.id);
    await this.auditChange(userId, 'auth.2fa.disabled', 'Turned off two-step verification.');
    return this.getStatus(userId);
  }

  /** Used by an owner to rescue a user who lost their second factor. */
  async resetForUser(userId: string): Promise<void> {
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId } });
    if (row) await this.wipe(row.id);
  }

  private async requireEnabled(userId: string): Promise<UserTwoFactor> {
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId } });
    if (!row?.enabled) {
      throw new BadRequestException('Two-step verification is not turned on.');
    }
    return row;
  }

  private async wipe(twoFactorId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { twoFactorId } }),
      this.prisma.userTwoFactor.update({
        where: { id: twoFactorId },
        data: {
          enabled: false,
          primaryMethod: null,
          totpSecret: null,
          totpConfirmedAt: null,
          emailOtpConfirmedAt: null,
          smsOtpPhone: null,
          smsOtpConfirmedAt: null,
          ...this.clearedChallenge(),
          lastUsedAt: null,
          lastUsedMethod: null,
        },
      }),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Login challenge
  // ---------------------------------------------------------------------------

  issuePendingToken(userId: string): string {
    return this.jwt.sign(
      { purpose: PENDING_TOKEN_PURPOSE, sub: userId },
      { expiresIn: PENDING_TOKEN_TTL },
    );
  }

  verifyPendingToken(token: string): string {
    let payload: { purpose?: string; sub?: string };
    try {
      payload = this.jwt.verify<{ purpose?: string; sub?: string }>(token);
    } catch {
      throw new UnauthorizedException('This sign-in attempt has expired. Start again.');
    }
    if (payload.purpose !== PENDING_TOKEN_PURPOSE || !payload.sub) {
      throw new UnauthorizedException('Invalid verification session.');
    }
    return payload.sub;
  }

  /** Sends an email/SMS code for an in-progress login. */
  async sendLoginOtp(
    pendingToken: string,
    method: 'email' | 'sms',
  ): Promise<CodeDispatchResult> {
    const userId = this.verifyPendingToken(pendingToken);
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId } });
    if (!row?.enabled) {
      throw new UnauthorizedException('Two-step verification is not turned on.');
    }
    return this.sendChallengeTo(userId, row, method);
  }

  /** Verifies the code for an in-progress login and returns the user id. */
  async verifyLoginCode(
    pendingToken: string,
    method: LoginTwoFactorMethod,
    code: string,
  ): Promise<string> {
    const userId = this.verifyPendingToken(pendingToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) {
      throw new UnauthorizedException('This sign-in attempt has expired. Start again.');
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException(
        'Too many failed attempts. Wait 15 minutes and sign in again.',
      );
    }
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId } });
    if (!row?.enabled) {
      throw new UnauthorizedException('Two-step verification is not turned on.');
    }

    const ok = await this.verifyForLogin(row, method, code);
    if (!ok) {
      // Wrong codes count across every method and every resend, so guessing
      // cannot be restarted by asking for a fresh code.
      const attempts = row.challengeAttempts + 1;
      if (attempts >= MAX_CHALLENGE_ATTEMPTS) {
        await this.prisma.$transaction([
          this.prisma.userTwoFactor.update({
            where: { id: row.id },
            data: this.clearedChallenge(),
          }),
          this.prisma.user.update({
            where: { id: userId },
            data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
          }),
        ]);
        await this.audit.record({
          actor: user,
          action: 'auth.locked',
          entityType: 'user',
          entityId: userId,
          summary: 'Account paused for 15 minutes after repeated wrong verification codes.',
        });
        throw new UnauthorizedException(
          'Too many failed attempts. Wait 15 minutes and sign in again.',
        );
      }
      await this.prisma.userTwoFactor.update({
        where: { id: row.id },
        data: { challengeAttempts: attempts },
      });
      throw new UnauthorizedException('That verification code is incorrect.');
    }

    await this.prisma.userTwoFactor.update({
      where: { id: row.id },
      data: {
        ...this.clearedChallenge(),
        lastUsedAt: new Date(),
        lastUsedMethod: method === 'recovery' ? null : (method as TwoFactorMethod),
      },
    });

    return userId;
  }

  maskedContacts(email: string | null, smsPhone: string | null) {
    return { maskedEmail: maskEmail(email), maskedPhone: maskPhone(smsPhone) };
  }

  /** The number SMS codes go to (may differ from the profile phone). */
  async smsPhoneFor(userId: string): Promise<string | null> {
    const row = await this.prisma.userTwoFactor.findUnique({
      where: { userId },
      select: { smsOtpPhone: true, smsOtpConfirmedAt: true },
    });
    return row?.smsOtpConfirmedAt ? row.smsOtpPhone : null;
  }

  // ---------------------------------------------------------------------------
  // Verification primitives
  // ---------------------------------------------------------------------------

  private verifyTotp(row: UserTwoFactor, code: string): boolean {
    if (!row.totpSecret) return false;
    try {
      return authenticator.verify({
        token: code.replace(/\s+/g, ''),
        secret: decryptSecret(row.totpSecret),
      });
    } catch {
      return false;
    }
  }

  private challengeValid(
    row: UserTwoFactor,
    method: TwoFactorMethod | null,
    code: string,
  ): boolean {
    return (
      !!row.challengeCodeHash &&
      (method === null || row.challengeMethod === method) &&
      !!row.challengeExpiresAt &&
      row.challengeExpiresAt.getTime() > Date.now() &&
      row.challengeCodeHash === sha256(code.trim())
    );
  }

  private async verifyRecoveryCode(row: UserTwoFactor, code: string): Promise<boolean> {
    const codeHash = sha256(code.trim().toUpperCase());
    // Claim it atomically so one code can never be spent twice.
    const claimed = await this.prisma.twoFactorRecoveryCode.updateMany({
      where: { twoFactorId: row.id, usedAt: null, codeHash },
      data: { usedAt: new Date() },
    });
    return claimed.count > 0;
  }

  /** For login: honours the method the user picked. */
  private async verifyForLogin(
    row: UserTwoFactor,
    method: LoginTwoFactorMethod,
    code: string,
  ): Promise<boolean> {
    if (method === 'totp') {
      return row.totpConfirmedAt ? this.verifyTotp(row, code) : false;
    }
    if (method === 'recovery') {
      return this.verifyRecoveryCode(row, code);
    }
    if (method === 'email') {
      return !!row.emailOtpConfirmedAt && this.challengeValid(row, TwoFactorMethod.email, code);
    }
    return !!row.smsOtpConfirmedAt && this.challengeValid(row, TwoFactorMethod.sms, code);
  }

  /** For management actions: accept any enrolled factor or a recovery code. */
  private async verifyAnyCode(row: UserTwoFactor, code: string): Promise<boolean> {
    if (row.totpConfirmedAt && this.verifyTotp(row, code)) return true;
    if (this.challengeValid(row, null, code)) return true;
    return this.verifyRecoveryCode(row, code);
  }

  private async consumeChallenge(
    row: UserTwoFactor,
    method: TwoFactorMethod,
    code: string,
  ): Promise<void> {
    if (row.challengeAttempts >= MAX_CHALLENGE_ATTEMPTS) {
      throw new UnauthorizedException('Too many attempts. Request a new code.');
    }
    if (!this.challengeValid(row, method, code)) {
      await this.prisma.userTwoFactor.update({
        where: { id: row.id },
        data: { challengeAttempts: { increment: 1 } },
      });
      throw new UnauthorizedException(
        'That code is incorrect or has expired. Request a new one.',
      );
    }
    await this.prisma.userTwoFactor.update({
      where: { id: row.id },
      data: this.clearedChallenge(),
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private clearedChallenge() {
    return {
      challengeCodeHash: null,
      challengeMethod: null,
      challengeExpiresAt: null,
      challengeAttempts: 0,
    };
  }

  private async sendChallengeTo(
    userId: string,
    row: UserTwoFactor,
    method: 'email' | 'sms',
  ): Promise<CodeDispatchResult> {
    const code = this.numericCode();
    if (method === 'email') {
      if (!row.emailOtpConfirmedAt) {
        throw new BadRequestException('Email codes are not set up for this account.');
      }
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, fullName: true },
      });
      await this.writeChallenge(row.id, TwoFactorMethod.email, code, true);
      return this.sendEmailCode(user, code);
    }
    if (!row.smsOtpConfirmedAt || !row.smsOtpPhone) {
      throw new BadRequestException('SMS codes are not set up for this account.');
    }
    await this.writeChallenge(row.id, TwoFactorMethod.sms, code, true);
    return this.sendSmsCode(row.smsOtpPhone, code);
  }

  private async sendEmailCode(
    user: { email: string; fullName: string },
    code: string,
  ): Promise<CodeDispatchResult> {
    const sent = await this.mail.send({
      to: user.email,
      toName: user.fullName,
      subject: 'Your DeltaSynk Portal verification code',
      html: twoFactorCodeEmail(user.fullName, code),
    });
    return this.dispatchResult(sent, `Email 2FA code for ${user.email}`, code);
  }

  private async sendSmsCode(phone: string, code: string): Promise<CodeDispatchResult> {
    const sent = await this.sms.send(
      phone,
      `Your DeltaSynk Portal verification code is ${code}. It expires in 10 minutes.`,
    );
    return this.dispatchResult(sent, `SMS 2FA code for ${phone}`, code);
  }

  private async finishActivation(
    userId: string,
    method: EnrollableTwoFactorMethod,
  ): Promise<ActivateResult> {
    const row = await this.prisma.userTwoFactor.findUniqueOrThrow({ where: { userId } });
    let recoveryCodes: string[] | undefined;
    if (!row.enabled) {
      recoveryCodes = await this.replaceRecoveryCodes(row.id);
      await this.prisma.userTwoFactor.update({
        where: { id: row.id },
        data: { enabled: true, primaryMethod: method as TwoFactorMethod },
      });
      await this.auditChange(
        userId,
        'auth.2fa.enabled',
        `Turned on two-step verification (${method}).`,
      );
    } else {
      await this.auditChange(
        userId,
        'auth.2fa.method_added',
        `Added the ${method} two-step method.`,
      );
    }
    return {
      status: await this.getStatus(userId),
      ...(recoveryCodes ? { recoveryCodes } : {}),
    };
  }

  private async auditChange(userId: string, action: string, summary: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true },
    });
    await this.audit.record({ actor, action, entityType: 'user', entityId: userId, summary });
  }

  private async replaceRecoveryCodes(twoFactorId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => this.recoveryCode());
    await this.prisma.$transaction([
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { twoFactorId } }),
      this.prisma.twoFactorRecoveryCode.createMany({
        data: codes.map((c) => ({ twoFactorId, codeHash: sha256(c) })),
      }),
    ]);
    return codes;
  }

  private async writeChallenge(
    twoFactorId: string,
    method: TwoFactorMethod,
    code: string,
    keepAttempts = false,
  ): Promise<void> {
    await this.prisma.userTwoFactor.update({
      where: { id: twoFactorId },
      data: {
        challengeCodeHash: sha256(code),
        challengeMethod: method,
        challengeExpiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
        ...(keepAttempts ? {} : { challengeAttempts: 0 }),
      },
    });
  }

  private async assertPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Your account password is incorrect.');
    }
  }

  private dispatchResult(sent: boolean, logLabel: string, code: string): CodeDispatchResult {
    if (sent) {
      return { message: 'Verification code sent.' };
    }
    if (this.mail.shouldExposeDevLinks()) {
      this.logger.log(`${logLabel}: ${code}`);
      return {
        message: 'Delivery is not configured — development code shown.',
        devCode: code,
      };
    }
    throw new BadRequestException(
      'We could not send the code. Try another verification method.',
    );
  }

  private numericCode(): string {
    const max = 10 ** OTP_DIGITS;
    return String(randomInt(0, max)).padStart(OTP_DIGITS, '0');
  }

  private recoveryCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const block = () =>
      Array.from({ length: 4 }, () => alphabet[randomInt(0, alphabet.length)]).join('');
    return `${block()}-${block()}`;
  }
}
