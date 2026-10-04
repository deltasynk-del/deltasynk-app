import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AnyUser } from '../common/decorators/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import {
  DisableTwoFactorDto,
  EnrollableTwoFactorMethod,
  MethodActivateDto,
  RegenerateRecoveryDto,
  SetPrimaryDto,
  SmsInitDto,
} from './dto/two-factor.dto';
import { TwoFactorService } from './two-factor.service';

const METHODS: EnrollableTwoFactorMethod[] = ['totp', 'email', 'sms'];

/** A user's own two-step verification settings — every role may manage theirs. */
@Controller('auth/2fa')
@AnyUser()
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.twoFactor.getStatus(user.id);
  }

  @Post('totp/init')
  @HttpCode(HttpStatus.OK)
  totpInit(@CurrentUser() user: AuthenticatedUser) {
    return this.twoFactor.totpInit(user.id);
  }

  @Post('totp/activate')
  @HttpCode(HttpStatus.OK)
  totpActivate(@CurrentUser() user: AuthenticatedUser, @Body() dto: MethodActivateDto) {
    return this.twoFactor.totpActivate(user.id, dto.code);
  }

  @Post('email/init')
  @HttpCode(HttpStatus.OK)
  emailInit(@CurrentUser() user: AuthenticatedUser) {
    return this.twoFactor.emailInit(user.id);
  }

  @Post('email/activate')
  @HttpCode(HttpStatus.OK)
  emailActivate(@CurrentUser() user: AuthenticatedUser, @Body() dto: MethodActivateDto) {
    return this.twoFactor.emailActivate(user.id, dto.code);
  }

  @Post('sms/init')
  @HttpCode(HttpStatus.OK)
  smsInit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SmsInitDto) {
    return this.twoFactor.smsInit(user.id, dto.phone);
  }

  @Post('sms/activate')
  @HttpCode(HttpStatus.OK)
  smsActivate(@CurrentUser() user: AuthenticatedUser, @Body() dto: MethodActivateDto) {
    return this.twoFactor.smsActivate(user.id, dto.code);
  }

  /** Email/SMS code to confirm disabling 2FA or removing a method. */
  @Post('code/:method')
  @HttpCode(HttpStatus.OK)
  sendCode(@CurrentUser() user: AuthenticatedUser, @Param('method') method: string) {
    if (method !== 'email' && method !== 'sms') {
      throw new BadRequestException('Unknown method.');
    }
    return this.twoFactor.sendManagementCode(user.id, method);
  }

  @Patch('primary')
  setPrimary(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPrimaryDto) {
    return this.twoFactor.setPrimary(user.id, dto.method);
  }

  @Post('recovery-codes')
  @HttpCode(HttpStatus.OK)
  regenerate(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegenerateRecoveryDto) {
    return this.twoFactor.regenerateRecoveryCodes(user.id, dto.password);
  }

  @Delete('method/:method')
  removeMethod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('method') method: string,
    @Body() dto: DisableTwoFactorDto,
  ) {
    if (!METHODS.includes(method as EnrollableTwoFactorMethod)) {
      throw new BadRequestException('Unknown method.');
    }
    return this.twoFactor.removeMethod(
      user.id,
      method as EnrollableTwoFactorMethod,
      dto.password,
      dto.code,
    );
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  disable(@CurrentUser() user: AuthenticatedUser, @Body() dto: DisableTwoFactorDto) {
    return this.twoFactor.disable(user.id, dto.password, dto.code);
  }
}
