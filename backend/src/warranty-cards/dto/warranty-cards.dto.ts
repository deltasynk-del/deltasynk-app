import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Card size and code positions. Positions are % of the card. */
export class WarrantyDesignDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;

  @IsOptional() @IsNumber() @Min(20) @Max(297) cardWidthMm?: number;
  @IsOptional() @IsNumber() @Min(20) @Max(297) cardHeightMm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(30) pageMarginMm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(30) gapMm?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100) qrX?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) qrY?: number;
  @IsOptional() @IsNumber() @Min(3) @Max(60) qrSize?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) barcodeX?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) barcodeY?: number;
  @IsOptional() @IsNumber() @Min(5) @Max(100) barcodeWidth?: number;
  @IsOptional() @IsNumber() @Min(3) @Max(80) barcodeHeight?: number;
  @IsOptional() @IsBoolean() showNumber?: boolean;
}

export class CreatePacksDto {
  @IsUUID()
  designId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  packCount!: number;

  @IsInt()
  @Min(1)
  @Max(500)
  cardsPerPack!: number;
}

export class VoidPackDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

/** SynkMart → portal: a shop owner entered a pack's claim code. */
export class ClaimPackDto {
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  code!: string;

  /** The shop's id in SynkMart. Claiming again with the same shop returns the same cards. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  tenantRef!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  tenantName!: string;
}
