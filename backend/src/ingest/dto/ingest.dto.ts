import { PaymentKind, PaymentRequestStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class IngestSenderIdDto {
  /** The request's id in the calling app. Sending the same id again updates it. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  externalId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  senderId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;

  /** School / shop asking for the sender ID. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  tenantName!: string;

  /** Slug or code of the school / shop. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenantRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  tenantPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  requestedByName?: string;

  @IsOptional()
  @IsEmail()
  requestedByEmail?: string;

  @IsOptional()
  @IsISO8601()
  requestedAt?: string;
}

export class IngestPaymentDto {
  @IsEnum(PaymentKind)
  kind!: PaymentKind;

  /** The payment / order reference in the calling app. Sending it again updates it. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  reference!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsString()
  @MaxLength(30)
  paymentMethod!: string;

  /**
   * PENDING = started; SUBMITTED = customer gave proof, please verify;
   * APPROVED / REJECTED = the app settled it itself (e.g. Selcom).
   */
  @IsEnum(PaymentRequestStatus)
  status!: PaymentRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tenantName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenantRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  planCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  billingCycle?: string;

  /** SMS credits being bought (top-ups). */
  @IsOptional()
  @IsInt()
  @Min(1)
  units?: number;

  /** Bank slip / transaction reference typed by the payer. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  payerName?: string;

  @IsOptional()
  @IsEmail()
  payerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  payerPhone?: string;

  @IsOptional()
  @IsISO8601()
  requestedAt?: string;
}
