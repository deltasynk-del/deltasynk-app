import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** A rejection always says why — the customer is told. */
export class RejectDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note!: string;
}
