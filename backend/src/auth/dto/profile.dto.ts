import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateSelfProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
