import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LabelItemDto {
  /** Present when editing an existing product: it keeps its barcode. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  /** How many labels to print for this product. */
  @IsInt()
  @Min(1)
  @Max(1000)
  copies!: number;
}

export class SaveLabelBatchDto {
  /** Staff note, e.g. the shop the labels are for. */
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional() @IsNumber() @Min(15) @Max(297) labelWidthMm?: number;
  @IsOptional() @IsNumber() @Min(10) @Max(297) labelHeightMm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(30) pageMarginMm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(30) gapMm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(30) rowGapMm?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LabelItemDto)
  items!: LabelItemDto[];
}

export class VoidLabelBatchDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

/** SynkMart → portal: a shop owner entered a label batch's claim code. */
export class ClaimLabelBatchDto {
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  tenantRef!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  tenantName!: string;
}
