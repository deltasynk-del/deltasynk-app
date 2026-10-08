import { IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class GrantCreditsDto {
  /** The shop's id in SynkMart. */
  @IsUUID()
  shopId!: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  units!: number;

  /** Credits given without a payment always say why — it goes in the activity log. */
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note!: string;
}
