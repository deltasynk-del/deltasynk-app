import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  /** Email address or phone number. */
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
