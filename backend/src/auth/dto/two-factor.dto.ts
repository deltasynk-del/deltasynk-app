import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export type LoginTwoFactorMethod = 'totp' | 'email' | 'sms' | 'recovery';
export type EnrollableTwoFactorMethod = 'totp' | 'email' | 'sms';

export class MethodActivateDto {
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  code!: string;
}

export class SmsInitDto {
  @IsOptional()
  @IsString()
  @MinLength(9)
  @MaxLength(30)
  phone?: string;
}

export class SetPrimaryDto {
  @IsIn(['totp', 'email', 'sms'])
  method!: EnrollableTwoFactorMethod;
}

export class RegenerateRecoveryDto {
  @IsString()
  @MinLength(1)
  password!: string;
}

/** Turning 2FA off (or removing a method) needs the password AND a current code. */
export class DisableTwoFactorDto {
  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  code!: string;
}

export class SendLoginOtpDto {
  @IsString()
  @MinLength(1)
  pendingToken!: string;

  @IsIn(['email', 'sms'])
  method!: 'email' | 'sms';
}

export class VerifyLoginOtpDto {
  @IsString()
  @MinLength(1)
  pendingToken!: string;

  @IsIn(['totp', 'email', 'sms', 'recovery'])
  method!: LoginTwoFactorMethod;

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  code!: string;
}
