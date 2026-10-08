import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const WEBSITE_SERVICES = ['QUALITYSCHOOL', 'SYNKMART', 'MEDICALSYNK', 'HOTEL'] as const;
const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
const HARDWARE_STATUSES = ['REQUESTED', 'ISSUED', 'RETURNED', 'CANCELLED'] as const;

/** A pricing card. The website checks the details (codes, duplicates); every field is optional on update. */
export class PlanBodyDto {
  @IsOptional()
  @IsIn(WEBSITE_SERVICES)
  service?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  planName?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  planCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  duration?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  minStudents?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  maxStudents?: number | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  features?: string[];
}

/** A piece of equipment offered next to a product's plans. */
export class AddonBodyDto {
  @IsOptional()
  @IsIn(WEBSITE_SERVICES)
  service?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  addonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  freeFromMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  ownershipMonths?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;
}

/** Following a requested item through hand-over. */
export class HardwareUpdateDto {
  @IsOptional()
  @IsIn(HARDWARE_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shopSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
