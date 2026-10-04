import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class UpdateConnectedAppDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** The app's own API base, e.g. http://localhost:3020/api/v1. Empty string clears it. */
  @IsOptional()
  @ValidateIf((o: UpdateConnectedAppDto) => !!o.callbackBaseUrl)
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(300)
  callbackBaseUrl?: string;

  /** That app's platform key. Empty string clears it; omit to leave unchanged. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  callbackKey?: string;
}
